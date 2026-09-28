import AlgorithmEditor from '../workspace/AlgorithmEditor';
import { tx,useLanguage } from '@/lib/i18n';
import { usePyraminx,getState,patch,notify,presetLabel,defaultPresets,runAlgorithm } from '@/lib/pyraminx/store';
import { presetPolicy,validatePresets } from '@/lib/pyraminx/presets';
import { download } from '@/lib/workspace/files';
export default function AlgorithmPanel() {
  useLanguage(); const s = usePyraminx();
  return <AlgorithmEditor presets={s.presets} readPresets={() => getState().presets} policy={presetPolicy} label={presetLabel} create={(p) => p} onChange={(presets) => patch({presets})}
    onPlay={(input) => {  runAlgorithm(input); }} onImport={async (file) => { if(file.size > 3 * 1024 * 1024) throw new Error(tx('legacy.m417')); return validatePresets(JSON.parse(await file.text())); }}
    onExport={() => download(getState().presets, 'AXIS-pyraminx-algorithms.json')} onReset={() => patch({presets: defaultPresets()})} onError={(error) => notify((error as Error).message)} disabled={s.busy || s.solving}/>;
}
