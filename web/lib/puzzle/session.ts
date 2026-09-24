import { useSyncExternalStore } from 'react';
import {
  apply,
  definition,
  inverse,
  inverseMove,
  moveSpec,
  parseAlgorithm,
  solved,
} from './model';
import { defaultAppearance, type Appearance } from './appearance';
import { TurnCoordinator } from './motion';
import type {
  Definition,
  Message,
  PuzzleId,
  PuzzleState,
  Stage,
} from './types';

export interface Settings {
  magnetStrength: number;
  magnetDamping: number;
  turnTolerance: number;
  speed: number;
  easing: 'smooth' | 'magnetic' | 'linear';
  explode: number;
  internal: number;
  gap: number;
  size: number;
  stickerOffset: number;
  minimal: boolean;
  showMagnets: boolean;
  roughness: number;
  autoRotate: boolean;
  lightFollowCamera: boolean;
  lightAzimuth: number;
  lightElevation: number;
  lightIntensity: number;
  quality: 'auto' | 'high' | 'low';
}
export interface Preset {
  id: string;
  name: string;
  algorithm: string;
  labelKey?: string;
}
export interface Player {
  kind: 'scramble' | 'algorithm' | 'solution' | 'history';
  moves: string[];
  index: number;
  playing: boolean;
  base: PuzzleState;
  historyBase: string[];
  stages: Stage[];
}
export interface SessionState {
  puzzle: PuzzleState;
  history: string[];
  cursor: number;
  settings: Settings;
  appearance: Appearance;
  selected: string[];
  editFace: string;
  mode: 'play' | 'explode' | 'customize' | 'solver' | 'camera' | 'inspect';
  view: 'normal' | 'hidden' | 'all' | 'net';
  player: Player | null;
  notice: Message | null;
  solving: boolean;
  solveStatus: Message | null;
  solveResult: { count: number; seconds: number } | null;
  autoSave: boolean;
  presentation: boolean;
  presets: Preset[];
  keys: Record<string, string>;
  motionVersion: number;
  artVersion: number;
  scramble: string;
  hiddenFaces: string[];
  scrambleState?: { puzzle: PuzzleState; history: string[]; cursor: number };
  faceAnchors?: Record<string, import('./hidden-faces').FaceAnchor>;
}
export function defaultSettings(def: Definition): Settings {
  return {
    magnetStrength: 1,
    magnetDamping: 0.7,
    turnTolerance: (def.step * 90) / Math.PI,
    speed: 1,
    easing: 'magnetic',
    explode: 0,
    internal: 1,
    gap: 0.008,
    size: 1,
    stickerOffset: 0,
    minimal: false,
    showMagnets: true,
    roughness: 0.24,
    autoRotate: false,
    lightFollowCamera: true,
    lightAzimuth: -31,
    lightElevation: 50,
    lightIntensity: 2.8,
    quality: 'auto',
  };
}
export function defaultKeys(def: Definition) {
  return Object.fromEntries([
    ...def.faces
      .filter((f) => f.id.length === 1)
      .flatMap((f) => [
        [f.id, `Key${f.id}`],
        [f.id + "'", `Shift+Key${f.id}`],
        [f.id + '2', `Alt+Key${f.id}`],
      ]),
    ['undo', 'Mod+KeyZ'],
    ['redo', 'Mod+Shift+KeyZ'],
    ['playPause', 'Space'],
    ['exitPresentation', 'Escape'],
  ]);
}
export class Session {
  readonly def: Definition;
  readonly motion: TurnCoordinator;
  private listeners = new Set<() => void>();
  private generation = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private worker: Worker | null = null;
  private solveGeneration = 0;
  private previousAutoRotate = false;
  private actionSource: 'manual' | 'undo' | 'redo' = 'manual';
  state: SessionState;
  private contentSnapshot: Omit<SessionState, 'faceAnchors'>;
  camera: {
    fit: () => void;
    reset: () => void;
    focus: () => void;
    face: (id: string) => void;
  } = { fit: () => {}, reset: () => {}, focus: () => {}, face: () => {} };
  constructor(id: PuzzleId) {
    this.def = definition(id);
    const minx = id === 'megaminx';
    this.state = {
      puzzle: solved(this.def),
      history: [],
      cursor: 0,
      settings: defaultSettings(this.def),
      appearance: defaultAppearance(this.def),
      selected: [],
      editFace: 'F',
      mode: 'play',
      view: 'hidden',
      player: null,
      notice: null,
      solving: false,
      solveStatus: null,
      solveResult: null,
      autoSave: false,
      presentation: false,
      presets: [
        {
          id: 'trigger',
          name: '',
          labelKey: 'algorithm.trigger',
          algorithm: "R U R' U'",
        },
        {
          id: 'reverse',
          name: '',
          labelKey: 'algorithm.reverse',
          algorithm: "L' U' L U",
        },
        {
          id: 'pattern',
          name: '',
          labelKey: minx ? 'algorithm.cycle' : 'algorithm.checker',
          algorithm: minx
            ? 'U R F L BL'
            : id === 'cube-2'
              ? 'R2 U2 F2'
              : '2R2 2U2 2F2',
        },
      ],
      keys: defaultKeys(this.def),
      motionVersion: 0,
      artVersion: 0,
      scramble: '',
      hiddenFaces: ['D', 'L', 'B'],
    };
    this.contentSnapshot = this.state;
    this.motion = new TurnCoordinator(
      this.def,
      () => this.state.puzzle,
      () => this.state.settings,
      (token) => this.commit(token),
      () => this.patch({ motionVersion: this.state.motionVersion + 1 }),
    );
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  getContentSnapshot = () => this.contentSnapshot;
  getFaceAnchors = () => this.state.faceAnchors;
  patch(update: Partial<SessionState>) {
    this.state = { ...this.state, ...update };
    // Per-frame label positions must not rerender the controls and solve checks.
    if (Object.keys(update).some((key) => key !== 'faceAnchors'))
      this.contentSnapshot = this.state;
    this.listeners.forEach((fn) => fn());
  }
  settings(update: Partial<Settings>) {
    if (!this.state.solving)
      this.patch({ settings: { ...this.state.settings, ...update } });
  }
  notify(key: string, params?: Message['params']) {
    this.patch({ notice: { key, params } });
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.patch({ notice: null }), 5000);
  }
  error(error: unknown) {
    const key = error instanceof Error ? error.message : 'common.error';
    this.notify(
      /^(algorithm|art|motion|project|solver)\./.test(key)
        ? key
        : 'common.error',
    );
  }
  private commit(token: string) {
    const puzzle = apply(this.def, this.state.puzzle, [token]);
    if (this.actionSource === 'undo') {
      this.patch({ puzzle, cursor: this.state.cursor - 1 });
      return;
    }
    if (this.actionSource === 'redo') {
      this.patch({ puzzle, cursor: this.state.cursor + 1 });
      return;
    }
    const history = [...this.state.history.slice(0, this.state.cursor), token];
    this.patch({
      puzzle,
      history,
      cursor: history.length,
      solveResult:
        this.state.player?.kind === 'solution' ? this.state.solveResult : null,
    });
  }
  async perform(
    token: string,
    source: 'manual' | 'player' | 'undo' | 'redo' = 'manual',
  ) {
    if (this.state.solving) return false;
    if (source === 'manual') {
      this.pause();
      this.patch({ player: null });
    }
    if (!this.motion.canStart(token)) {
      this.notify('motion.outOfTolerance', {
        degrees: this.state.settings.turnTolerance,
      });
      return false;
    }
    this.actionSource =
      source === 'undo' || source === 'redo' ? source : 'manual';
    const result = this.motion.command(token);
    this.actionSource = 'manual';
    return result;
  }
  pause() {
    this.generation++;
    if (this.state.player)
      this.patch({ player: { ...this.state.player, playing: false } });
  }
  stop() {
    this.pause();
  }
  async undo() {
    if (!this.state.cursor || this.state.solving || this.motion.moving) return;
    this.pause();
    this.patch({ player: null });
    await this.perform(
      inverseMove(this.def, this.state.history[this.state.cursor - 1]),
      'undo',
    );
  }
  async redo() {
    if (
      this.state.cursor >= this.state.history.length ||
      this.state.solving ||
      this.motion.moving
    )
      return;
    this.pause();
    this.patch({ player: null });
    await this.perform(this.state.history[this.state.cursor], 'redo');
  }
  reset() {
    this.pause();
    this.cancelSolve();
    this.motion.transition(() =>
      this.patch({
        puzzle: solved(this.def),
        history: [],
        cursor: 0,
        player: null,
        selected: [],
        scramble: '',
        scrambleState: undefined,
        solveResult: null,
      }),
    );
  }
  setAppearance(appearance: Appearance) {
    if (!this.state.solving)
      this.patch({ appearance, artVersion: this.state.artVersion + 1 });
  }
  select(id: string, multiple = true) {
    if (this.state.solving) return;
    const tile = this.def.tiles.find((t) => t.id === id);
    if (!tile) return;
    this.patch({
      selected: multiple
        ? this.state.selected.includes(id)
          ? this.state.selected.filter((x) => x !== id)
          : [...this.state.selected, id]
        : [id],
      editFace: tile.face,
    });
  }
  loadPlayer(
    moves: string[],
    kind: Player['kind'] = 'algorithm',
    stages: Stage[] = [],
  ) {
    this.pause();
    this.patch({
      player: {
        kind,
        moves,
        index: 0,
        playing: false,
        base: structuredClone(this.state.puzzle),
        historyBase: this.state.history.slice(0, this.state.cursor),
        stages,
      },
    });
  }
  async play() {
    const p = this.state.player;
    if (!p || p.playing || this.state.solving) return;
    if (p.index >= p.moves.length) {
      this.seek(0);
      await this.motion.settled();
    }
    const gen = ++this.generation;
    this.patch({ player: { ...this.state.player!, playing: true } });
    while (
      gen === this.generation &&
      this.state.player &&
      this.state.player.index < this.state.player.moves.length
    ) {
      const current = this.state.player;
      if (!this.motion.canStart(current.moves[current.index])) {
        this.notify('motion.outOfTolerance', {
          degrees: this.state.settings.turnTolerance,
        });
        break;
      }
      const pending = this.perform(current.moves[current.index], 'player');
      this.patch({ player: { ...current, index: current.index + 1 } });
      if (!(await pending)) break;
    }
    if (gen === this.generation && this.state.player)
      this.patch({ player: { ...this.state.player, playing: false } });
  }

  async next() {
    const p = this.state.player;
    if (!p || p.index >= p.moves.length || this.motion.moving) return;
    this.pause();
    if (!this.motion.canStart(p.moves[p.index])) return;
    const pending = this.perform(p.moves[p.index], 'player');
    this.patch({ player: { ...p, index: p.index + 1, playing: false } });
    await pending;
  }
  previous() {
    const p = this.state.player;
    if (p && p.index > 0 && !this.motion.moving) this.seek(p.index - 1);
  }
  seek(index: number) {
    const p = this.state.player;
    if (!p || this.state.solving) return;
    this.pause();
    index = Math.min(p.moves.length, Math.max(0, Math.round(index)));
    const moves = p.moves.slice(0, index),
      history = [...p.historyBase, ...moves];
    this.motion.transition(() =>
      this.patch({
        puzzle: apply(this.def, p.base, moves),
        history,
        cursor: history.length,
        player: { ...p, index, playing: false },
      }),
    );
  }
  async replay() {
    if (this.state.solving) return;
    const moves = this.state.history.slice(0, this.state.cursor);
    this.pause();
    const generation = this.generation;
    this.motion.transition(() =>
      this.patch({ puzzle: solved(this.def), history: [], cursor: 0 }),
    );
    await this.motion.settled();
    if (generation !== this.generation) return;
    this.loadPlayer(moves, 'history');
    void this.play();
  }
  run(input: string) {
    try {
      const moves = parseAlgorithm(this.def, input);
      if (!moves.length) {
        this.notify('algorithm.empty');
        return;
      }
      this.loadPlayer(moves);
      void this.play();
    } catch (e) {
      this.error(e);
    }
  }
  rememberScramble(moves: string[]) {
    const history = [
      ...this.state.history.slice(0, this.state.cursor),
      ...moves,
    ];
    this.patch({
      scrambleState: {
        puzzle: apply(this.def, this.state.puzzle, moves),
        history,
        cursor: history.length,
      },
    });
  }
  returnToScramble() {
    const snapshot = this.state.scrambleState;
    if (!snapshot || this.state.solving) return;
    this.pause();
    this.motion.transition(() => this.patch({ ...snapshot, player: null }));
  }
  instant(moves: string[], kind: Player['kind'] = 'scramble') {
    if (this.state.solving) return;
    this.loadPlayer(moves, kind);
    this.seek(moves.length);
  }
  presentation(on: boolean) {
    if (on === this.state.presentation) return;
    if (on) this.previousAutoRotate = this.state.settings.autoRotate;
    this.patch({
      presentation: on,
      settings: {
        ...this.state.settings,
        autoRotate: on ? true : this.previousAutoRotate,
      },
    });
  }
  cancelSolve() {
    this.solveGeneration++;
    this.worker?.terminate();
    this.worker = null;
    this.patch({ solving: false, solveStatus: null });
  }
  async solve(pictures: boolean) {
    if (this.state.solving) return;
    const request = ++this.solveGeneration;
    this.pause();
    this.patch({ solving: true, solveStatus: { key: 'motion.aligning' } });
    this.motion.align(true);
    await this.motion.settled();
    if (!this.state.solving || request !== this.solveGeneration) return;
    this.pause();
    const initial = structuredClone(this.state.puzzle),
      version = JSON.stringify(initial);
    this.patch({
      solving: true,
      solveStatus: { key: 'solver.initializing' },
      solveResult: null,
    });
    let worker: Worker;
    try {
      worker =
        this.worker ??
        new Worker(new URL('./solver.worker.ts', import.meta.url), {
          type: 'module',
        });
      this.worker = worker;
    } catch {
      this.cancelSolve();
      this.notify('solver.failed');
      return;
    }
    worker.onmessage = (event) => {
      if (this.worker !== worker) return;
      const data = event.data;
      if (data.type === 'progress') {
        this.patch({ solveStatus: data.message });
        return;
      }
      this.patch({ solving: false, solveStatus: null });
      if (data.type === 'error') {
        this.notify(data.key);
        return;
      }
      if (JSON.stringify(this.state.puzzle) !== version) return;
      this.patch({
        solveResult: { count: data.moves.length, seconds: data.seconds },
      });
      if (!data.moves.length) {
        this.notify('solver.already');
        return;
      }
      this.loadPlayer(data.moves, 'solution', data.stages);
      void this.play();
    };
    worker.onerror = () => {
      if (this.worker === worker) {
        this.cancelSolve();
        this.notify('solver.failed');
      }
    };
    worker.postMessage({ id: this.def.id, state: initial, pictures });
  }
}
const sessions = new Map<PuzzleId, Session>();
export function getSession(id: PuzzleId) {
  if (!sessions.has(id)) sessions.set(id, new Session(id));
  return sessions.get(id)!;
}
export function useSession(session: Session) {
  return useSyncExternalStore(
    session.subscribe,
    session.getContentSnapshot,
    session.getContentSnapshot,
  );
}
export function useFaceAnchors(session: Session) {
  return useSyncExternalStore(
    session.subscribe,
    session.getFaceAnchors,
    session.getFaceAnchors,
  );
}
export function stopSessions() {
  sessions.forEach((s) => {
    s.stop();
    s.cancelSolve();
  });
}
export function simplify(def: Definition, moves: string[]) {
  const result: string[] = [];
  for (const token of moves) {
    const last = result.at(-1);
    if (last && inverseMove(def, last) === token) {
      result.pop();
      continue;
    }
    if (last && moveSpec(def, last).key === moveSpec(def, token).key) {
      const a = moveSpec(def, last),
        b = moveSpec(def, token),
        cycle = Math.round((2 * Math.PI) / def.step),
        power =
          ((Math.round(-(a.angle + b.angle) / def.step) % cycle) + cycle) %
          cycle;
      result.pop();
      if (power)
        result.push(
          a.key +
            (power === 1
              ? ''
              : power === cycle - 1
                ? "'"
                : power === 2
                  ? '2'
                  : "2'"),
        );
    } else result.push(token);
  }
  return result;
}
