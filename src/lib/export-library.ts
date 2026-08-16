import type { SavedCardRecord } from './saved-cards';
import type { SideSnapshot } from './session';
import type { CardSide } from './tfg-standards';
import { createZip, type ZipEntry } from './zip';
import { downloadBlob, shouldPreferShareForSave } from './export-image';

export const LIBRARY_ARCHIVE_FORMAT = 'tfg-centering-library';
export const LIBRARY_ARCHIVE_VERSION = 1;

export interface LibraryArchive {
  blob: Blob;
  filename: string;
  cardCount: number;
  imageCount: number;
}

export interface ArchiveProgress {
  done: number;
  total: number;
}

/** Cards sharing a name prefix, e.g. "5100/1" and "5100/2" both live in "5100". */
export interface CardGroup {
  /** Sub-folder path, or '' for cards saved without a group prefix. */
  key: string;
  label: string;
  cards: SavedCardRecord[];
}

interface ArchiveImage {
  bytes: Uint8Array<ArrayBuffer>;
  extension: string;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

function extensionForMime(mime: string): string {
  return MIME_EXTENSIONS[mime.toLowerCase()] ?? 'jpg';
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch (err) {
    throw new Error(`Failed to decode base64 image: ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}

/**
 * Take the stored image bytes as-is. Saved images are already the clean photo,
 * so copying them avoids a lossy canvas re-encode of the whole library.
 */
async function readImage(imageSrc: string): Promise<ArchiveImage> {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(imageSrc);
  if (match) {
    const [, mime, isBase64, payload] = match;
    const bytes = isBase64 ? base64ToBytes(payload) : new TextEncoder().encode(decodeURIComponent(payload));
    return { bytes, extension: extensionForMime(mime || 'image/jpeg') };
  }

  const blob = await (await fetch(imageSrc)).blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, extension: extensionForMime(blob.type || 'image/jpeg') };
}

function slug(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}

/** Card names use "/" as a group separator, e.g. "5100/1" → group "5100", card "1". */
function nameSegments(record: SavedCardRecord): string[] {
  const raw =
    record.label?.trim() ||
    record.session.front?.name?.trim() ||
    record.session.back?.name?.trim() ||
    '';
  return raw
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function cardGroupLabel(record: SavedCardRecord): string {
  const segments = nameSegments(record);
  return segments.length > 1 ? segments.slice(0, -1).join('/') : '';
}

/**
 * Bucket saved cards by their name prefix so a submission can be exported in
 * one piece. Groups keep the library's newest-first order; ungrouped cards
 * come last under an empty key.
 */
export function groupSavedCards(records: SavedCardRecord[]): CardGroup[] {
  const groups = new Map<string, CardGroup>();
  const ungrouped: SavedCardRecord[] = [];

  for (const record of records) {
    const label = cardGroupLabel(record);
    if (!label) {
      ungrouped.push(record);
      continue;
    }
    const key = slug(label, 'group');
    const existing = groups.get(key);
    if (existing) existing.cards.push(record);
    else groups.set(key, { key, label, cards: [record] });
  }

  const ordered = [...groups.values()];
  for (const group of ordered) {
    group.cards.sort((a, b) => {
      const aLeaf = nameSegments(a).at(-1) ?? a.label;
      const bLeaf = nameSegments(b).at(-1) ?? b.label;
      return aLeaf.localeCompare(bLeaf, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  if (ungrouped.length > 0) ordered.push({ key: '', label: 'Ungrouped', cards: ungrouped });
  return ordered;
}

/**
 * Archive path for a card: "5100/1" becomes "5100/1-front.jpg" so every card in
 * a submission sits in the same folder. Names that repeat get a numeric suffix.
 */
function archiveBasePath(record: SavedCardRecord, used: Set<string>): string {
  const segments = nameSegments(record).map((segment) => slug(segment, 'card'));
  const leaf = segments.pop() ?? 'card';
  const folder = segments.join('/');

  let base = folder ? `${folder}/${leaf}` : leaf;
  let attempt = 2;
  while (used.has(base)) {
    base = folder ? `${folder}/${leaf}-${attempt}` : `${leaf}-${attempt}`;
    attempt += 1;
  }
  used.add(base);
  return base;
}

function timestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(cells: Array<string | number | boolean>): string {
  return cells.map(csvCell).join(',');
}

const CSV_HEADER = [
  'group',
  'card',
  'saved_at',
  'side',
  'image',
  'grade',
  'grade_label',
  'left_mm',
  'right_mm',
  'top_mm',
  'bottom_mm',
  'left_pct',
  'right_pct',
  'top_pct',
  'bottom_pct',
  'lr_qualify',
  'tb_qualify',
  'worst_axis',
  'oc_eligible',
];

function csvRowForSide(
  record: SavedCardRecord,
  side: CardSide,
  snapshot: SideSnapshot,
  imagePath: string,
): string {
  const { bordersMm, leftRight, topBottom } = snapshot.result;
  const { grade } = snapshot;
  return csvRow([
    cardGroupLabel(record),
    record.label,
    new Date(record.savedAt).toISOString(),
    side,
    imagePath,
    grade.grade,
    grade.label,
    bordersMm.left.toFixed(2),
    bordersMm.right.toFixed(2),
    bordersMm.top.toFixed(2),
    bordersMm.bottom.toFixed(2),
    leftRight.left.toFixed(1),
    leftRight.right.toFixed(1),
    topBottom.top.toFixed(1),
    topBottom.bottom.toFixed(1),
    grade.lrQualify.toFixed(3),
    grade.tbQualify.toFixed(3),
    grade.worstAxis,
    grade.ocEligible,
  ]);
}

function manifestSide(snapshot: SideSnapshot, imagePath: string) {
  return {
    image: imagePath,
    name: snapshot.name,
    savedAt: snapshot.savedAt,
    savedAtIso: new Date(snapshot.savedAt).toISOString(),
    outer: snapshot.outer,
    inner: snapshot.inner,
    result: snapshot.result,
    grade: snapshot.grade,
  };
}

function readme(groups: string[], cardCount: number, imageCount: number, exportedAt: Date): string {
  const folders = groups.length > 0 ? groups.map((g) => `  ${g}/`).join('\n') : '  (none — cards are named without a group)';
  return [
    'Tree Frog Grading — card library export',
    '',
    `Exported: ${exportedAt.toLocaleString()}`,
    `Cards: ${cardCount}`,
    `Images: ${imageCount}`,
    '',
    'Layout',
    '------',
    'Cards named "group/card" are filed together, so 5100/1 and 5100/2 both end',
    'up in the 5100 folder:',
    '',
    '  5100/1-front.jpg',
    '  5100/1-back.jpg',
    '  5100/2-front.jpg',
    '',
    'Cards saved without a "/" in the name sit at the top level of the archive.',
    '',
    'Folders in this export:',
    folders,
    '',
    'Other files',
    '-----------',
    'summary.csv',
    '    One row per graded side: group, card, border widths in mm, centering',
    '    percentages, qualify ratios and the TFG grade. Opens in any spreadsheet.',
    'library.json',
    `    Full machine-readable backup (format "${LIBRARY_ARCHIVE_FORMAT}",`,
    `    version ${LIBRARY_ARCHIVE_VERSION}). Holds every card id, label and the`,
    '    card-edge / artwork rectangles, so a card can be restored exactly as it',
    '    was graded. Image pixels live in the files above, referenced by the',
    '    "image" field of each side.',
    '',
    'Keep the whole folder together — library.json is only useful alongside the',
    'images it points at.',
    '',
  ].join('\n');
}

/**
 * Bundle saved cards into a single .zip: the photos grouped by card name, a CSV
 * summary and a JSON backup.
 */
export async function buildLibraryArchive(
  records: SavedCardRecord[],
  onProgress?: (progress: ArchiveProgress) => void,
): Promise<LibraryArchive> {
  if (records.length === 0) throw new Error('No saved cards to export');

  const exportedAt = new Date();
  const groups = groupSavedCards(records);
  const ordered = groups.flatMap((group) => group.cards);
  const folders = groups.filter((group) => group.key).map((group) => group.key);

  const entries: ZipEntry[] = [];
  const csvLines = [csvRow(CSV_HEADER)];
  const manifestCards: unknown[] = [];
  const usedPaths = new Set<string>();
  let imageCount = 0;

  const total = ordered.length;
  onProgress?.({ done: 0, total });

  for (const [index, record] of ordered.entries()) {
    const basePath = archiveBasePath(record, usedPaths);
    const sides: Record<string, unknown> = {};

    for (const side of ['front', 'back'] as CardSide[]) {
      const snapshot = record.session[side];
      if (!snapshot) continue;

      try {
        const { bytes, extension } = await readImage(snapshot.imageSrc);
        const imagePath = `${basePath}-${side}.${extension}`;
        entries.push({ name: imagePath, data: bytes, date: new Date(snapshot.savedAt) });
        csvLines.push(csvRowForSide(record, side, snapshot, imagePath));
        sides[side] = manifestSide(snapshot, imagePath);
        imageCount += 1;
      } catch (err) {
        console.warn(`Skipping corrupted image for card ${record.label} (${side}):`, err);
      }
    }

    manifestCards.push({
      id: record.id,
      label: record.label,
      group: cardGroupLabel(record),
      savedAt: record.savedAt,
      savedAtIso: new Date(record.savedAt).toISOString(),
      sides,
    });

    onProgress?.({ done: index + 1, total });
    // Yield so the progress label repaints between cards.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const manifest = {
    format: LIBRARY_ARCHIVE_FORMAT,
    version: LIBRARY_ARCHIVE_VERSION,
    exportedAt: exportedAt.toISOString(),
    cardCount: ordered.length,
    imageCount,
    groups: folders,
    cards: manifestCards,
  };

  entries.unshift(
    { name: 'README.txt', data: readme(folders, ordered.length, imageCount, exportedAt), date: exportedAt },
    { name: 'library.json', data: JSON.stringify(manifest, null, 2), date: exportedAt },
    { name: 'summary.csv', data: `${csvLines.join('\n')}\n`, date: exportedAt },
  );

  const onlyGroup = groups.length === 1 && groups[0].key ? groups[0].key : null;

  return {
    blob: createZip(entries),
    filename: `tfg-${onlyGroup ?? 'library'}-${timestamp(exportedAt)}.zip`,
    cardCount: ordered.length,
    imageCount,
  };
}

/**
 * Save an archive of the given cards. iPhones and installed web apps get the
 * share sheet ("Save to Files"), because a silent download click usually does
 * nothing there.
 */
export async function exportLibraryZip(
  records: SavedCardRecord[],
  onProgress?: (progress: ArchiveProgress) => void,
): Promise<{ result: 'shared' | 'downloaded' } & LibraryArchive> {
  const archive = await buildLibraryArchive(records, onProgress);

  if (shouldPreferShareForSave()) {
    try {
      const file = new File([archive.blob], archive.filename, { type: 'application/zip' });
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'TFG card library' });
        return { ...archive, result: 'shared' };
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      // Fall through to a normal download attempt.
    }
  }

  downloadBlob(archive.blob, archive.filename);
  return { ...archive, result: 'downloaded' };
}
