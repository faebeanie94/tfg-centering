/**
 * Regression checks for perspective-aware card candidate scoring.
 * Run: node scripts/test-card-candidate-score.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'tfg-score-'));
const runner = join(dir, 'run.ts');

writeFileSync(
  runner,
  `
import {
  findBestCardCandidate,
  orderPoints,
  perspectiveAwareCandidateScore,
  perspectiveScore,
} from '${join(root, 'src/lib/card-candidate-score.ts').replace(/\\\\/g, '/')}';

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

const ordered = orderPoints([
  { x: 80, y: 20 },
  { x: 10, y: 18 },
  { x: 12, y: 90 },
  { x: 82, y: 88 },
]);
assert(ordered[0].x < ordered[1].x && ordered[0].y < ordered[3].y, 'TL is min x+y');
assert(ordered[2].x > ordered[3].x && ordered[2].y > ordered[1].y, 'BR is max x+y');

const w = 240;
const h = 320;
const card = { left: 0.18, top: 0.58, width: 0.42, height: 0.32 };
const guideGhost = { left: 0.5 - 0.21, top: 0.36 - 0.16, width: 0.42, height: 0.32 };

const data = new Uint8ClampedArray(w * h * 4);
fillRect(data, w, h, 0, 0, 1, 1, [28, 30, 32]);
fillRect(
  data, w, h,
  card.left, card.top, card.left + card.width, card.top + card.height,
  [210, 80, 60],
);

const image = { data, width: w, height: h };

const cardQuad = [
  { x: card.left * w, y: card.top * h },
  { x: (card.left + card.width) * w, y: card.top * h },
  { x: (card.left + card.width) * w, y: (card.top + card.height) * h },
  { x: card.left * w, y: (card.top + card.height) * h },
];
const ghostQuad = [
  { x: guideGhost.left * w, y: guideGhost.top * h },
  { x: (guideGhost.left + guideGhost.width) * w, y: guideGhost.top * h },
  { x: (guideGhost.left + guideGhost.width) * w, y: (guideGhost.top + guideGhost.height) * h },
  { x: guideGhost.left * w, y: (guideGhost.top + guideGhost.height) * h },
];
const tinyQuad = [
  { x: 4, y: 4 },
  { x: 10, y: 4 },
  { x: 10, y: 10 },
  { x: 4, y: 10 },
];

assert(perspectiveScore(tinyQuad, { width: w, height: h }) === 0, 'tiny quad rejected');
assert(perspectiveScore(cardQuad, { width: w, height: h }) > 0.4, 'card-sized rectangle scores');

const cardScore = perspectiveAwareCandidateScore(image, cardQuad);
const ghostScore = perspectiveAwareCandidateScore(image, ghostQuad);
assert(cardScore > ghostScore, \`off-guide card (\${cardScore.toFixed(3)}) must beat 0.5/0.36 ghost (\${ghostScore.toFixed(3)})\`);
assert(cardScore > 0.35, 'real card edges should score meaningfully');

const best = findBestCardCandidate(image, [
  { id: 'ghost', points: ghostQuad },
  { id: 'card', points: cardQuad },
]);
assert(best?.id === 'card', 'findBestCardCandidate picks the real card, not the guide prior');

const tilted = [
  { x: card.left * w, y: card.top * h + 18 },
  { x: (card.left + card.width) * w + 12, y: card.top * h },
  { x: (card.left + card.width) * w, y: (card.top + card.height) * h - 10 },
  { x: card.left * w - 8, y: (card.top + card.height) * h },
];
assert(perspectiveScore(tilted, { width: w, height: h }) > 0, 'perspective tilt is not a hard reject');

console.log('ok - orderPoints');
console.log('ok - area gates');
console.log('ok - off-guide card beats 0.5/0.36 ghost', cardScore.toFixed(3), '>', ghostScore.toFixed(3));
console.log('ok - findBestCardCandidate', best?.id, best?.score.toFixed(3));
console.log('All candidate-score checks passed.');
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
