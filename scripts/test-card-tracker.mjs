/**
 * CardDetector temporal tracking: smoothing, stability, lost frames, one-shot capture.
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
import { CardDetector, cornersToOverlaySpace } from '${join(root, 'src/components/CardDetector.tsx').replace(/\\\\/g, '/')}';

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
  minimumConfidence: 0.88,
  requiredStableFrames: 8,
  maximumCornerMovement: 18,
  smoothingFactor: 0.3,
  onAutoCapture: () => {
    captures++;
  },
});

detector.setDetection({ corners: card(), confidence: 0.92 });
assert(detector.detectedCorners?.length === 4, 'first frame keeps corners');
assert(detector.stableFrameCount === 0, 'first frame is not yet a stable streak');

for (let i = 0; i < 8; i++) {
  detector.setDetection({ corners: card(0.4, 0.2), confidence: 0.93 });
}
assert(detector.isStable, 'eight steady high-confidence frames are stable');
assert(captures === 1, 'auto-capture fires once');

detector.setDetection({ corners: card(0.3, 0.1), confidence: 0.94 });
assert(captures === 1, 'further stable frames do not recapture');

detector.allowNextCapture();
detector.setDetection({ corners: card(0.2, 0.1), confidence: 0.94 });
assert(captures === 2, 'allowNextCapture permits another shot');

const jumpy = new CardDetector({ requiredStableFrames: 8, minimumConfidence: 0.88 });
jumpy.setDetection({ corners: card(), confidence: 0.95 });
for (let i = 0; i < 4; i++) {
  jumpy.setDetection({ corners: card(), confidence: 0.95 });
}
assert(jumpy.stableFrameCount >= 3, 'steady frames accumulate');
jumpy.setDetection({ corners: card(80, 40), confidence: 0.95 });
assert(jumpy.stableFrameCount < 3, 'large movement reduces the streak');

const lost = new CardDetector({ requiredStableFrames: 8, minimumConfidence: 0.88 });
lost.setDetection({ corners: card(), confidence: 0.9 });
for (let i = 0; i < 5; i++) {
  lost.setDetection({ corners: card(), confidence: 0.9 });
}
assert(lost.stableFrameCount >= 4, 'pre-miss streak');
lost.setDetection({
  corners: [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ],
  confidence: 0,
});
assert(lost.detectedCorners?.length === 4, 'one missed frame keeps overlay corners');
lost.setDetection({
  corners: [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ],
  confidence: 0,
});
assert(lost.detectedCorners == null, 'enough misses clear the lock');

const tiny = new CardDetector();
tiny.setDetection({
  corners: [
    { x: 1, y: 1 },
    { x: 4, y: 1 },
    { x: 4, y: 4 },
    { x: 1, y: 4 },
  ],
  confidence: 0.99,
});
assert(tiny.detectedCorners == null, 'tiny quads are rejected');

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
