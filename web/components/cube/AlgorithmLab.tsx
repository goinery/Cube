import AlgorithmEditor from '../workspace/AlgorithmEditor';
import { useLanguage } from '@/lib/i18n';
import { getState,notify,runAlgorithm,settings,useCube } from '@/lib/cube/store';
import { algorithmPresetLabel,defaultAlgorithmPresets,exportAlgorithmFile,presetPolicy,readAlgorithmFile } from '@/lib/cube/algorithms';
export default function AlgorithmLab() {
  useLanguage();
  const s = useCube('settings', 'busy', 'solving');
  return <AlgorithmEditor presets={s.settings.algorithmPresets} readPresets={() => getState().settings.algorithmPresets} policy={presetPolicy} label={algorithmPresetLabel} create={(p) => p}
    onChange={(presets) => settings({algorithmPresets: presets})} onPlay={(input) => {  runAlgorithm(input); }} onImport={readAlgorithmFile}
    onExport={() => exportAlgorithmFile(getState().settings.algorithmPresets)} onReset={() => settings({algorithmPresets: defaultAlgorithmPresets()})}
    onError={(error) => notify((error as Error).message)} disabled={s.busy || s.solving}/>;
}
