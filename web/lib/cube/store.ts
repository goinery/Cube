'use client';
import { useSyncExternalStore } from 'react';
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
export type Mode =
  | 'play'
  | 'camera'
  | 'explode'
  | 'customize'
  | 'solver'
  | 'inspect';
export type View = 'normal' | 'hidden' | 'six' | 'net';
export interface Settings {
  explode: number;
  gap: number;
  size: number;
  stickerOffset: number;
  internal: number;
  speed: number;
  easing: 'smooth' | 'magnetic' | 'linear';
  roughness: number;
  autoRotate: boolean;
  quality: 'auto' | 'high' | 'low';
  showMagnets: boolean;
}
export const defaultSettings = (): Settings => ({
  explode: 0,
  gap: 0.006,
  size: 1,
  stickerOffset: 0.002,
  internal: 1,
  speed: 1,
  easing: 'magnetic',
  roughness: 0.3,
  autoRotate: false,
  quality: 'auto',
  showMagnets: true,
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
  ready: false,
  faceAnchors: {},
};
const initial = state,
  listeners = new Set<() => void>();
export const getState = () => state;
export function patch(update: Partial<AppState>) {
  state = { ...state, ...update };
  listeners.forEach((fn) => fn());
}
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export const useCube = () =>
  useSyncExternalStore(subscribe, getState, () => initial);
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
export function setAnimator(fn: Animator) {
  animate = fn;
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
      pause();
      patch({ player: null });
      manualQueue.push(token);
      return true;
    }
    return false;
  }
  if (source === 'manual') {
    pause();
    patch({ player: null });
  }
  patch({ busy: true, currentMove: token });
  try {
    if (!instant)
      await animate(
        token,
        (310 / state.settings.speed) * (token.includes('2') ? 1.25 : 1),
      );
    const cube = turn(state.cube, token);
    if (source === 'undo') patch({ cube, cursor: state.cursor - 1 });
    else if (source === 'redo') patch({ cube, cursor: state.cursor + 1 });
    else {
      const history = [...state.history.slice(0, state.cursor), token];
      patch({ cube, history, cursor: history.length });
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
  });
  notify('魔方已复原，保留当前外观。');
}
export function loadPlayer(
  moves: string[],
  title: string,
  stages: Stage[] = [],
) {
  if (state.solving || state.busy) return;
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
}
export async function playerPrevious() {
  if (state.solving) return;
  pause();
  const p = state.player;
  if (!p || state.busy || p.index === 0) return;
  await perform(inverseMove(p.moves[p.index - 1]), 'undo');
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
  if (target < p.index) {
    const count = p.index - target;
    patch({
      cube: apply(
        state.cube,
        p.moves.slice(target, p.index).reverse().map(inverseMove),
      ),
      cursor: state.cursor - count,
      player: { ...p, index: target, playing: false },
    });
  } else {
    const more = p.moves.slice(p.index, target),
      history = [...state.history.slice(0, state.cursor), ...more];
    patch({
      cube: apply(state.cube, more),
      history,
      cursor: history.length,
      player: { ...p, index: target, playing: false },
    });
  }
}
export function applyInstant(moves: string[], title?: string) {
  if (state.busy || state.solving) return;
  pause();
  const base = state.cursor,
    history = [...state.history.slice(0, state.cursor), ...moves];
  patch({
    cube: apply(state.cube, moves),
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
  });
}
export function runAlgorithm(input: string) {
  if (state.busy || state.solving) return;
  try {
    const moves = parseAlgorithm(input);
    if (!moves.length) throw new Error('请先输入算法。');
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
