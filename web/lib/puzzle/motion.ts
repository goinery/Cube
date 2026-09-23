import { Quaternion, Vector3 } from 'three';
import { stepMagnet } from '../cube/interaction';
import { moveSpec } from './model';
import type {
  Definition,
  MotionSettings,
  Move,
  PuzzleState,
  V3,
} from './types';

export interface Track {
  id: number;
  key: string;
  axis: V3;
  pieces: number[];
  angle: number;
  from: number;
  target: number;
  velocity: number;
  started: number;
  duration: number;
  mode: 'held' | 'drag' | 'spring' | 'command' | 'glide';
  resolve?: () => void;
  dragTransition?: { started: number; duration: number };
}
interface Alignment {
  offsets: Map<number, Quaternion>;
  started: number;
  duration: number;
}
export interface MotionDriver {
  step: number;
  count: number;
  pose: (piece: number) => Quaternion;
  move: (token: string) => Move;
  ids: (move: Move) => number[];
  conflicts?: (track: Track, move: Move, ids: number[]) => boolean;
  carry?: (
    track: Track,
    move: Move,
    ids: number[],
  ) => { axis: V3; key: string } | null;
}
const identity = new Quaternion();
export const parallel = (a: V3, b: V3) =>
  Math.abs(new Vector3(...a).dot(new Vector3(...b))) > 0.99999;
const overlap = (a: number[], b: number[]) => a.some((p) => b.includes(p));
export const residual = (angle: number, step: number) =>
  ((((angle + step / 2) % step) + step) % step) - step / 2;

export class TurnCoordinator {
  tracks: Track[] = [];
  private alignments: Alignment[] = [];
  private sequence = 0;
  private last = 0;
  private waiters = new Set<() => void>();
  readonly driver: MotionDriver;
  constructor(
    def: Definition | MotionDriver,
    state: () => PuzzleState,
    private settings: () => MotionSettings,
    private commit: (token: string) => void,
    private changed: () => void,
  ) {
    this.driver =
      'move' in def
        ? def
        : {
            step: def.step,
            count: def.pieces.length,
            pose: (i) => def.group.quaternions[state().rotations[i]].clone(),
            move: (token) => moveSpec(def, token),
            ids: (move) =>
              state().rotations.flatMap((r, i) =>
                move.affects(i, r) ? [i] : [],
              ),
            carry: (track, move) => {
              if (!move.whole) return null;
              const axis = new Vector3(...track.axis).applyQuaternion(
                def.group.quaternions[move.rotation],
              );
              const face = def.faces.find(
                (f) => axis.dot(new Vector3(...f.normal)) > 0.99999,
              );
              if (def.id !== 'megaminx' && /^[xyz]$/.test(track.key)) {
                const component = axis
                    .toArray()
                    .findIndex((n) => Math.abs(n) > 0.9),
                  sign = Math.sign(axis.getComponent(component));
                track.angle *= sign;
                track.from *= sign;
                track.target *= sign;
                track.velocity *= sign;
                return {
                  axis: new Vector3()
                    .setComponent(component, 1)
                    .toArray() as V3,
                  key: ['x', 'y', 'z'][component],
                };
              }
              const key =
                /^[MES]$/.test(track.key) && face
                  ? `${(def.order + 1) / 2}${face.id}`
                  : face
                    ? track.key.replace(
                        /(?:BR|BL|FR|FL|DR|DL|[URFDLB])/,
                        face.id,
                      )
                    : track.key;
              return { axis: axis.toArray() as V3, key };
            },
          };
  }
  get moving() {
    return (
      this.alignments.length > 0 ||
      this.tracks.some(
        (t) =>
          t.mode === 'spring' ||
          t.mode === 'command' ||
          t.mode === 'glide' ||
          Boolean(t.dragTransition),
      )
    );
  }
  get held() {
    return this.tracks.length > 0;
  }
  get dragging() {
    return this.tracks.some((t) => t.mode === 'drag');
  }
  private conflicts(move: Move, ids: number[]) {
    return this.tracks.filter(
      (track) =>
        this.driver.conflicts?.(track, move, ids) ??
        (!move.whole &&
          !parallel(track.axis, move.axis) &&
          overlap(track.pieces, ids)),
    );
  }
  canStart(token: string) {
    const move = this.driver.move(token),
      tol = (this.settings().turnTolerance * Math.PI) / 180;
    return (
      tol >= this.driver.step / 2 - 1e-8 ||
      this.conflicts(move, this.driver.ids(move)).every(
        (track) =>
          Math.abs(residual(track.angle, this.driver.step)) <= tol + 1e-8,
      )
    );
  }
  private progress(a: Alignment, now: number) {
    const u = Math.min(1, Math.max(0, (now - a.started) / a.duration));
    return u * u * (3 - 2 * u);
  }
  private localPose(piece: number, tracks: Track[], now: number) {
    const pose = this.driver.pose(piece);
    for (const a of this.alignments) {
      const q = a.offsets.get(piece);
      if (q) pose.multiply(q.clone().slerp(identity, this.progress(a, now)));
    }
    // Independent bearings rotate before the larger layer which carries them.
    for (const track of [...tracks].sort(
      (a, b) => a.pieces.length - b.pieces.length,
    ))
      if (track.pieces.includes(piece))
        pose.premultiply(
          new Quaternion().setFromAxisAngle(
            new Vector3(...track.axis),
            track.angle,
          ),
        );
    return pose;
  }
  private settleConflicts(conflicts: Track[]) {
    if (!conflicts.length) return;
    const now = performance.now(),
      affected = new Set([
        ...conflicts.flatMap((t) => t.pieces),
        ...this.alignments.flatMap((a) => [...a.offsets.keys()]),
      ]);
    const poses = new Map(
      [...affected].map((p) => [p, this.localPose(p, conflicts, now)]),
    );
    for (const track of conflicts)
      if (track.mode !== 'command') this.normalize(track);
    const offsets = new Map(
      [...poses].map(([p, pose]) => [
        p,
        this.driver.pose(p).invert().multiply(pose),
      ]),
    );
    this.alignments = [
      { offsets, started: now, duration: 220 / this.settings().speed },
    ];
    this.tracks = this.tracks.filter((t) => !conflicts.includes(t));
    conflicts.forEach((t) => t.resolve?.());
  }
  command(token: string): Promise<boolean> {
    if (!this.canStart(token)) return Promise.resolve(false);
    const move = this.driver.move(token);
    this.settleConflicts(this.conflicts(move, this.driver.ids(move)));
    const ids = this.driver.ids(move);
    for (const track of this.tracks) {
      const carried = this.driver.carry?.(track, move, ids);
      if (carried) Object.assign(track, carried);
    }
    this.commit(token);
    return new Promise((resolve) => {
      this.tracks.push({
        id: ++this.sequence,
        key: move.key,
        axis: move.axis,
        pieces: ids,
        angle: -move.angle,
        from: -move.angle,
        target: 0,
        velocity: 0,
        started: performance.now(),
        duration:
          (250 + (Math.abs(move.angle) / this.driver.step) * 45) /
          this.settings().speed,
        mode: 'command',
        resolve: () => resolve(true),
      });
      this.changed();
    });
  }
  beginDrag(token: string): Track | null {
    if (!this.canStart(token)) return null;
    const move = this.driver.move(token);
    const conflicts = this.conflicts(move, this.driver.ids(move));
    this.settleConflicts(conflicts);
    const ids = this.driver.ids(move),
      existing = this.tracks.filter(
        (t) =>
          parallel(t.axis, move.axis) &&
          t.pieces.length === ids.length &&
          t.pieces.every((p) => ids.includes(p)),
      );
    const from = existing.reduce(
      (sum, t) =>
        sum +
        t.angle *
          Math.sign(new Vector3(...t.axis).dot(new Vector3(...move.axis))),
      0,
    );
    this.tracks = this.tracks.filter((t) => !existing.includes(t));
    existing.forEach((t) => t.resolve?.());
    const track: Track = {
      id: ++this.sequence,
      key: move.key,
      axis: move.axis,
      pieces: ids,
      angle: from,
      from,
      target: from,
      velocity: 0,
      started: performance.now(),
      duration: 0,
      mode: 'drag',
    };
    if (conflicts.length)
      track.dragTransition = {
        started: performance.now(),
        duration: 120 / this.settings().speed,
      };
    this.tracks.push(track);
    this.changed();
    return track;
  }
  drag(track: Track, angle: number, velocity: number) {
    if (!this.tracks.includes(track)) return;
    track.target = angle;
    if (!track.dragTransition) track.angle = angle;
    track.velocity = velocity;
    this.changed();
  }
  release(track: Track, cancel = false) {
    if (!this.tracks.includes(track)) return;
    if (
      !cancel &&
      this.settings().magnetStrength === 0 &&
      track.dragTransition
    ) {
      delete track.dragTransition;
      track.mode = 'glide';
      track.from = track.angle;
      track.started = performance.now();
      track.duration = 120 / this.settings().speed;
      this.changed();
      return;
    }
    delete track.dragTransition;
    if (cancel || this.settings().magnetStrength === 0) {
      this.normalize(track);
      track.mode = 'held';
      this.changed();
      return;
    }
    const momentum = Math.max(
      -this.driver.step * 0.3,
      Math.min(this.driver.step * 0.3, track.velocity * 0.065),
    );
    track.target =
      Math.round((track.angle + momentum) / this.driver.step) *
      this.driver.step;
    track.mode = 'spring';
    this.changed();
  }
  private tokenFor(track: Track, angle: number) {
    const cycle = Math.round((2 * Math.PI) / this.driver.step),
      power = ((Math.round(-angle / this.driver.step) % cycle) + cycle) % cycle;
    return power
      ? track.key +
          (power === 1
            ? ''
            : power === cycle - 1
              ? "'"
              : power === 2
                ? '2'
                : "2'")
      : null;
  }
  private normalize(track: Track) {
    const target =
        Math.round(track.angle / this.driver.step) * this.driver.step,
      token = this.tokenFor(track, target);
    if (token) {
      const move = this.driver.move(token),
        ids = this.driver.ids(move);
      for (const other of this.tracks)
        if (other !== track) {
          const carried = this.driver.carry?.(other, move, ids);
          if (carried) Object.assign(other, carried);
        }
      this.commit(token);
    }
    track.angle -= target;
    track.target = track.angle;
    track.velocity = 0;
    if (Math.abs(track.angle) < 1e-6)
      this.tracks = this.tracks.filter((t) => t !== track);
  }
  align(force = false): boolean {
    const tol = (this.settings().turnTolerance * Math.PI) / 180;
    if (
      !force &&
      tol < this.driver.step / 2 - 1e-8 &&
      this.tracks.some(
        (t) => Math.abs(residual(t.angle, this.driver.step)) > tol + 1e-8,
      )
    )
      return false;
    this.settleConflicts([...this.tracks]);
    this.changed();
    this.resolveSettled();
    return true;
  }
  settled() {
    if (!this.moving) return Promise.resolve();
    return new Promise<void>((resolve) => this.waiters.add(resolve));
  }
  private resolveSettled() {
    if (!this.moving) {
      for (const resolve of this.waiters) resolve();
      this.waiters.clear();
    }
  }
  tick(now: number) {
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 1 / 60;
    this.last = now;
    let ended = false;
    this.alignments = this.alignments.filter((a) => {
      if (now >= a.started + a.duration) {
        ended = true;
        return false;
      }
      return true;
    });
    for (const track of [...this.tracks]) {
      if (track.mode === 'drag' && track.dragTransition) {
        const a = track.dragTransition,
          u = Math.min(1, (now - a.started) / a.duration);
        track.angle =
          track.from + (track.target - track.from) * u * u * (3 - 2 * u);
        if (u === 1) delete track.dragTransition;
      }
      if (track.mode === 'held' && this.settings().magnetStrength > 0) {
        track.mode = 'spring';
        track.target = 0;
      }
      if (track.mode === 'spring') {
        if (this.settings().magnetStrength === 0) {
          this.normalize(track);
          track.mode = 'held';
          ended = true;
          continue;
        }
        const next = stepMagnet(
          track.angle,
          track.velocity,
          track.target,
          dt,
          this.settings().magnetStrength,
          this.settings().magnetDamping,
        );
        track.angle = next.angle;
        track.velocity = next.velocity;
        if (
          Math.abs(track.angle - track.target) < 0.0001 &&
          Math.abs(track.velocity) < 0.004
        ) {
          track.angle = track.target;
          this.normalize(track);
          track.resolve?.();
          ended = true;
        }
      } else if (track.mode === 'glide') {
        const u = Math.min(1, (now - track.started) / track.duration);
        track.angle =
          track.from + (track.target - track.from) * u * u * (3 - 2 * u);
        if (u === 1) {
          this.normalize(track);
          track.mode = 'held';
          ended = true;
        }
      } else if (track.mode === 'command') {
        if (Number.isNaN(track.started)) track.started = now;
        const u = Math.min(1, (now - track.started) / track.duration),
          easing = this.settings().easing;
        const e =
          easing === 'linear'
            ? u
            : easing === 'magnetic'
              ? 1 - Math.pow(1 - u, 3)
              : u * u * (3 - 2 * u);
        track.angle = track.from * (1 - e);
        if (u === 1) {
          this.tracks = this.tracks.filter((t) => t !== track);
          track.resolve?.();
          ended = true;
        }
      }
    }
    if (ended) this.changed();
    this.resolveSettled();
  }
  pose(piece: number, now = performance.now()) {
    return this.localPose(piece, this.tracks, now);
  }
  transition(change: () => void, duration = 320) {
    const poses = Array.from({ length: this.driver.count }, (_, i) =>
      this.pose(i),
    );
    this.clear();
    change();
    this.alignments = [
      {
        offsets: new Map(
          poses.map((pose, i) => [
            i,
            this.localPose(i, this.tracks, performance.now())
              .invert()
              .multiply(pose),
          ]),
        ),
        started: performance.now(),
        duration: duration / this.settings().speed,
      },
    ];
    this.changed();
  }
  freeze() {
    for (const t of [...this.tracks])
      if (t.mode !== 'held') {
        if (t.mode === 'command') {
          const progress = Number.isNaN(t.started)
            ? 0
            : Math.min(1, (performance.now() - t.started) / t.duration);
          t.from = t.angle;
          t.duration = Math.max(1, t.duration * (1 - progress));
          t.started = NaN;
        } else {
          this.normalize(t);
          t.mode = 'held';
        }
        t.velocity = 0;
        t.resolve?.();
        t.resolve = undefined;
      }
    this.changed();
    this.resolveSettled();
  }
  clear() {
    const old = this.tracks;
    this.tracks = [];
    this.alignments = [];
    old.forEach((t) => t.resolve?.());
    this.changed();
    this.resolveSettled();
  }
  capture() {
    return this.tracks.map(({ key, axis, pieces, angle }) => ({
      key,
      axis,
      pieces,
      angle,
    }));
  }
  restore(tracks: ReturnType<TurnCoordinator['capture']>) {
    this.clear();
    this.tracks = tracks.map((t) => ({
      ...t,
      id: ++this.sequence,
      from: t.angle,
      target: t.angle,
      velocity: 0,
      started: 0,
      duration: 0,
      mode: 'held',
    }));
    this.changed();
  }
}
