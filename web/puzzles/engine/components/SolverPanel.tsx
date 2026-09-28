import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useSession, type Session } from '../session';
import SolverControls from '@/components/workspace/SolverPanel';
import Player from './Player';

export default function SolverPanel({ session }: { session: Session }) {
  const s = useSession(session),
    { t } = useTranslation(),
    [pictures, setPictures] = useState(true);
  return (
    <SolverControls
      pictures={pictures}
      onPicturesChange={setPictures}
      solving={s.solving}
      status={s.solveStatus ? t(s.solveStatus.key, {
        ...s.solveStatus.params,
        kind: s.solveStatus.params?.kindKey ? t(String(s.solveStatus.params.kindKey)) : '',
      }) : ''}
      result={s.solveResult}
      onSolve={() => { void session.solve(pictures); }}
      onCancel={() => session.cancelSolve()}
    >
      <Player session={session} />
    </SolverControls>
  );
}
