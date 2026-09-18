'use client';
import { useMemo, useSyncExternalStore } from 'react';
import {
  solved,
  turn,
  inverseMove,
  parseAlgorithm,
  apply,
  type CubeState,
  type Face,
} from './model';
import { defaultAppearance, type Appearance } from './appearance';
import { defaultKeybindings, type Keybindings } from './keybindings';
import { defaultAlgorithmPresets, type AlgorithmPreset } from './algorithms';
import {
  canTurnSequence,
  partialAfterMove,
  alignedPartialForTurn,
  partialAfterAllowedMove,
  layerFace,
  moveForAngle,
  QUARTER,
  type PartialTurns,
} from './interaction';
export type Mode =
  | 'play'
  | 'camera'
  | 'explode'
  | 'customize'
  | 'solver'
  | 'inspect';
export type View = 'normal' | 'hidden' | 'six' | 'net';
export interface Settings {
  algorithmPresets: AlgorithmPreset[];
  keybindings: Keybindings;
  explode: number;
  gap: number;
  size: number;
  stickerOffset: number;
  internal: number;
  speed: number;
  easing: 'smooth' | 'magnetic' | 'linear';
  roughness: number;
  autoRotate: boolean;
  lightFollowCamera: boolean;
  lightAzimuth: number;
  lightElevation: number;
  lightIntensity: number;
  quality: 'auto' | 'high' | 'low';
  showMagnets: boolean;
  magnetStrength: number;
  magnetDamping: number;
  turnTolerance: number;
}
export const defaultSettings = (): Settings => ({
  algorithmPresets: defaultAlgorithmPresets(),
  keybindings: defaultKeybindings(),
  explode: 0,
  gap: 0.006,
  size: 1,
  stickerOffset: 0.002,
  internal: 1,
  speed: 1,
  easing: 'magnetic',
  roughness: 0.24,
  autoRotate: false,
  lightFollowCamera: true,
  lightAzimuth: -31,
  lightElevation: 50,
  lightIntensity: 2.8,
  quality: 'auto',
  showMagnets: true,
  magnetStrength: 1,
  magnetDamping: 0.7,
  turnTolerance: 10,
});
export interface Stage {
  name: string;
  label: string;
  description: string;
  start: number;
  end: number;
}
export interface Player {
  title: string;
  moves: string[];
  index: number;
  playing: boolean;
  stages: Stage[];
  base: number;
}
export interface AppState {
  cube: CubeState;
  history: string[];
  cursor: number;
  busy: boolean;
  dragging: boolean;
  partialTurns: PartialTurns | null;
  mode: Mode;
  view: View;
  settings: Settings;
  appearance: Appearance;
  artVersion: number;
  selected: string[];
  editFace: Face;
  player: Player | null;
  currentMove: string;
  scramble: string;
  scrambleCursor: number;
  notice: string;
  solving: boolean;
  solveStatus: string;
  visibleFaces: Face[];
  presentation: boolean;
  autoSave: boolean;
  ready: boolean;
  faceAnchors: Record<
    string,
    { x: number; y: number; fromX: number; fromY: number }
  >;
}
let state: AppState = {
  cube: solved(),
  history: [],
  cursor: 0,
  busy: false,
  dragging: false,
  partialTurns: null,
  mode: 'play',
  view: 'hidden',
  settings: defaultSettings(),
  appearance: defaultAppearance(),
  artVersion: 0,
  selected: [],
  editFace: 'F',
  player: null,
  currentMove: '',
  scramble: '',
  scrambleCursor: 0,
  notice: '',
  solving: false,
  solveStatus: '',
  visibleFaces: ['U', 'R', 'F'],
  presentation: false,
  autoSave: false,
  ready: false,
  faceAnchors: {},
};
const initial = state,
  listeners = new Set<() => void>();
export const getState = () => state;
export function patch(update: Partial<AppState>) {
  if (
    (Object.keys(update) as (keyof AppState)[]).every((key) =>
      Object.is(state[key], update[key]),
    )
  )
    return;
  state = { ...state, ...update };
  listeners.forEach((fn) => fn());
}
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function useCube(): AppState;
export function useCube<K extends keyof AppState>(
  ...keys: K[]
): Pick<AppState, K>;
export function useCube(...keys: (keyof AppState)[]) {
  // Keep snapshots stable when only fields outside this component change.
  const signature = keys.join('|');
  const snapshots = useMemo(() => {
    const selected = signature.split('|') as (keyof AppState)[];
    let previous: AppState | undefined;
    let snapshot: Partial<AppState>;
    const pick = (s: AppState) =>
      Object.fromEntries(selected.map((key) => [key, s[key]]));
    const server = signature ? pick(initial) : initial;
    return {
      get: signature
        ? () => {
            if (
              !previous ||
              selected.some((key) => !Object.is(previous![key], state[key]))
            )
              snapshot = pick(state);
            previous = state;
            return snapshot;
          }
        : getState,
      server: () => server,
    };
  }, [signature]);
  return useSyncExternalStore(subscribe, snapshots.get, snapshots.server);
}
let noticeTimer: ReturnType<typeof setTimeout>;
export function notify(notice: string) {
  patch({ notice });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => patch({ notice: '' }), 4500);
}
export function settings(update: Partial<Settings>) {
  if (state.solving) return;
  patch({ settings: { ...state.settings, ...update } });
}
let autoRotateBeforePresentation = false;
export function setPresentation(on: boolean) {
  if (on === state.presentation) return;
  if (on) autoRotateBeforePresentation = state.settings.autoRotate;
  patch({
    presentation: on,
    settings: {
      ...state.settings,
      autoRotate: on ? true : autoRotateBeforePresentation,
    },
  });
}
export function setAppearance(appearance: Appearance) {
  if (state.solving) return;
  patch({ appearance, artVersion: state.artVersion + 1 });
}
export function selectSticker(id: string, multiple = true) {
  if (state.solving) return;
  patch({
    selected: multiple
      ? state.selected.includes(id)
        ? state.selected.filter((x) => x !== id)
        : [...state.selected, id]
      : [id],
    editFace: id[0] as Face,
  });
}
export type Animator = (move: string, duration: number) => Promise<void>;
let animate: Animator = async () => {};
let animateAlignment: (partial: PartialTurns) => Promise<void> = async () => {};
export function setAnimator(fn: Animator) {
  animate = fn;
}
export function setAlignmentAnimator(fn: typeof animateAlignment) {
  animateAlignment = fn;
}
function alignmentFor(token: string) {
  const partial = state.partialTurns;
  return alignedPartialForTurn(partial, token, state.settings.turnTolerance) !==
    partial
    ? partial
    : null;
}
export function beginAlignedDrag(token: string) {
  if (state.solving || state.busy || state.dragging || !allowMoves([token]))
    return false;
  pause();
  patch({
    busy: true,
    dragging: true,
    player: null,
    currentMove: token + ' · 对齐',
  });
  const partial = alignmentFor(token);
  try {
    if (partial) {
      void animateAlignment(partial).catch((error) => {
        notify(error instanceof Error ? error.message : '归位未完成，请重试。');
      });
      patch({ partialTurns: null });
    }
    return true;
  } catch (error) {
    patch({ busy: false, dragging: false, currentMove: '' });
    notify(error instanceof Error ? error.message : '归位未完成，请重试。');
    return false;
  }
}
export function allowMoves(moves: string[]): boolean {
  if (canTurnSequence(state.partialTurns, moves, state.settings.turnTolerance))
    return true;
  notify(
    `转层偏差超出 ${state.settings.turnTolerance}° 容错范围。请沿原轴拖动对齐，或增大转层容错角度。`,
  );
  return false;
}
export function finishLayerTurn(axis: number, layer: number, angle: number) {
  if (
    state.solving ||
    ![0, 1, 2].includes(axis) ||
    ![-1, 0, 1].includes(layer) ||
    !Number.isFinite(angle) ||
    (state.partialTurns && state.partialTurns.axis !== axis)
  )
    return;
  const target = Math.round(angle / QUARTER) * QUARTER;
  const token = moveForAngle(layerFace(axis, layer), target);
  const residual = angle - target;
  const angles: PartialTurns['angles'] = state.partialTurns
    ? [...state.partialTurns.angles]
    : [0, 0, 0];
  angles[layer + 1] = Math.abs(residual) < 0.00001 ? 0 : residual;
  const history = token
    ? [...state.history.slice(0, state.cursor), token]
    : state.history;
  patch({
    cube: token ? turn(state.cube, token) : state.cube,
    history,
    cursor: token ? history.length : state.cursor,
    partialTurns: angles.some(Boolean) ? { axis, angles } : null,
    busy: false,
    dragging: false,
    currentMove: '',
    player: null,
  });
}
let playGeneration = 0;
const manualQueue: string[] = [];
export function pause() {
  playGeneration++;
  if (state.player) patch({ player: { ...state.player, playing: false } });
}
export async function perform(
  token: string,
  source: 'manual' | 'player' | 'undo' | 'redo' = 'manual',
  instant = false,
) {
  if (state.solving || state.dragging) return false;
  if (state.busy) {
    if (source === 'manual' && manualQueue.length < 50) {
      if (
        !allowMoves([state.currentMove, ...manualQueue, token].filter(Boolean))
      )
        return false;
      pause();
      patch({ player: null });
      manualQueue.push(token);
      return true;
    }
    return false;
  }
  if (!allowMoves([token])) return false;
  if (source === 'manual') {
    pause();
    patch({ player: null });
  }
  patch({ busy: true, currentMove: token });
  try {
    const partial = alignmentFor(token);
    const alignment = partial && !instant ? animateAlignment(partial) : null;
    if (partial) patch({ partialTurns: null });
    if (!instant)
      await Promise.all([
        alignment,
        animate(
          token,
          (310 / state.settings.speed) * (token.includes('2') ? 1.25 : 1),
        ),
      ]);
    const cube = turn(state.cube, token),
      partialTurns = partialAfterMove(state.partialTurns, token);
    if (source === 'undo')
      patch({ cube, partialTurns, cursor: state.cursor - 1 });
    else if (source === 'redo')
      patch({ cube, partialTurns, cursor: state.cursor + 1 });
    else {
      const history = [...state.history.slice(0, state.cursor), token];
      patch({ cube, partialTurns, history, cursor: history.length });
    }
    return true;
  } finally {
    patch({ busy: false, currentMove: '' });
    const next = manualQueue.shift();
    if (next) queueMicrotask(() => void perform(next));
  }
}
export async function undo() {
  if (state.busy || state.cursor === 0 || state.solving) return;
  pause();
  patch({ player: null });
  await perform(inverseMove(state.history[state.cursor - 1]), 'undo');
}
export async function redo() {
  if (state.busy || state.cursor === state.history.length || state.solving)
    return;
  pause();
  patch({ player: null });
  await perform(state.history[state.cursor], 'redo');
}
export function resetCube() {
  if (state.busy || state.solving) return;
  pause();
  patch({
    cube: solved(),
    history: [],
    cursor: 0,
    player: null,
    scramble: '',
    scrambleCursor: 0,
    partialTurns: null,
  });
  notify('魔方已复原，保留当前外观。');
}
export function loadPlayer(
  moves: string[],
  title: string,
  stages: Stage[] = [],
) {
  if (state.solving || state.busy) return;
  if (!allowMoves(moves)) return;
  pause();
  patch({
    player: {
      moves,
      index: 0,
      title,
      playing: false,
      stages,
      base: state.cursor,
    },
  });
}
export async function playerNext() {
  if (state.solving) return;
  const p = state.player;
  if (!p || state.busy || p.index >= p.moves.length) return;
  const ok = await perform(p.moves[p.index], 'player');
  if (ok && state.player?.moves === p.moves)
    patch({ player: { ...state.player, index: p.index + 1 } });
  else if (!ok) pause();
}
export async function playerPrevious() {
  if (state.solving) return;
  pause();
  const p = state.player;
  if (!p || state.busy || p.index === 0) return;
  if (await perform(inverseMove(p.moves[p.index - 1]), 'undo'))
    patch({ player: { ...p, index: p.index - 1, playing: false } });
}
export async function play() {
  if (!state.player || state.busy || state.solving) return;
  const generation = ++playGeneration;
  patch({ player: { ...state.player, playing: true } });
  while (
    generation === playGeneration &&
    !state.solving &&
    state.player &&
    state.player.index < state.player.moves.length
  ) {
    await playerNext();
  }
  if (state.player && generation === playGeneration)
    patch({ player: { ...state.player, playing: false } });
}
export async function seek(index: number) {
  if (state.solving) return;
  pause();
  const p = state.player;
  if (!p || state.busy) return;
  const target = Math.max(0, Math.min(p.moves.length, index));
  const moves =
    target < p.index
      ? p.moves.slice(target, p.index).reverse().map(inverseMove)
      : p.moves.slice(p.index, target);
  if (!allowMoves(moves)) return;
  const partialTurns = moves.reduce(
    (partial, token) =>
      partialAfterAllowedMove(partial, token, state.settings.turnTolerance),
    state.partialTurns,
  );
  if (target < p.index) {
    const count = p.index - target;
    patch({
      cube: apply(
        state.cube,
        p.moves.slice(target, p.index).reverse().map(inverseMove),
      ),
      cursor: state.cursor - count,
      partialTurns,
      player: { ...p, index: target, playing: false },
    });
  } else {
    const more = p.moves.slice(p.index, target),
      history = [...state.history.slice(0, state.cursor), ...more];
    patch({
      cube: apply(state.cube, more),
      partialTurns,
      history,
      cursor: history.length,
      player: { ...p, index: target, playing: false },
    });
  }
}
export function applyInstant(moves: string[], title?: string) {
  if (state.busy || state.solving) return;
  if (!allowMoves(moves)) return;
  pause();
  const base = state.cursor,
    history = [...state.history.slice(0, state.cursor), ...moves];
  patch({
    cube: apply(state.cube, moves),
    partialTurns: moves.reduce(
      (partial, token) =>
        partialAfterAllowedMove(partial, token, state.settings.turnTolerance),
      state.partialTurns,
    ),
    history,
    cursor: history.length,
    player: title
      ? { moves, title, index: moves.length, playing: false, stages: [], base }
      : null,
  });
}
export function restoreHistory(history: string[], cursor: number) {
  if (state.busy || state.solving) return;
  pause();
  patch({
    cube: apply(solved(), history.slice(0, cursor)),
    history,
    cursor,
    player: null,
    partialTurns: null,
  });
}
export const HISTORY_REPLAY_TITLE = 'History replay';
export function replayHistory() {
  if (state.busy || state.solving) return;
  const moves = state.history.slice(0, state.cursor);
  if (!moves.length) return;
  restoreHistory([], 0);
  loadPlayer(moves, HISTORY_REPLAY_TITLE);
  void play();
}
export function stopReplay() {
  if (!state.player) return;
  pause();
  patch({ player: null });
  notify('回放已终止，魔方停在当前步骤。');
}
export function runAlgorithm(input: string) {
  if (state.busy || state.solving) return;
  try {
    const moves = parseAlgorithm(input);
    if (!moves.length) throw new Error('请先输入算法。');
    if (!allowMoves(moves)) return;
    loadPlayer(moves, 'Algorithm');
    void play();
  } catch (e) {
    notify((e as Error).message);
  }
}
export const cameraActions: {
  fit: () => void;
  reset: () => void;
  face: (face: Face) => void;
  focus: () => void;
} = { fit: () => {}, reset: () => {}, face: () => {}, focus: () => {} };
