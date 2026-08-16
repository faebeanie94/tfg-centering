/**
 * Artwork-boundary estimate → existing computeCentering + TFG grades.
 * Run: node scripts/test-centering-grader.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'tfg-center-'));
const runner = join(dir, 'run.ts');

writeFileSync(
  runner,
  `
import { CenteringGrader } from '${join(root, 'src/card/centering/CenteringGrader.ts').replace(/\\\\/g, '/')}';
import { gradeCard } from '${join(root, 'src/card/centering/gradeCard.ts').replace(/\\\\/g, '/')}';
import { snapshotFromRects } from '${join(root, 'src/lib/session.ts').replace(/\\\\/g, '/')}';
import { CARD_FORMAT_PRESETS } from '${join(root, 'src/lib/card-sizes.ts').replace(/\\\\/g, '/')}';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function paintCard(width: number, height: number, inner: { x: number; y: number; w: number; h: number }) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= inner.x && x < inner.x + inner.w && y >= inner.y && y < inner.y + inner.h;
      const v = inside ? 30 : 210;
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

const centered = CenteringGrader.analyzeBuffer(
  paintCard(200, 280, { x: 40, y: 50, w: 120, h: 180 }),
  { side: 'front', debug: true },
);
assert(centered.confidence === 1, 'centered artwork fills enough of the card');
assert(centered.horizontal.ratio === '50/50' || centered.horizontal.ratio === '49/51' || centered.horizontal.ratio === '51/49', centered.horizontal.ratio);
assert(centered.grade.grade === 10, '50/50 front is TFG 10, not a PSA label');
assert(centered.grade.label === 'TFG 10', centered.grade.label);

const off = CenteringGrader.analyzeBuffer(
  paintCard(200, 280, { x: 20, y: 50, w: 140, h: 180 }),
  { side: 'front' },
);
assert(off.horizontal.firstPercent < 45, 'left border is the thinner side');
assert(off.grade.grade < 10, 'off-center front is below TFG 10');
assert(off.grade.label.startsWith('TFG'), off.grade.label);

const back = gradeCard({ left: 48, right: 52, top: 50, bottom: 50 }, 'back');
assert(back.grade === 10, 'near-even back is TFG 10 under existing back bands');

const frontSame = gradeCard({ left: 40, right: 60, top: 50, bottom: 50 }, 'front');
assert(frontSame.grade === 8, '40/60 borders are TFG 8 on the front');
const backWider = gradeCard({ left: 40, right: 60, top: 50, bottom: 50 }, 'back');
assert(backWider.grade === 9.5, 'same 40/60 borders are TFG 9.5 on the back');

const review = snapshotFromRects(
  'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
  { x: 0, y: 0, width: 200, height: 280 },
  { x: 40, y: 50, width: 120, height: 180 },
  'front',
  CARD_FORMAT_PRESETS.pokemon,
);
assert(review.grade.label === 'TFG 10', 'review snapshot uses getTfgGrade');
assert(Math.round(review.result.leftRight.left + review.result.leftRight.right) === 100, 'L/R percents sum to 100');

console.log('ok - centering grader uses TFG rules', centered.horizontal.ratio, off.horizontal.ratio);
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
