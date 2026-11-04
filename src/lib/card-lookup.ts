/**
 * Client for the tfg-card-lookup service: identifies a card from game + set +
 * number and returns the centering layout it should be graded with.
 * See the tfg-card-lookup README for the full API.
 */

import { BUILT_IN_PROFILES, isValidTarget, type LayoutProfile } from './layout-profiles';

export const LOOKUP_GAMES = [
  { code: 'pokemon', label: 'Pokémon', numberHint: '217 or 217/182' },
  { code: 'mtg', label: 'Magic', numberHint: '0394' },
  { code: 'yugioh', label: 'Yu-Gi-Oh!', numberHint: 'LOB-EN001' },
  { code: 'lorcana', label: 'Lorcana', numberHint: '207' },
  { code: 'onepiece', label: 'One Piece', numberHint: 'OP01-120' },
] as const;

export type LookupGame = (typeof LOOKUP_GAMES)[number]['code'];

export interface LookupCard {
  uid: string;
  name: string;
  set: string;
  number: string;
  rarity: string | null;
  imageUrl: string | null;
  pageUrl: string | null;
}

export interface LookupLayout {
  id: string;
  label: string;
  topTarget: number;
  leftTarget: number;
  hint: string | null;
}

export type LookupResult =
  | {
      status: 'resolved';
      card: LookupCard;
      layout: LookupLayout;
      matched: boolean;
      matchedOn: string[];
      needsLayout: boolean;
      message?: string;
      measuring: { imageUrl: string | null; pageUrl: string | null; hint: string | null };
    }
  | { status: 'candidates' | 'not_found'; candidates: LookupCard[] };

export class LookupError extends Error {}

const TIMEOUT_MS = 8000;

export async function resolveCentering(
  baseUrl: string,
  query: { game: string; set: string; number: string; language?: string },
): Promise<LookupResult> {
  const url = new URL(baseUrl.replace(/\/+$/, '') + '/v1/centering/resolve');
  url.searchParams.set('game', query.game);
  if (query.set.trim()) url.searchParams.set('set', query.set.trim());
  url.searchParams.set('number', query.number.trim());
  url.searchParams.set('language', query.language ?? 'en');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch {
    throw new LookupError("Couldn't reach the card lookup service. Check the URL in Settings.");
  } finally {
    clearTimeout(timer);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new LookupError(`Card lookup answered ${response.status} without JSON.`);
  }
  const data = body as Record<string, unknown>;
  if (!response.ok && response.status !== 404) {
    throw new LookupError(typeof data.error === 'string' ? data.error : `Card lookup failed (${response.status}).`);
  }
  if (data.status !== 'resolved' && data.status !== 'candidates' && data.status !== 'not_found') {
    throw new LookupError('Unexpected answer from the card lookup service.');
  }
  return data as unknown as LookupResult;
}

/**
 * The app profile to select for a lookup layout. Known ids (built-in or saved
 * here) are reused; a borderless layout this app doesn't have yet becomes a
 * saved profile with the same id, so both tools agree from then on.
 */
export function profileForLookup(
  layout: LookupLayout,
  custom: LayoutProfile[],
): { profileId: string; addProfile: LayoutProfile | null } {
  const known = [...BUILT_IN_PROFILES, ...custom].find((p) => p.id === layout.id);
  if (known) return { profileId: known.id, addProfile: null };

  if (!isValidTarget(layout.topTarget) || !isValidTarget(layout.leftTarget)) {
    return { profileId: 'bordered', addProfile: null };
  }
  return {
    profileId: layout.id,
    addProfile: {
      id: layout.id,
      label: layout.label,
      tbTarget: layout.topTarget,
      lrTarget: layout.leftTarget,
      hint: layout.hint ?? undefined,
      source: 'tfg-card-lookup',
    },
  };
}
