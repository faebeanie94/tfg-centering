/**
 * Regression checks for auto-crop corner detection + rect seeding.
 * Run: node scripts/test-auto-crop.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'tfg-autocrop-'));
const runner = join(dir, 'run.ts');

writeFileSync(
  runner,
  `
import { OUTPUT_PADDING_RATIO } from '${join(root, 'src/lib/perspective.ts').replace(/\\\\/g, '/')}';
import {
  boxToCorners,
  defaultRectsAfterCrop,
  AUTO_CROP_CONFIDENCE,
  isNearlyFrontal,
} from '${join(root, 'src/lib/auto-crop.ts').replace(/\\\\/g, '/')}';
import {
  CARD_ASPECT,
  detectCardFrameFromImageData,
  guideTemplateForDistance,
} from '${join(root, 'src/lib/card-edge-detect.ts').replace(/\\\\/g, '/')}';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

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

const w = 240;
const h = 426;
const template = guideTemplateForDistance(20);
const card = {
  left: 0.5 - template.width / 2,
  top: 0.36 - template.height / 2,
  width: template.width,
  height: template.height,
};

const data = new Uint8ClampedArray(w * h * 4);
fillRect(data, w, h, 0, 0, 1, 1, [30, 30, 32]);
fillRect(data, w, h, card.left, card.top, card.left + card.width, card.top + card.height, [210, 200, 190]);

const found = detectCardFrameFromImageData(data, w, h, {
  cx: 0.5,
  cy: 0.36,
  expectedWidth: template.width,
  expectedHeight: template.height,
});
assert(found, 'expected card detection');

const corners = boxToCorners(found!.box, 1200, 1600, 0);
assert(corners.tl.x < corners.tr.x, 'tl left of tr');
assert(corners.bl.x < corners.br.x, 'bl left of br');
assert(corners.tl.y < corners.bl.y, 'tl above bl');
assert(corners.tr.y < corners.br.y, 'tr above br');

const cardW = Math.abs(corners.tr.x - corners.tl.x) / 1200;
const cardH = Math.abs(corners.bl.y - corners.tl.y) / 1600;
assert(Math.abs(cardW / cardH - found!.box.width / found!.box.height) < 0.01, 'corner spans match box');
assert(Math.abs(found!.box.width / found!.box.height - CARD_ASPECT) < 0.08, 'detected box aspect');
assert(corners.tl.x > 0 && corners.br.x < 1200, 'corners inside image');
assert(cardW > 0.2 && cardH > 0.2, 'corners cover a meaningful card area');

const outW = 800;
const outH = Math.round(outW / CARD_ASPECT);
const rects = defaultRectsAfterCrop(outW, outH);
const expectedPadX = outW * OUTPUT_PADDING_RATIO / (1 + 2 * OUTPUT_PADDING_RATIO);
assert(Math.abs(rects.outer.x - expectedPadX) < 1, 'outer pad x');
assert(rects.inner.x > rects.outer.x, 'inner inset');
assert(rects.inner.width < rects.outer.width, 'inner narrower');
assert(AUTO_CROP_CONFIDENCE > 0.5 && AUTO_CROP_CONFIDENCE < 0.95, 'confidence gate sane');

// Live scanner AABB for a tilted card must not look "frontal".
const tilted = boxToCorners(
  { left: 0.3, top: 0.2, width: 0.35, height: 0.35 / CARD_ASPECT },
  1200,
  1600,
  18,
);
assert(!isNearlyFrontal(tilted), 'rotated AABB must fail frontal gate');

console.log('ok - boxToCorners', corners);
console.log('ok - defaultRectsAfterCrop', rects);
console.log('ok - confidence gate', AUTO_CROP_CONFIDENCE);
console.log('ok - tilted live AABB rejected by frontal gate');
console.log('All auto-crop checks passed.');
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
