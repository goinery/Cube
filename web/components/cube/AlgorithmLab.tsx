import { algorithmPresetLabel } from '@/lib/cube/algorithms';
'use client';
import { tx, useLanguage } from '@/lib/i18n';
import { useRef, useState } from 'react';
import { ArrowUpRight, Download, Plus, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getState,
  notify,
  runAlgorithm,
  settings,
  useCube,
} from '@/lib/cube/store';
import {
  defaultAlgorithmPresets,
  exportAlgorithmFile,
  MAX_ALGORITHM_LENGTH,
  MAX_ALGORITHM_PRESETS,
  MAX_PRESET_NAME_LENGTH,
  mergeAlgorithmPresets,
  readAlgorithmFile,
  validateAlgorithmPreset,
} from '@/lib/cube/algorithms';
export default function AlgorithmLab() {
  useLanguage();
  const s = useCube('settings', 'busy', 'solving');
  const [algorithm, setAlgorithm] = useState(
    defaultAlgorithmPresets()[0].algorithm,
  );
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const presets = s.settings.algorithmPresets;
  const normalized = algorithm.trim().replace(/\s+/g, ' ');
  function addPreset(event: React.FormEvent) {
    event.preventDefault();
    if (getState().solving) return;
    try {
      const preset = validateAlgorithmPreset({ name, algorithm: draft });
      const current = getState().settings.algorithmPresets;
      if (current.length >= MAX_ALGORITHM_PRESETS)
        throw new Error(tx('legacy.m001', { p0: MAX_ALGORITHM_PRESETS }));
      if (current.some((item) => item.name === preset.name))
        throw new Error(tx('legacy.m002'));
      const duplicate = current.find(
        (item) => item.algorithm === preset.algorithm,
      );
      if (duplicate) throw new Error(tx('legacy.m003', { p0: duplicate.name }));
      settings({ algorithmPresets: [...current, preset] });
      setAlgorithm(preset.algorithm);
      setAdding(false);
      notify(tx('legacy.m004', { p0: preset.name }));
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function importPresets(file: File) {
    setImporting(true);
    try {
      const incoming = await readAlgorithmFile(file);
      if (getState().solving) throw new Error(tx('legacy.m005'));
      const current = getState().settings.algorithmPresets;
      const merged = mergeAlgorithmPresets(current, incoming);
      const added = merged.length - current.length;
      if (added) settings({ algorithmPresets: merged });
      notify(
        added
          ? tx('legacy.m006', {
              p0: added,
              p1: incoming.length > added ? tx('legacy.m007') : '',
            })
          : tx('legacy.m008'),
      );
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setImporting(false);
    }
  }
  return (
    <section className="panel-section algorithm-lab">
      <div className="section-head">
        <h3>{tx('legacy.m009')}</h3>
        <div className="algorithm-file-actions">
          <button
            disabled={s.solving || importing}
            onClick={() => fileInput.current?.click()}
            title={tx('legacy.m010')}
          >
            <Upload size={13} />
            {importing ? tx('legacy.m011') : tx('legacy.m012')}
          </button>
          <button
            onClick={() => exportAlgorithmFile(presets)}
            title={tx('legacy.m013')}
          >
            <Download size={13} />
            {tx('legacy.m014')}
          </button>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void importPresets(file);
        }}
      />
      <div
        className="algorithm-presets"
        role="group"
        aria-label={tx('legacy.m015')}
      >
        {presets.map((preset) => (
          <button
            key={algorithmPresetLabel(preset)}
            className={normalized === preset.algorithm ? 'active' : ''}
            aria-pressed={normalized === preset.algorithm}
            onClick={() => setAlgorithm(preset.algorithm)}
          >
            {algorithmPresetLabel(preset)}
          </button>
        ))}
        <button
          className="algorithm-add"
          disabled={s.solving || presets.length >= MAX_ALGORITHM_PRESETS}
          onClick={() => {
            setName('');
            setDraft(algorithm);
            setError('');
            setAdding(true);
          }}
        >
          <Plus size={14} />
          {tx('legacy.m016')}
        </button>
      </div>
      <textarea
        aria-label={tx('legacy.m017')}
        value={algorithm}
        onChange={(event) => setAlgorithm(event.target.value)}
        spellCheck={false}
      />
      <button
        className="wide-button"
        disabled={s.busy || s.solving || !algorithm.trim()}
        onClick={() => runAlgorithm(algorithm)}
      >
        {tx('legacy.m018')}
        <ArrowUpRight size={16} />
      </button>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent
          className="algorithm-add-dialog"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DialogTitle>{tx('legacy.m019')}</DialogTitle>
          <DialogDescription>{tx('legacy.m020')}</DialogDescription>
          <form onSubmit={addPreset}>
            <label>
              {tx('legacy.m021')}
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError('');
                }}
                maxLength={MAX_PRESET_NAME_LENGTH}
                placeholder={tx('legacy.m022')}
                disabled={s.solving}
                autoFocus
              />
            </label>
            <label>
              {tx('legacy.m023')}
              <textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError('');
                }}
                maxLength={MAX_ALGORITHM_LENGTH}
                spellCheck={false}
                disabled={s.solving}
              />
            </label>
            {error && (
              <p className="algorithm-error" role="alert">
                {error}
              </p>
            )}
            <div className="algorithm-add-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setAdding(false)}
              >
                {tx('legacy.m024')}
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={s.solving}
              >
                {tx('legacy.m025')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
