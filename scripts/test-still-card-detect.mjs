/**
 * Whole-image still detection: card off-centre on a phone-aspect frame.
 * Run: node scripts/test-still-card-detect.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'tfg-still-'));
const runner = join(dir, 'run.ts');

writeFileSync(
  runner,
  `
import { CARD_ASPECT } from '${join(root, 'src/lib/card-edge-detect.ts').replace(/\\\\/g, '/')}';
import { detectOuterRectWholeImage } from '${join(root, 'src/lib/still-card-detect.ts').replace(/\\\\/g, '/')}';
import { seedInnerRect } from '${join(root, 'src/lib/inner-artwork.ts').replace(/\\\\/g, '/')}';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function fillRectPx(
  data: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: [number, number, number],
) {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(w, Math.ceil(x1));
  const bottom = Math.min(data.length / (w * 4), Math.ceil(y1));
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * w + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
}

function iou(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

const w = 360;
const h = 640;
const data = new Uint8ClampedArray(w * h * 4);
fillRectPx(data, w, 0, 0, w, h, [42, 36, 30]);

const cardW = 150;
const cardH = Math.round(cardW / CARD_ASPECT);
const outer = { x: 40, y: 280, width: cardW, height: cardH };
fillRectPx(data, w, outer.x, outer.y, outer.x + outer.width, outer.y + outer.height, [236, 232, 224]);

const inner = {
  x: outer.x + 14,
  y: outer.y + 16,
  width: outer.width - 14 - 10,
  height: outer.height - 16 - 22,
};
fillRectPx(data, w, inner.x, inner.y, inner.x + inner.width, inner.y + inner.height, [40, 110, 190]);

const image = { width: w, height: h, data };
const found = detectOuterRectWholeImage(image, CARD_ASPECT);
assert(found, 'expected whole-image outer box');
assert(iou(found!, outer) >= 0.7, 'outer IoU too low: ' + JSON.stringify(found) + ' vs ' + JSON.stringify(outer));

const seeded = seedInnerRect(image, found!);
assert(seeded.confidence >= 0.5, 'inner should lock, got ' + seeded.confidence);
assert(Math.abs(seeded.inner.x - inner.x) <= 6, 'inner left ' + seeded.inner.x);

console.log('ok - off-centre phone still', found);
console.log('ok - inner from detected outer', seeded.inner);
console.log('All still-card detection checks passed.');
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
