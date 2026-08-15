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
const card = {
  left: 0.5 - template.width / 2,
  top: 0.36 - template.height / 2,
  width: template.width,
  height: template.height,
};
const search = {
  cx: 0.5,
  cy: 0.36,
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
