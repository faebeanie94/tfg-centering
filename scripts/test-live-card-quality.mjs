/**
 * Live video-pixel quality gates (size / in-frame / sharpness).
 * Run: node scripts/test-live-card-quality.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'tfg-quality-'));
const runner = join(dir, 'run.ts');

writeFileSync(
  runner,
  `
import { evaluateCardQuality } from '${join(root, 'src/card/LiveCardQuality.ts').replace(/\\\\/g, '/')}';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const video = { width: 1920, height: 1080 };
const fullCard = [
  { x: 400, y: 80 },
  { x: 1520, y: 90 },
  { x: 1500, y: 1000 },
  { x: 420, y: 990 },
];

const good = evaluateCardQuality(fullCard, video.width, video.height, 24);
assert(good.valid, 'large sharp card is valid');
assert(good.message.includes('hold steady'), good.message);
assert(good.widthRatio > 0.25 && good.heightRatio > 0.25, 'ratios filled');

const tiny = evaluateCardQuality(
  [
    { x: 900, y: 500 },
    { x: 980, y: 500 },
    { x: 980, y: 620 },
    { x: 900, y: 620 },
  ],
  video.width,
  video.height,
  40,
);
assert(!tiny.valid, 'tiny quad fails');
assert(tiny.message === 'Move closer to the card', tiny.message);

const soft = evaluateCardQuality(fullCard, video.width, video.height, 4);
assert(!soft.valid, 'soft frame fails');
assert(soft.message === 'Hold still', soft.message);

const clipped = evaluateCardQuality(
  [
    { x: -10, y: 80 },
    { x: 1520, y: 90 },
    { x: 1500, y: 1000 },
    { x: 420, y: 990 },
  ],
  video.width,
  video.height,
  24,
);
assert(!clipped.valid, 'off-frame corner fails');
assert(clipped.message === 'Keep the card inside the frame', clipped.message);

const missing = evaluateCardQuality([], video.width, video.height, 24);
assert(!missing.valid, 'no corners');
assert(missing.message === 'Position your card', missing.message);

console.log('ok - live card quality gates');
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
