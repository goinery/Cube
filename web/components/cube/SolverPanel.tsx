'use client';
import { i18n, tx, useLanguage } from '@/lib/i18n';
import { alignCube } from '@/lib/cube/store';
import { memo, useEffect, useRef, useState } from 'react';
import {
  Zap,
  Route,
  GraduationCap,
  ArrowUpRight,
  LoaderCircle,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  useCube,
  patch,
  notify,
  loadPlayer,
  play,
  pause,
  getState,
} from '@/lib/cube/store';
import { checkBeforeSolve, type Preflight } from '@/lib/cube/preflight';
import type { CubeState } from '@/lib/cube/model';
import type { Appearance } from '@/lib/cube/appearance';
import type { Solution, SolveMode } from '@/lib/cube/solver-core';
import { Toggle } from './Controls';
import Player from './Player';
interface Blocked {
  report: Preflight;
  cube: CubeState;
  appearance: Appearance;
}
function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
export default memo(function SolverPanel() {
  useLanguage();
  const s = useCube(
      'cube',
      'appearance',
      'partialTurns',
      'busy',
      'solving',
      'solveStatus',
      'player',
    ),
    [mode] = useState<SolveMode>('fast'),
    [pictures, setPictures] = useState<boolean | null>(null),
    [blocked, setBlocked] = useState<Blocked | null>(null),
    [result, setResult] = useState<Solution | null>(null);
  const solveGeneration = useRef(0);
  const worker = useRef<Worker | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    playerRef = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
      patch({ solving: false });
    },
    [],
  );
  const block =
    blocked &&
    !s.partialTurns &&
    blocked.cube === s.cube &&
    blocked.appearance === s.appearance
      ? blocked.report
      : null;
  const restorePictures = pictures ?? true;
  function cancel() {
    solveGeneration.current++;
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    patch({ solving: false, solveStatus: '' });
  }
  async function solve() {
    const request = ++solveGeneration.current;
    if (getState().solving || getState().busy) return;
    pause();
    patch({ solving: true, solveStatus: tx('legacy.m256') });
    await alignCube();
    if (!getState().solving || request !== solveGeneration.current) return;
    const current = getState();
    const report = checkBeforeSolve(
      current.cube,
      current.history,
      current.cursor,
      current.appearance,
    );
    const usePictures = pictures ?? report.recommendPictures;
    if (
      !report.valid ||
      !report.needed ||
      (report.colorSolved && !usePictures)
    ) {
      patch({ solving: false, solveStatus: '' });
      setBlocked({
        report,
        cube: current.cube,
        appearance: current.appearance,
      });
      setResult(null);
      return;
    }
    setBlocked(null);
    if (pictures === null) setPictures(usePictures);
    pause();
    patch({ solving: true, solveStatus: tx('legacy.m257') });
    setResult(null);
    let w: Worker;
    try {
      w = new Worker(
        new URL('../../lib/cube/solver.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      cancel();
      notify(tx('legacy.m258'));
      return;
    }
    worker.current = w;
    timer.current = setTimeout(() => {
      cancel();
      notify(tx('legacy.m259'));
    }, 60000);
    w.onmessage = (e) => {
      if (worker.current !== w) return;
      if (e.data.type === 'progress') patch({ solveStatus: e.data.message });
      else if (e.data.type === 'error') {
        cancel();
        notify(e.data.message);
      } else if (e.data.type === 'result') {
        const r = e.data.result as Solution;
        cancel();
        setResult(r);
        loadPlayer(
          r.moves,
          mode === 'cfop'
            ? tx('legacy.m260')
            : mode === 'near'
              ? tx('legacy.m261')
              : tx('legacy.m262'),
          r.stages,
        );
        void play();
        requestAnimationFrame(() =>
          playerRef.current?.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
            behavior: reducedMotion() ? 'auto' : 'smooth',
          }),
        );
      }
    };
    w.onerror = () => {
      if (worker.current !== w) return;
      cancel();
      notify(tx('legacy.m258'));
    };
    w.postMessage({
      cube: current.cube,
      mode,
      pictures: usePictures,
      locale: i18n.language,
    });
  }
  return (
    <>
      <></>
      {block && (
        <div
          className={`preflight ${block.valid ? '' : 'invalid'}`}
          aria-live="polite"
        >
          <strong>
            {!block.valid
              ? tx('legacy.m268')
              : block.pictureSolved
                ? tx('legacy.m269')
                : tx('legacy.m270')}
          </strong>
          <p>{block.message}</p>
          <small>
            {tx('legacy.m271')}
            {block.colorSolved ? tx('legacy.m055') : tx('legacy.m272')}
            {tx('legacy.m273')}
            {block.pictureSolved ? tx('legacy.m055') : tx('legacy.m272')} ·{' '}
            {block.images} {tx('legacy.m274')}
            {block.groups}
            {tx('legacy.m275')}
          </small>
        </div>
      )}
      <Toggle
        label={tx('legacy.m276')}
        value={restorePictures}
        onChange={setPictures}
        disabled={s.solving}
      />
      <></>
      <button
        className="primary-button solve-button"
        disabled={s.busy || s.solving}
        onClick={solve}
      >
        <span>{tx('legacy.m278')}</span>
        {s.solving ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <ArrowUpRight size={18} />
        )}
      </button>
      {s.solving && (
        <output className="solver-progress">
          <LoaderCircle className="spin" size={16} />
          <span>{s.solveStatus}</span>
          <button
            title={tx('legacy.m279')}
            aria-label={tx('legacy.m279')}
            onClick={cancel}
          >
            <X size={17} />
            {tx('legacy.m280')}
          </button>
        </output>
      )}
      {result && (
        <div className="solver-result">
          <CheckCircle2 size={17} />
          <div>
            <strong>
              {result.moves.length}
              {tx('legacy.m281')}
              {(result.elapsed / 1000).toFixed(2)}
              {tx('legacy.m282')}
            </strong>
            <p>
              {tx('legacy.m283')}
              {result.colorMoves}
              {tx('legacy.m057')}
              {result.centerMoves > 0
                ? tx('legacy.m284', { p0: result.centerMoves })
                : ''}
            </p>
          </div>
        </div>
      )}
      <div className="solver-player" ref={playerRef}>
        <Player />
      </div>
      <></>
    </>
  );
});
