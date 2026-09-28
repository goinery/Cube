import AlgorithmEditor from '@/components/workspace/AlgorithmEditor';
import { presetPolicy, validatePresets } from '../presets';
import { useTranslation } from '@/lib/i18n';
import { useSession, defaultPresets, type Session } from '../session';
import { download } from '../persistence';

export default function AlgorithmPanel({ session }: { session: Session }) {
  const s = useSession(session), { t } = useTranslation();
  return <AlgorithmEditor presets={s.presets} readPresets={() => session.state.presets} policy={presetPolicy(session.def)} label={(p) => p.labelKey ? t(p.labelKey) : p.name} create={(p) => ({ ...p, id: crypto.randomUUID() })}
    onChange={(presets) => session.patch({presets})} onPlay={(input) => {  session.run(input); }}
    onImport={async (file) => {
      if (file.size > 3 * 1024 * 1024) throw new Error('project.tooLarge');
      const data = JSON.parse(await file.text());
      if (data.puzzleId !== session.def.id) throw new Error('project.invalid');
      return validatePresets(session.def, data.presets).map((p) => ({...p, id: crypto.randomUUID()}));
    }}
    onExport={() => download({puzzleId: session.def.id, presets: session.state.presets}, `axis-${session.def.id}-algorithms.json`)}
    onReset={() => session.patch({presets: defaultPresets(session.def)})} onError={(error) => session.error(error)} disabled={s.solving}/>
}
