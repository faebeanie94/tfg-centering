/**
 * Synthetic regression checks for scanner card detection.
 * Run: node scripts/test-card-edge-detect.mjs
 *
 * Builds RGBA frames in-memory (no canvas) and calls the TS detector via a
 * small inline port of the public API compiled through dynamic import of the
 * source after esbuild-bundle, or falls back to spawning npx tsx.
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'tfg-detect-'));
const runner = join(dir, 'run.ts');

writeFileSync(
  runner,
  `
import {
  CARD_ASPECT,
  detectCardFrameFromImageData,
  guideTemplateForDistance,
} from '${join(root, 'src/lib/card-edge-detect.ts').replace(/\\\\/g, '/')}';

function fillRect(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  rgb: [number, number, number],
) {
  const x0 = Math.max(0, Math.floor(left * w));
  const y0 = Math.max(0, Math.floor(top * h));
  const x1 = Math.min(w, Math.ceil(right * w));
  const y1 = Math.min(h, Math.ceil(bottom * h));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
}

function makeFrame(w: number, h: number, bg: [number, number, number], card: {
  left: number; top: number; width: number; height: number;
  body: [number, number, number];
  glare?: boolean;
}) {
  const data = new Uint8ClampedArray(w * h * 4);
  fillRect(data, w, h, 0, 0, 1, 1, bg);
  const { left, top, width, height, body } = card;
  fillRect(data, w, h, left, top, left + width, top + height, body);
  // Inner artwork darker than the rim — mimics a TCG face.
  fillRect(
    data, w, h,
    left + width * 0.08, top + height * 0.08,
    left + width * 0.92, top + height * 0.92,
    [Math.max(0, body[0] - 80), Math.max(0, body[1] - 40), Math.max(0, body[2] - 20)],
  );
  if (card.glare) {
    // Diagonal bright streaks across the card (holo glare).
    for (let i = 0; i < 5; i++) {
      const gx0 = left + width * (0.1 + i * 0.15);
      fillRect(
        data, w, h,
        gx0, top + height * 0.05,
        gx0 + width * 0.06, top + height * 0.95,
        [245, 250, 255],
      );
    }
  }
  return data;
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function overlaps(a: { left: number; top: number; width: number; height: number }, b: typeof a, minIoU = 0.45) {
  const x0 = Math.max(a.left, b.left);
  const y0 = Math.max(a.top, b.top);
  const x1 = Math.min(a.left + a.width, b.left + b.width);
  const y1 = Math.min(a.top + a.height, b.top + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.width * a.height + b.width * b.height - inter;
  return inter / union >= minIoU;
}

const w = 240;
const h = 426;
const template = guideTemplateForDistance(20);
assert(template.height > 0.7, 'default 20cm guide should fill most of the frame, got ' + template.height);
const portraitGuide = guideTemplateForDistance(20, CARD_ASPECT, 88.9, 3 / 4, 0);
assert(
  Math.abs(portraitGuide.width / portraitGuide.height - CARD_ASPECT / (3 / 4)) < 0.03,
  'portrait frame guide should match poker aspect',
);
assert(portraitGuide.width > template.width, 'portrait video makes the dashed card wider');
const card = {
  left: 0.5 - template.width / 2,
  top: Math.max(0.02, 0.5 - template.height / 2),
  width: template.width,
  height: template.height,
};
const search = {
  cx: card.left + card.width / 2,
  cy: card.top + card.height / 2,
  expectedWidth: template.width,
  expectedHeight: template.height,
};

const cases: Array<{ name: string; bg: [number, number, number]; body: [number, number, number]; glare?: boolean; whiteRim?: boolean }> = [
  { name: 'dark desk', bg: [28, 30, 32], body: [210, 200, 190] },
  { name: 'white paper', bg: [236, 238, 242], body: [190, 70, 55] },
  { name: 'white paper + holo glare', bg: [236, 238, 242], body: [190, 70, 55], glare: true },
  { name: 'white rim + holo glare', bg: [236, 238, 242], body: [190, 70, 55], glare: true, whiteRim: true },
  { name: 'light wood', bg: [188, 160, 120], body: [40, 90, 150] },
];

let failed = 0;
for (const c of cases) {
  const rim = c.whiteRim ? ([248, 248, 250] as [number, number, number]) : c.body;
  const data = makeFrame(w, h, c.bg, { ...card, body: rim, glare: c.glare });
  if (c.whiteRim) {
    // Recreate with white rim + darker artwork (TCG-like).
    fillRect(data, w, h, 0, 0, 1, 1, c.bg);
    fillRect(data, w, h, card.left, card.top, card.left + card.width, card.top + card.height, rim);
    fillRect(
      data, w, h,
      card.left + card.width * 0.06, card.top + card.height * 0.06,
      card.left + card.width * 0.94, card.top + card.height * 0.94,
      c.body,
    );
    if (c.glare) {
      for (let i = 0; i < 5; i++) {
        const gx0 = card.left + card.width * (0.1 + i * 0.15);
        fillRect(
          data, w, h,
          gx0, card.top + card.height * 0.05,
          gx0 + card.width * 0.06, card.top + card.height * 0.95,
          [245, 250, 255],
        );
      }
    }
  }
  const found = detectCardFrameFromImageData(data, w, h, search);
  try {
    assert(found, \`\${c.name}: expected a detection\`);
    assert(overlaps(found!.box, card), \`\${c.name}: box IoU too low (\${JSON.stringify(found!.box)})\`);
    console.log('ok -', c.name, found!.box);
  } catch (e) {
    failed++;
    console.error('FAIL -', (e as Error).message);
  }
}

// Small guide search must still lock the OUTER card, not the inner artwork
// (the live bug: dashed/green boxes sitting in the middle of a TCG).
{
  const outer = { left: 0.18, top: 0.12, width: 0.52, height: 0.52 / CARD_ASPECT };
  const inner = {
    left: outer.left + outer.width * 0.12,
    top: outer.top + outer.height * 0.1,
    width: outer.width * 0.76,
    height: outer.height * 0.78,
  };
  const data = makeFrame(w, h, [22, 24, 26], {
    left: outer.left,
    top: outer.top,
    width: outer.width,
    height: outer.height,
    body: [240, 210, 40],
  });
  fillRect(
    data, w, h,
    inner.left, inner.top, inner.left + inner.width, inner.top + inner.height,
    [180, 50, 40],
  );
  const found = detectCardFrameFromImageData(data, w, h, {
    cx: inner.left + inner.width / 2,
    cy: inner.top + inner.height / 2,
    expectedWidth: inner.width,
    expectedHeight: inner.height,
    cardAspect: CARD_ASPECT,
  });
  try {
    assert(found, 'inner-vs-outer: expected a detection');
    assert(overlaps(found!.box, outer, 0.55), 'inner-vs-outer: must track the card rim, got ' + JSON.stringify(found!.box));
    assert(!overlaps(found!.box, inner, 0.85), 'inner-vs-outer: must not collapse to the artwork box');
    console.log('ok - outer rim over inner artwork', found!.box);
  } catch (e) {
    failed++;
    console.error('FAIL -', (e as Error).message);
  }
}

// Empty bright frame should not invent a card.
{
  const data = makeFrame(w, h, [240, 240, 240], {
    left: 0, top: 0, width: 0, height: 0, body: [240, 240, 240],
  });
  // Overwrite: solid background only
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 240; data[i + 1] = 240; data[i + 2] = 240; data[i + 3] = 255;
  }
  const found = detectCardFrameFromImageData(data, w, h, search);
  if (found && overlaps(found.box, card, 0.3)) {
    failed++;
    console.error('FAIL - empty frame should not look like the guide card');
  } else {
    console.log('ok - empty bright frame rejected or non-matching');
  }
}

// Flattened / close-up still: card-aspect canvas with ~8% pad (normalized box is ~square).
{
  const cw = 400;
  const ch = Math.round(cw / CARD_ASPECT);
  const pad = 0.08;
  const still = {
    left: pad,
    top: pad,
    width: 1 - pad * 2,
    height: 1 - pad * 2,
  };
  const data = makeFrame(cw, ch, [18, 18, 22], {
    left: still.left,
    top: still.top,
    width: still.width,
    height: still.height,
    body: [210, 200, 190],
  });
  const found = detectCardFrameFromImageData(data, cw, ch, {
    cx: 0.5,
    cy: 0.5,
    expectedWidth: still.width,
    expectedHeight: still.height,
    cardAspect: CARD_ASPECT,
  });
  try {
    assert(found, 'padded still: expected a detection');
    assert(overlaps(found!.box, still, 0.55), 'padded still: box IoU too low (' + JSON.stringify(found!.box) + ')');
    console.log('ok - padded card-aspect still', found!.box);
  } catch (e) {
    failed++;
    console.error('FAIL -', (e as Error).message);
  }
}

if (failed) {
  console.error(failed, 'failure(s)');
  process.exit(1);
}
console.log('All card-edge detection checks passed.');
`,
);

const result = spawnSync('npx', ['--yes', 'tsx', runner], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
  env: { ...process.env, NPM_CONFIG_YES: 'true' },
});

try {
  unlinkSync(runner);
} catch {
  /* ignore */
}

process.exit(result.status ?? 1);
