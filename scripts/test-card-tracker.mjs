/**
 * CardDetector: 90% confidence, size/perspective/sharpness gates, 8-frame auto-capture.
 * Run: node scripts/test-card-tracker.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'tfg-tracker-'));
const runner = join(dir, 'run.ts');

writeFileSync(
  runner,
  `
import { CardDetector, cornersToOverlaySpace, type CardCorners } from '${join(root, 'src/components/CardDetector.tsx').replace(/\\\\/g, '/')}';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function card(dx = 0, dy = 0) {
  return cornersToOverlaySpace(
    [
      { x: 40 + dx, y: 30 + dy },
      { x: 160 + dx, y: 30 + dy },
      { x: 160 + dx, y: 200 + dy },
      { x: 40 + dx, y: 200 + dy },
    ],
    240,
    320,
  );
}

let captures = 0;
const detector = new CardDetector({
  onAutoCapture: () => {
    captures++;
  },
});

detector.updateDetection({ corners: card(), confidence: 0.92 });
assert(detector.detectedCorners?.length === 4, 'first frame keeps corners');
assert(detector.stableFrameCount === 1, 'first good frame counts toward the streak');

for (let i = 0; i < 7; i++) {
  detector.updateDetection({ corners: card(0.4, 0.2), confidence: 0.93 });
}
assert(detector.isReadyToCapture, 'eight steady high-confidence frames are ready');
assert(captures === 1, 'auto-capture fires once');

detector.updateDetection({ corners: card(0.3, 0.1), confidence: 0.94 });
assert(captures === 1, 'further stable frames do not recapture');

detector.resetAutoCapture();
for (let i = 0; i < 8; i++) {
  detector.updateDetection({ corners: card(0.2, 0.1), confidence: 0.94 });
}
assert(captures === 2, 'resetAutoCapture permits another shot');

const jumpy = new CardDetector();
jumpy.updateDetection({ corners: card(), confidence: 0.95 });
for (let i = 0; i < 4; i++) {
  jumpy.updateDetection({ corners: card(), confidence: 0.95 });
}
assert(jumpy.stableFrameCount >= 3, 'steady frames accumulate');
jumpy.updateDetection({ corners: card(80, 40), confidence: 0.95 });
assert(jumpy.stableFrameCount <= 3, 'large movement reduces the streak');

const lost = new CardDetector();
lost.updateDetection({ corners: card(), confidence: 0.9 });
for (let i = 0; i < 5; i++) {
  lost.updateDetection({ corners: card(), confidence: 0.9 });
}
assert(lost.stableFrameCount >= 4, 'pre-miss streak');
lost.updateDetection({ corners: [] as unknown as CardCorners, confidence: 0 });
assert(lost.detectedCorners?.length === 4, 'a miss keeps overlay corners');
assert(lost.stableFrameCount === 0, 'a miss resets the stable streak');

const tiny = new CardDetector({ onAutoCapture: () => { captures++; } });
const tinyCard = cornersToOverlaySpace(
  [
    { x: 100, y: 100 },
    { x: 112, y: 100 },
    { x: 112, y: 116 },
    { x: 100, y: 116 },
  ],
  240,
  320,
);
for (let i = 0; i < 10; i++) {
  tiny.updateDetection({ corners: tinyCard, confidence: 0.99 });
}
assert(tiny.stableFrameCount === 0, 'undersized quads never start the stable streak');

const blurry = new CardDetector({ onAutoCapture: () => { captures++; } });
for (let i = 0; i < 10; i++) {
  blurry.updateDetection({ corners: card(), confidence: 0.99, blur: 4 });
}
assert(blurry.stableFrameCount === 0, 'soft frames (low Laplacian) do not auto-capture');

const gated = new CardDetector({ onAutoCapture: () => { captures++; } });
for (let i = 0; i < 10; i++) {
  gated.updateDetection({ corners: card(), confidence: 0.99, blur: 40, allowCapture: false });
}
assert(gated.detectedCorners?.length === 4, 'quality fail still shows overlay corners');
assert(gated.stableFrameCount === 0, 'allowCapture false does not count stable frames');

console.log('ok - stable auto-capture', captures);
console.log('ok - movement and lost-frame handling');
console.log('All card-detector tracking checks passed.');
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
