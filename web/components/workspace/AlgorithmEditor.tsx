import { useRef,useState } from 'react';
import { Download,Upload,Plus,Play,RotateCcw,X } from 'lucide-react';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { tx } from '@/lib/i18n';
import { addPreset,mergePresets,MAX_ALGORITHM_LENGTH,type AlgorithmPreset,type PresetPolicy } from '@/lib/workspace/presets';

export default function AlgorithmEditor<T extends AlgorithmPreset>({ presets, readPresets, policy, label, create, onChange, onPlay, onImport, onExport, onReset, onError, disabled = false }: {
  presets: T[]; readPresets: () => T[]; policy: PresetPolicy;
  label: (preset: T) => string; create: (preset: AlgorithmPreset) => T;
  onChange: (presets: T[]) => void; onPlay: (algorithm: string) => void;
  onImport: (file: File) => Promise<T[]>; onExport: () => void;
  onReset: () => void; onError: (error: unknown) => void; disabled?: boolean;
}) {
  const [algorithm, setAlgorithm] = useState(presets[0]?.algorithm ?? '');
  const [adding, setAdding] = useState(false), [name, setName] = useState(''), [draft, setDraft] = useState(''), [error, setError] = useState(''), [importing, setImporting] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  return <section className="panel-section algorithm-lab">
    <div className="section-head"><h3>{tx('algorithm.title')}</h3><div className="algorithm-file-actions">
      <button aria-label={tx('common.import')} disabled={disabled || importing} onClick={() => file.current?.click()}><Upload size={13}/>{tx('common.import')}</button>
      <button aria-label={tx('common.export')} onClick={onExport}><Download size={13}/>{tx('common.export')}</button>
    </div></div>
    <input type="file" accept="application/json,.json" hidden ref={file} onChange={(e) => {
      const selected = e.target.files?.[0]; e.target.value = ''; if (!selected) return;
      setImporting(true);
      void onImport(selected).then((incoming) => onChange(mergePresets(readPresets(), incoming, policy))).catch(onError).finally(() => setImporting(false));
    }}/>
    <fieldset className="algorithm-presets" aria-label={tx('legacy.m015')}>
      {presets.map((preset, index) => <div className="puzzle-preset" key={index}>
        <button aria-pressed={algorithm === preset.algorithm} className={algorithm === preset.algorithm ? 'active' : ''} onClick={() => setAlgorithm(preset.algorithm)}>{label(preset)}</button>
        <button aria-label={`${tx('common.delete')} ${label(preset)}`} disabled={disabled} onClick={() => onChange(presets.filter((_, i) => i !== index))}><X size={12}/></button>
      </div>)}
      <button className="algorithm-add" disabled={disabled || presets.length >= policy.count} onClick={() => {setName('');setDraft(algorithm);setError('');setAdding(true);}}><Plus size={14}/>{tx('legacy.m016')}</button>
    </fieldset>
    <textarea aria-label={tx('legacy.m017')} value={algorithm} maxLength={MAX_ALGORITHM_LENGTH} spellCheck={false} onChange={(e) => setAlgorithm(e.target.value)}/>
    <button className="wide-button" disabled={disabled || !algorithm.trim()} onClick={() => onPlay(algorithm)}>{tx('algorithm.play')}<Play size={16}/></button>
    <button className="text-button algorithm-reset" disabled={disabled} onClick={onReset}><RotateCcw size={13}/>{tx('legacy.m342')}</button>
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent className="algorithm-add-dialog" onKeyDown={(e) => e.stopPropagation()}>
      <DialogTitle>{tx('legacy.m019')}</DialogTitle><DialogDescription>{tx('legacy.m020')}</DialogDescription>
      <form onSubmit={(e) => {e.preventDefault();if(disabled)return;try {
        const merged = addPreset(readPresets(), create({name, algorithm:draft}), policy);
        onChange(merged);setAlgorithm(merged.at(-1)!.algorithm);setAdding(false);
      } catch(error){setError(error instanceof Error ? error.message : tx('common.error'));}}}>
        <label>{tx('legacy.m021')}<input value={name} maxLength={policy.nameLength} disabled={disabled} onChange={(e) => setName(e.target.value)}/></label>
        <label>{tx('legacy.m023')}<textarea value={draft} maxLength={MAX_ALGORITHM_LENGTH} disabled={disabled} spellCheck={false} onChange={(e) => setDraft(e.target.value)}/></label>
        {error && <p className="algorithm-error" role="alert">{error}</p>}
        <div className="algorithm-add-actions"><button type="button" className="secondary-button" onClick={() => setAdding(false)}>{tx('legacy.m024')}</button><button className="primary-button" disabled={disabled} type="submit">{tx('legacy.m025')}</button></div>
      </form>
    </DialogContent></Dialog>
  </section>;
}
