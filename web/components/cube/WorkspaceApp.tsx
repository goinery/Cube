import { lazy, Suspense, useEffect, useState } from 'react';
import CubeApp from './CubeApp';
import { pause as pauseCube } from '@/lib/cube/store';
import type { PuzzleType } from './PuzzleSwitcher';
const PyraminxApp = lazy(() => import('../pyraminx/PyraminxApp'));
export default function WorkspaceApp() {
  const [puzzle, setPuzzle] = useState<PuzzleType>(() => {
    try {
      return localStorage.getItem('axis-active-puzzle') === 'pyraminx'
        ? 'pyraminx'
        : 'cube';
    } catch {
      return 'cube';
    }
  });
  useEffect(() => {
    document.title = `AXIS / ${puzzle === 'cube' ? '03' : '04'} — ${puzzle === 'cube' ? '三阶魔方' : '金字塔魔方'}工作室`;
  }, [puzzle]);
  function switchPuzzle(next: PuzzleType) {
    pauseCube();
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
    <Suspense fallback={<div className="fatal-error">正在装配金字塔魔方…</div>}>
      <PyraminxApp onSwitch={switchPuzzle} />
    </Suspense>
  );
}
