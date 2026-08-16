/**
 * Whole-image card detector: off-center, low-chroma, and aspect gates.
 * Run: node scripts/test-card-detector.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'tfg-detector-'));
const runner = join(dir, 'run.ts');

writeFileSync(
  runner,
  `
import { CARD_ASPECT } from '${join(root, 'src/lib/card-edge-detect.ts').replace(/\\\\/g, '/')}';
import {
  detectCardFromImageData,
  findCardCandidates,
} from '${join(root, 'src/lib/card-detector.ts').replace(/\\\\/g, '/')}';
import { AUTO_CROP_CONFIDENCE, DETECT_CONFIRM_CONFIDENCE } from '${join(root, 'src/lib/auto-crop.ts').replace(/\\\\/g, '/')}';

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

function makeFrame(
  w: number,
  h: number,
  card: { left: number; top: number; width: number; height: number },
  bg: [number, number, number],
  fg: [number, number, number],
) {
  const data = new Uint8ClampedArray(w * h * 4);
  fillRect(data, w, h, 0, 0, 1, 1, bg);
  fillRect(data, w, h, card.left, card.top, card.left + card.width, card.top + card.height, fg);
  return data;
}

function overlaps(
  box: { left: number; top: number; width: number; height: number },
  card: { left: number; top: number; width: number; height: number },
) {
  const ix = Math.min(box.left + box.width, card.left + card.width) - Math.max(box.left, card.left);
  const iy = Math.min(box.top + box.height, card.top + card.height) - Math.max(box.top, card.top);
  if (ix <= 0 || iy <= 0) return 0;
  return (ix * iy) / (card.width * card.height);
}

const w = 320;
const h = 568;
const height = 0.52;
const width = height * CARD_ASPECT;

// Centered light card on dark desk — regression.
const centered = { left: 0.5 - width / 2, top: 0.36 - height / 2, width, height };
const centeredData = makeFrame(w, h, centered, [30, 30, 32], [210, 200, 190]);
const centeredHits = findCardCandidates(centeredData, w, h, CARD_ASPECT);
assert(centeredHits.length > 0, 'centered card should produce candidates');
assert(overlaps(centeredHits[0].box, centered) > 0.7, 'centered candidate should cover the card');
const centeredDetect = detectCardFromImageData(centeredData, w, h, { cardAspect: CARD_ASPECT });
assert(centeredDetect, 'centered detect');
assert(centeredDetect!.confidence >= DETECT_CONFIRM_CONFIDENCE, 'centered confidence');

// Off-center card — the failure mode of cx=0.5 seeds.
const off = { left: 0.58, top: 0.22, width, height };
const offData = makeFrame(w, h, off, [28, 28, 30], [200, 196, 188]);
const offHits = findCardCandidates(offData, w, h, CARD_ASPECT);
assert(offHits.length > 0, 'off-center card should produce candidates');
assert(overlaps(offHits[0].box, off) > 0.65, 'off-center candidate should cover the card');
const offDetect = detectCardFromImageData(offData, w, h, { cardAspect: CARD_ASPECT });
assert(offDetect, 'off-center detect');
assert(offDetect!.confidence >= DETECT_CONFIRM_CONFIDENCE, 'off-center confidence');

// Dark / grey card on light paper — chroma must not kill detection.
const darkCard = { left: 0.18, top: 0.2, width, height };
const darkData = makeFrame(w, h, darkCard, [230, 230, 228], [42, 42, 44]);
const darkHits = findCardCandidates(darkData, w, h, CARD_ASPECT);
assert(darkHits.length > 0, 'dark card on light bg should produce candidates');
assert(overlaps(darkHits[0].box, darkCard) > 0.65, 'dark card candidate should cover the card');
const darkDetect = detectCardFromImageData(darkData, w, h, { cardAspect: CARD_ASPECT });
assert(darkDetect, 'dark card detect');
assert(darkDetect!.confidence >= DETECT_CONFIRM_CONFIDENCE, 'dark card confidence');

// Wide rectangle (paper pad) — reject before refinement.
const paper = { left: 0.08, top: 0.12, width: 0.84, height: 0.84 / 0.833 };
const paperData = makeFrame(w, h, paper, [20, 20, 22], [240, 238, 230]);
const paperHits = findCardCandidates(paperData, w, h, CARD_ASPECT);
assert(
  paperHits.every((c) => Math.abs(c.box.width / c.box.height - 0.833) > 0.05),
  'implausible 0.833 aspect must not be a card candidate',
);

assert(AUTO_CROP_CONFIDENCE === 0.85, 'mode A threshold');
assert(DETECT_CONFIRM_CONFIDENCE === 0.6, 'mode B/C threshold');

console.log('ok - centered', centeredHits[0].box);
console.log('ok - off-center', offHits[0].box);
console.log('ok - dark card', darkHits[0].box);
console.log('ok - paper pad rejected', paperHits.length);
console.log('All card-detector checks passed.');
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
