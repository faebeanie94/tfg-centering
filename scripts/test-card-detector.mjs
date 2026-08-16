/**
 * Synthetic checks for Hough-style card candidate generation.
 * Run: node scripts/test-card-detector.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'tfg-card-detector-'));
const runner = join(dir, 'run.ts');

writeFileSync(
  runner,
  `
import {
  buildEdgeMap,
  findCardCandidates,
  findStrongLines,
  generateEdgeMap,
  lineIntersection,
  lineIsHorizontal,
  lineIsVertical,
  lumaFromRgba,
} from '${join(root, 'src/lib/card-detector.ts').replace(/\\\\/g, '/')}';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function fillRect(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: [number, number, number],
) {
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

function makeCardLuma() {
  const w = 240;
  const h = 180;
  const data = new Uint8ClampedArray(w * h * 4);
  fillRect(data, w, h, 0, 0, w, h, [18, 18, 18]);
  // Landscape rectangle — detector.py keeps 0.9–2.0 width/height.
  fillRect(data, w, h, 40, 35, 200, 145, [230, 226, 210]);
  fillRect(data, w, h, 52, 47, 188, 133, [40, 90, 160]);
  return { width: w, height: h, luma: lumaFromRgba(data, w, h) };
}

const image = makeCardLuma();
const edgeMap = generateEdgeMap(image);
assert(edgeMap.width === 240 && edgeMap.height === 180, 'edge map size');
assert(edgeMap.magnitude.length === 240 * 180, 'edge map buffer');

let maxMag = 0;
for (let i = 0; i < edgeMap.magnitude.length; i++) {
  if (edgeMap.magnitude[i] > maxMag) maxMag = edgeMap.magnitude[i];
}
assert(maxMag > 0, 'sobel magnitude is non-zero');

const raw = buildEdgeMap(image.luma, image.width, image.height);
assert(raw.magnitude.length === edgeMap.magnitude.length, 'buildEdgeMap size');

const lines = findStrongLines(edgeMap);
assert(lines.length > 0, 'found strong lines');
assert(lines.some(lineIsHorizontal), 'has horizontal lines');
assert(lines.some(lineIsVertical), 'has vertical lines');
assert(lines.every((line) => line.length >= 30), 'min line length');

const hit = lineIntersection(
  { x1: 0, y1: 10, x2: 20, y2: 10, length: 20, angle: 0 },
  { x1: 8, y1: 0, x2: 8, y2: 20, length: 20, angle: 90 },
);
assert(hit !== null && Math.abs(hit[0] - 8) < 1e-6 && Math.abs(hit[1] - 10) < 1e-6, 'intersection');
assert(
  lineIntersection(
    { x1: 0, y1: 0, x2: 10, y2: 0, length: 10, angle: 0 },
    { x1: 0, y1: 5, x2: 10, y2: 5, length: 10, angle: 0 },
  ) === null,
  'parallel lines do not intersect',
);

const candidates = findCardCandidates(image, 8);
assert(candidates.length > 0, 'found card candidates');
const best = candidates[0];
assert(best.width > 100 && best.height > 70, 'candidate size');
assert(best.aspectRatio >= 0.9 && best.aspectRatio <= 2.0, 'candidate aspect');
assert(Math.abs(best.center[0] - 120) < 30, 'candidate cx near card');
assert(Math.abs(best.center[1] - 90) < 30, 'candidate cy near card');
assert(candidates.length <= 8, 'honors maxCandidates');

console.log('card-detector ok', {
  lines: lines.length,
  candidates: candidates.length,
  best,
});
`,
);

const result = spawnSync('npx', ['--yes', 'tsx', runner], {
  cwd: root,
  encoding: 'utf8',
  timeout: 120_000,
});

unlinkSync(runner);

if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

console.log(result.stdout.trim());
