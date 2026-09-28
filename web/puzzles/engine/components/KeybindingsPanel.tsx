import ShortcutEditor from '@/components/workspace/ShortcutEditor';
import { useSession, defaultKeys, type Session } from '../session';

export default function KeybindingsPanel({ session }: { session: Session }) {
  const s = useSession(session);
  const actions = [
    ...new Set([
      ...session.def.faces.flatMap((f) => [f.id, f.id + "'", f.id + '2']),
      ...session.def.primitiveMoves,
      ...Object.keys(s.keys),
    ]),
  ];
  return <ShortcutEditor bindings={s.keys} actions={actions} disabled={s.solving}
    onChange={(keys) => session.patch({ keys })}
    onConflict={() => session.notify('keys.conflict')}
    onReset={() => session.patch({ keys: defaultKeys(session.def) })} />;
}
