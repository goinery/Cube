import { i18n,tx,useLanguage,type Locale } from '@/lib/i18n';
import { alignCube } from '@/puzzles/cube/store';
import { memo,useEffect,useRef,useState } from 'react';
import {
useCube,
patch,
notify,
loadPlayer,
play,
pause,
getState,
} from '@/puzzles/cube/store';
import { checkBeforeSolve,type Preflight } from '@/puzzles/cube/preflight';
import type { CubeState } from '@/puzzles/cube/model';
import type { Appearance } from '@/puzzles/cube/appearance';
import type { Solution,SolveMode,SolveRequest,SolveResponse } from '@/puzzles/engine/solver-types';
import SolverControls from '@/components/workspace/SolverPanel';
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
    [mode, setMode] = useState<SolveMode>('standard'),
    [pictures, setPictures] = useState(true),
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
    patch({ solving: true, solveStatus: tx('motion.aligning') });
    await alignCube();
    if (!getState().solving || request !== solveGeneration.current) return;
    const current = getState();
    const report = checkBeforeSolve(
      current.cube,
      current.history,
      current.cursor,
      current.appearance,
    );
    const usePictures = pictures;
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
    pause();
    patch({ solving: true, solveStatus: tx('solver.initializing') });
    setResult(null);
    let w: Worker;
    try {
      w = new Worker(
        new URL('../../engine/solver.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      cancel();
      notify(tx('solver.failed'));
      return;
    }
    worker.current = w;
    timer.current = setTimeout(() => {
      cancel();
      notify(tx('solver.timeout'));
    }, 60000);
    w.onmessage = (e: MessageEvent<SolveResponse>) => {
      if (worker.current !== w) return;
      if (e.data.type === 'progress') patch({ solveStatus: tx(e.data.message.key, e.data.message.params) });
      else if (e.data.type === 'error') {
        cancel();
        notify(tx(e.data.key));
      } else if (e.data.type === 'result') {
        const r = e.data.result;
        cancel();
        setResult(r);
        if (!r.moves.length) {
          notify(tx('solver.already'));
          return;
        }
        loadPlayer(
          r.moves,
          r.mode === 'cfop'
            ? tx('legacy.m260')
            : tx('player.solution'),
          r.stages.map((stage) => ({
            name: stage.name ?? tx(stage.key, stage.params),
            label: tx(stage.key, stage.params),
            description: stage.descriptionKey ? tx(stage.descriptionKey, stage.params) : '',
            start: stage.start,
            end: stage.end,
          })),
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
      notify(tx('solver.failed'));
    };
    w.postMessage({
      id: 'cube',
      state: current.cube,
      mode,
      pictures: usePictures,
      locale: i18n.language as Locale,
    } satisfies SolveRequest);
  }
  return (
    <SolverControls
      pictures={pictures}
      onPicturesChange={setPictures}
      solving={s.solving}
      busy={s.busy}
      status={s.solveStatus}
      result={result}
      onSolve={() => { void solve(); }}
      onCancel={cancel}
      cfop={{ mode, onModeChange: setMode }}
      notice={block && (
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
    >
      <div className="solver-player" ref={playerRef}>
        <Player />
      </div>
    </SolverControls>
  );
});
