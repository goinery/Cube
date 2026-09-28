import { pause as pauseCube } from '@/puzzles/cube/store';
import { useTranslation } from '@/lib/i18n';
import { STUDIO_DEFAULTS } from '@/puzzles/config';
import { stopSessions } from '@/puzzles/engine/session';
import { lazy,startTransition,Suspense,useEffect,useState } from 'react';
import StudioLoading from '../components/workspace/StudioLoading';
import type { PuzzleType } from '../components/workspace/PuzzleSwitcher';
const CubeApp = lazy(() => import('../puzzles/cube/components/CubeApp'));
const PyraminxApp = lazy(() => import('../puzzles/pyraminx/components/PyraminxApp'));
const PuzzleApp = lazy(() => import('../puzzles/engine/components/PuzzleApp'));
export default function WorkspaceApp() {
  const { t, i18n } = useTranslation();
  const [puzzle, setPuzzle] = useState<PuzzleType>(() => {
    try {
      const saved = localStorage.getItem('axis-active-puzzle');
      return [
        'cube',
        'pyraminx',
        'cube-2',
        'cube-4',
        'cube-5',
        'megaminx',
      ].includes(saved || '')
        ? (saved as PuzzleType)
        : STUDIO_DEFAULTS.activePuzzle;
    } catch {
      return STUDIO_DEFAULTS.activePuzzle;
    }
  });
  useEffect(() => {
    document.title = `AXIS — ${t(`puzzle.${puzzle}`)} · ${t('app.name')}`;
  }, [puzzle, i18n.language, t]);
  function switchPuzzle(next: PuzzleType) {
    pauseCube();
    stopSessions();
    try {
      localStorage.setItem('axis-active-puzzle', next);
    } catch {
      /* Switching remains available when browser storage is disabled. */
    }
    startTransition(() => setPuzzle(next));
  }
  return (
    <Suspense fallback={<StudioLoading />}>
      {puzzle === 'cube' ? (
        <CubeApp onSwitch={switchPuzzle} />
      ) : puzzle === 'pyraminx' ? (
        <PyraminxApp onSwitch={switchPuzzle} />
      ) : (
        <PuzzleApp key={puzzle} id={puzzle} onSwitch={switchPuzzle} />
      )}
    </Suspense>
  );
}
