import assert from 'node:assert/strict';
import {
  getState,
  patch,
  settings,
  setAnimator,
  perform,
  undo,
  redo,
  loadPlayer,
  playerNext,
  playerPrevious,
  seek,
  play,
  pause,
  restoreHistory,
  replayHistory,
  stopReplay,
  HISTORY_REPLAY_TITLE,
} from '../lib/cube/store';
import {
  solved,
  apply,
  parseAlgorithm,
  toFaceletString,
  isPictureSolved,
} from '../lib/cube/model';
import {
  captureProject,
  validateProject,
  loadProject,
} from '../lib/cube/persistence';
import { defaultAppearance } from '../lib/cube/appearance';
setAnimator(async () => {});
const sequence = parseAlgorithm("R U F' L2 D B2 M E' S2 x y2 z'");
for (const m of sequence) await perform(m);
assert.deepEqual(getState().cube, apply(solved(), sequence));
for (let i = 0; i < sequence.length; i++) await undo();
assert.ok(isPictureSolved(getState().cube));
for (let i = 0; i < sequence.length; i++) await redo();
assert.deepEqual(getState().cube, apply(solved(), sequence));
console.log('PASS undo / redo across face, slice, and whole-cube rotations');
const baseline = getState().cube;
loadPlayer(parseAlgorithm("R U R' U'"), 'Algorithm');
await playerNext();
await playerNext();
await playerPrevious();
assert.equal(getState().player?.index, 1);
await seek(0);
assert.deepEqual(getState().cube, baseline);
await play();
assert.equal(getState().player?.index, 4);
await seek(0);
assert.deepEqual(getState().cube, baseline);
console.log(
  'PASS algorithm play / previous / next / restart preserve the exact starting state',
);
const saved = captureProject(),
  reloaded = validateProject(JSON.parse(JSON.stringify(saved)));
restoreHistory([], 0);
loadProject(reloaded);
assert.deepEqual(getState().cube, baseline);
const illegal = structuredClone(saved);
illegal.facelets = illegal.facelets.replace('R', 'U');
assert.throws(() => validateProject(illegal));
const badHistory = structuredClone(saved);
badHistory.history.push('Q');
assert.throws(() => validateProject(badHistory));
const badImage = structuredClone(saved);
badImage.appearance.stickers.F0.image = 'https://example.invalid/image.png';
assert.throws(() => validateProject(badImage));
const badOrientation = structuredClone(saved);
badOrientation.appearance.stickers.F0.rotation = Number.NaN;
assert.throws(() => validateProject(badOrientation));
console.log(
  'PASS portable project round trip; impossible/inconsistent states, invalid notation and non-raster content rejected',
);
const before = JSON.stringify(getState().cube);
settings({ explode: 3, gap: 0.15, size: 0.8, internal: 1.5 });
patch({ mode: 'customize', view: 'net' });
assert.equal(JSON.stringify(getState().cube), before);
console.log(
  'PASS explode, spacing, scale, editor and mapping do not alter physical state',
);
restoreHistory([], 0);
let release: (() => void) | undefined;
setAnimator(
  () =>
    new Promise<void>((r) => {
      release = r;
    }),
);
const first = perform('R');
await perform('U');
release!();
await first;
await new Promise((r) => setTimeout(r, 0));
release!();
await new Promise((r) => setTimeout(r, 0));
assert.deepEqual(getState().cube, apply(solved(), ['R', 'U']));
console.log('PASS fast manual inputs queue without losing a turn');
setAnimator(async () => {});
restoreHistory([], 0);
loadPlayer(['R', 'U', 'F'], 'pause');
let complete: (() => void) | undefined;
setAnimator(
  () =>
    new Promise<void>((r) => {
      complete = r;
    }),
);
const playing = play();
pause();
complete!();
await playing;
assert.equal(getState().player?.index, 1);
assert.equal(getState().player?.playing, false);
assert.deepEqual(getState().cube, apply(solved(), ['R']));
console.log(
  'PASS pause completes exactly the active turn without applying the next one',
);
setAnimator(async () => {});
restoreHistory([], 0);
const replayed = parseAlgorithm("R U R' U' F2");
for (const m of replayed) await perform(m);
let releaseReplay: (() => void) | undefined;
setAnimator(
  () =>
    new Promise<void>((r) => {
      releaseReplay = r;
    }),
);
replayHistory();
assert.equal(getState().player?.title, HISTORY_REPLAY_TITLE);
assert.equal(getState().player?.playing, true);
releaseReplay!();
await new Promise((r) => setTimeout(r, 0));
assert.equal(getState().player?.index, 1);
stopReplay();
assert.equal(getState().player, null);
releaseReplay!();
await new Promise((r) => setTimeout(r, 0));
await new Promise((r) => setTimeout(r, 0));
assert.equal(getState().history.length, 2);
assert.equal(getState().cursor, getState().history.length);
assert.deepEqual(getState().cube, apply(solved(), replayed.slice(0, 2)));
assert.equal(getState().player, null);
console.log(
  'PASS history replay starts from solved and terminates mid-sequence without losing applied turns',
);
setAnimator(async () => {});
process.exit(0);
