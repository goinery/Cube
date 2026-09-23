import { lazy, Suspense, useEffect, useState } from 'react';
import CubeApp from './CubeApp';
import { pause as pauseCube } from '@/lib/cube/store';
import type { PuzzleType } from './PuzzleSwitcher';
import { useTranslation } from '@/lib/i18n';
import { stopSessions } from '@/lib/puzzle/session';
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
        : 'cube';
    } catch {
      return 'cube';
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
    <Suspense fallback={<div className="fatal-error">{t('app.loading')}</div>}>
      {puzzle === 'pyraminx' ? (
        <PyraminxApp onSwitch={switchPuzzle} />
      ) : (
        <PuzzleApp key={puzzle} id={puzzle} onSwitch={switchPuzzle} />
      )}
    </Suspense>
  );
}
