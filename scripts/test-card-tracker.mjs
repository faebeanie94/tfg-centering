/**
 * Temporal card tracker: smoothing, stability, lost frames, one-shot capture.
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
import { CardTracker } from '${join(root, 'src/lib/card-tracker.ts').replace(/\\\\/g, '/')}';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function card(dx = 0, dy = 0) {
  return [
    { x: 40 + dx, y: 30 + dy },
    { x: 160 + dx, y: 30 + dy },
    { x: 160 + dx, y: 200 + dy },
    { x: 40 + dx, y: 200 + dy },
  ];
}

let captures = 0;
const tracker = new CardTracker({
  minimumConfidence: 0.88,
  requiredStableFrames: 8,
  maximumCornerMovement: 18,
  smoothingFactor: 0.3,
  onAutoCapture: () => {
    captures++;
  },
});

tracker.setDetection({ corners: card(), confidence: 0.92, frameWidth: 240, frameHeight: 320 });
assert(tracker.detectedCorners.length === 4, 'first frame keeps corners');
assert(tracker.stableFrames === 0, 'first frame is not yet a stable streak');

for (let i = 0; i < 8; i++) {
  tracker.setDetection({ corners: card(0.4, 0.2), confidence: 0.93, frameWidth: 240, frameHeight: 320 });
}
assert(tracker.isStable, 'eight steady high-confidence frames are stable');
assert(captures === 1, 'auto-capture fires once');

tracker.setDetection({ corners: card(0.3, 0.1), confidence: 0.94, frameWidth: 240, frameHeight: 320 });
assert(captures === 1, 'further stable frames do not recapture');

tracker.allowNextCapture();
tracker.setDetection({ corners: card(0.2, 0.1), confidence: 0.94, frameWidth: 240, frameHeight: 320 });
assert(captures === 2, 'allowNextCapture permits another shot');

const jumpy = new CardTracker({ requiredStableFrames: 8, minimumConfidence: 0.88 });
jumpy.setDetection({ corners: card(), confidence: 0.95, frameWidth: 240, frameHeight: 320 });
for (let i = 0; i < 4; i++) {
  jumpy.setDetection({ corners: card(), confidence: 0.95, frameWidth: 240, frameHeight: 320 });
}
assert(jumpy.stableFrames >= 3, 'steady frames accumulate');
jumpy.setDetection({ corners: card(80, 40), confidence: 0.95, frameWidth: 240, frameHeight: 320 });
assert(jumpy.stableFrames < 3, 'large movement reduces the streak');

const lost = new CardTracker({ requiredStableFrames: 8, minimumConfidence: 0.88 });
lost.setDetection({ corners: card(), confidence: 0.9, frameWidth: 240, frameHeight: 320 });
for (let i = 0; i < 5; i++) {
  lost.setDetection({ corners: card(), confidence: 0.9, frameWidth: 240, frameHeight: 320 });
}
assert(lost.stableFrames >= 4, 'pre-miss streak');
lost.setDetection({ corners: [], confidence: 0, frameWidth: 240, frameHeight: 320 });
assert(lost.detectedCorners.length === 4, 'one missed frame keeps overlay corners');
lost.setDetection({ corners: [], confidence: 0, frameWidth: 240, frameHeight: 320 });
assert(lost.detectedCorners.length === 0, 'enough misses clear the lock');

const tiny = new CardTracker();
tiny.setDetection({
  corners: [
    { x: 1, y: 1 },
    { x: 4, y: 1 },
    { x: 4, y: 4 },
    { x: 1, y: 4 },
  ],
  confidence: 0.99,
  frameWidth: 240,
  frameHeight: 320,
});
assert(tiny.detectedCorners.length === 0, 'tiny quads are rejected');

console.log('ok - stable auto-capture', captures);
console.log('ok - movement and lost-frame handling');
console.log('All card-tracker checks passed.');
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
