import { pause as pauseCube } from '@/lib/cube/store';
import { useTranslation } from '@/lib/i18n';
import { STUDIO_DEFAULTS } from '@/lib/puzzle-config';
import { stopSessions } from '@/lib/puzzle/session';
import { lazy, Suspense, useEffect, useState } from 'react';
import CubeApp from './CubeApp';
import StudioLoading from '../workspace/StudioLoading';
import type { PuzzleType } from './PuzzleSwitcher';
const PyraminxApp = lazy(() => import('../pyraminx/PyraminxApp'));
const PuzzleApp = lazy(() => import('../workspace/PuzzleApp'));
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
    setPuzzle(next);
  }
  return puzzle === 'cube' ? (
    <CubeApp onSwitch={switchPuzzle} />
  ) : (
    <Suspense fallback={<StudioLoading />}>
      {puzzle === 'pyraminx' ? (
        <PyraminxApp onSwitch={switchPuzzle} />
      ) : (
        <PuzzleApp key={puzzle} id={puzzle} onSwitch={switchPuzzle} />
      )}
    </Suspense>
  );
}
