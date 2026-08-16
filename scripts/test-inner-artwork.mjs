/**
 * Regression checks for inner artwork (yellow handle) seeding.
 * Run: node scripts/test-inner-artwork.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'tfg-inner-art-'));
const runner = join(dir, 'run.ts');

writeFileSync(
  runner,
  `
import { defaultInnerRect } from '${join(root, 'src/lib/centering.ts').replace(/\\\\/g, '/')}';
import {
  detectInnerArtwork,
  seedInnerRect,
} from '${join(root, 'src/lib/inner-artwork.ts').replace(/\\\\/g, '/')}';

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

const w = 400;
const h = 560;
const data = new Uint8ClampedArray(w * h * 4);
fillRectPx(data, w, 0, 0, w, h, [12, 12, 14]);

const outer = { x: 40, y: 40, width: 320, height: 480 };
fillRectPx(data, w, outer.x, outer.y, outer.x + outer.width, outer.y + outer.height, [220, 218, 210]);

const trueInner = {
  x: outer.x + 32,
  y: outer.y + 38,
  width: 320 - 32 - 20,
  height: 480 - 38 - 58,
};
fillRectPx(
  data,
  w,
  trueInner.x,
  trueInner.y,
  trueInner.x + trueInner.width,
  trueInner.y + trueInner.height,
  [48, 92, 160],
);

const image = { width: w, height: h, data };
const detected = detectInnerArtwork(image, outer);
const seeded = seedInnerRect(image, outer);
const fallback = defaultInnerRect(outer);

assert(detected.confidence >= 0.5, 'should lock at least two sides, got ' + detected.confidence);
assert(seeded.inner.x !== fallback.x || Math.abs(seeded.inner.x - trueInner.x) < 6, 'must not stay on 8% inset when art is offset');
assert(Math.abs(seeded.inner.x - trueInner.x) <= 4, 'left inset, got ' + seeded.inner.x + ' want ' + trueInner.x);
assert(Math.abs(seeded.inner.x + seeded.inner.width - (trueInner.x + trueInner.width)) <= 4, 'right inset');
assert(Math.abs(seeded.inner.y - trueInner.y) <= 4, 'top inset, got ' + seeded.inner.y);
assert(Math.abs(seeded.inner.y + seeded.inner.height - (trueInner.y + trueInner.height)) <= 4, 'bottom inset');

const leftBorder = seeded.inner.x - outer.x;
const rightBorder = outer.x + outer.width - (seeded.inner.x + seeded.inner.width);
assert(Math.abs(leftBorder - rightBorder) > 6, 'asymmetric L/R should not look 50/50');

const flat = new Uint8ClampedArray(w * h * 4);
fillRectPx(flat, w, 0, 0, w, h, [12, 12, 14]);
fillRectPx(flat, w, outer.x, outer.y, outer.x + outer.width, outer.y + outer.height, [200, 200, 200]);
const noArt = seedInnerRect({ width: w, height: h, data: flat }, outer);
assert(noArt.confidence < 0.5, 'uniform card should not claim an inner box');
assert(Math.abs(noArt.inner.x - fallback.x) < 0.5, 'uniform card falls back to 8% inset');

console.log('ok - detectInnerArtwork', detected);
console.log('ok - seedInnerRect', seeded.inner);
console.log('ok - uniform fallback', noArt.inner);
console.log('All inner-artwork checks passed.');
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
