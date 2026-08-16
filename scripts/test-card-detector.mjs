/**
 * Regression checks for the detector.py TypeScript port.
 * Run: node scripts/test-card-detector.mjs
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'tfg-rim-'));
const runner = join(dir, 'run.ts');

writeFileSync(
  runner,
  `
import {
  generateEdgeMap,
  edgeContinuity,
  findRimPoint,
  fourEdgeValidation,
  colorScore,
} from '${join(root, 'src/lib/card-detector.ts').replace(/\\\\/g, '/')}';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function makeImage(w: number, h: number, fill: [number, number, number] = [0, 0, 0]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h };
}

function fillCircle(
  image: { data: Uint8ClampedArray; width: number; height: number },
  cx: number,
  cy: number,
  radius: number,
  rgb: [number, number, number],
) {
  const r2 = radius * radius;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * image.width + x) * 4;
      image.data[i] = rgb[0];
      image.data[i + 1] = rgb[1];
      image.data[i + 2] = rgb[2];
    }
  }
}

function paintEdgeCircle(
  edgeMap: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  value = 220,
  thickness = 2,
) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (Math.abs(d - radius) <= thickness) edgeMap[y * w + x] = value;
    }
  }
}

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log('ok -', name);
  } catch (e) {
    failed++;
    console.error('FAIL -', name, '-', (e as Error).message);
  }
}

check('generateEdgeMap highlights a disk rim', () => {
  const img = makeImage(80, 80, [10, 10, 10]);
  fillCircle(img, 40, 40, 18, [240, 240, 240]);
  const edges = generateEdgeMap(img);
  let rim = 0;
  let interior = 0;
  let nRim = 0;
  let nIn = 0;
  for (let y = 0; y < 80; y++) {
    for (let x = 0; x < 80; x++) {
      const d = Math.hypot(x - 40, y - 40);
      const v = edges[y * 80 + x];
      if (Math.abs(d - 18) <= 2) {
        rim += v;
        nRim++;
      } else if (d < 8) {
        interior += v;
        nIn++;
      }
    }
  }
  assert(nRim > 0 && nIn > 0, 'expected rim and interior samples');
  assert(rim / nRim > interior / nIn + 20, \`rim \${rim / nRim} should exceed interior \${interior / nIn}\`);
});

check('edgeContinuity is high on a closed ring', () => {
  const w = 80;
  const h = 80;
  const edges = new Uint8Array(w * h);
  paintEdgeCircle(edges, w, h, 40, 40, 12, 220, 2);
  const closed = edgeContinuity(edges, w, h, 40, 40, 12, 2);
  const empty = edgeContinuity(new Uint8Array(w * h), w, h, 40, 40, 12, 2);
  assert(closed > 0.8, \`closed ring continuity \${closed}\`);
  assert(empty === 0, \`empty continuity \${empty}\`);
});

check('findRimPoint lands on a bright disk rim', () => {
  const img = makeImage(96, 96, [8, 8, 8]);
  fillCircle(img, 48, 48, 22, [230, 230, 230]);
  const p = findRimPoint(img);
  assert(p, 'expected a rim point');
  const d = Math.hypot(p!.x - 48, p!.y - 48);
  assert(d > 16 && d < 30, \`rim distance \${d} at (\${p!.x},\${p!.y})\`);
});

check('fourEdgeValidation accepts a full ring and rejects a gap', () => {
  const w = 80;
  const h = 80;
  const full = new Uint8Array(w * h);
  paintEdgeCircle(full, w, h, 40, 40, 20, 220, 3);
  assert(fourEdgeValidation(full, w, h, { x: 40, y: 40 }, 20), 'full ring should pass');

  const gapped = new Uint8Array(full);
  for (let y = 0; y < h; y++) {
    for (let x = 40; x < w; x++) gapped[y * w + x] = 0;
  }
  assert(!fourEdgeValidation(gapped, w, h, { x: 40, y: 40 }, 20), 'half ring should fail');
  assert(!fourEdgeValidation(full, w, h, null, 20), 'null center should fail');
});

check('colorScore prefers bright disks; chroma is weak', () => {
  const bright = makeImage(64, 64, [0, 0, 0]);
  fillCircle(bright, 32, 32, 16, [250, 250, 250]);
  const dark = makeImage(64, 64, [0, 0, 0]);
  fillCircle(dark, 32, 32, 16, [12, 12, 12]);
  const red = makeImage(64, 64, [0, 0, 0]);
  fillCircle(red, 32, 32, 16, [220, 20, 20]);

  const b = colorScore(bright, { x: 32, y: 32 }, 16);
  const d = colorScore(dark, { x: 32, y: 32 }, 16);
  const r = colorScore(red, { x: 32, y: 32 }, 16);
  assert(b > 0.7, \`bright score \${b}\`);
  assert(d < 0.2, \`dark score \${d}\`);
  assert(b > r, \`brightness should beat saturated red (\${b} vs \${r})\`);
});

if (failed) {
  console.error(failed, 'failure(s)');
  process.exit(1);
}
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
