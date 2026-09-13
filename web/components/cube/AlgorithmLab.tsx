'use client';
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
        throw new Error(`最多保存 ${MAX_ALGORITHM_PRESETS} 条算法。`);
      if (current.some((item) => item.name === preset.name))
        throw new Error('此名称已被使用，请换一个名称。');
      const duplicate = current.find(
        (item) => item.algorithm === preset.algorithm,
      );
      if (duplicate) throw new Error(`该算法已保存为「${duplicate.name}」。`);
      settings({ algorithmPresets: [...current, preset] });
      setAlgorithm(preset.algorithm);
      setAdding(false);
      notify(`已添加「${preset.name}」。`);
    } catch (error) {
      setError((error as Error).message);
    }
  }

  async function importPresets(file: File) {
    setImporting(true);
    try {
      const incoming = await readAlgorithmFile(file);
      if (getState().solving) throw new Error('请等求解完成后再导入算法。');
      const current = getState().settings.algorithmPresets;
      const merged = mergeAlgorithmPresets(current, incoming);
      const added = merged.length - current.length;
      if (added) settings({ algorithmPresets: merged });
      notify(
        added
          ? `已导入 ${added} 条算法${incoming.length > added ? '，重复算法已跳过' : ''}。`
          : '文件中的算法均已存在。',
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
        <h3>算法实验室</h3>
        <div className="algorithm-file-actions">
          <button
            disabled={s.solving || importing}
            onClick={() => fileInput.current?.click()}
            title="导入算法 JSON"
          >
            <Upload size={13} />
            {importing ? '导入中…' : '导入'}
          </button>
          <button
            onClick={() => exportAlgorithmFile(presets)}
            title="导出全部算法 JSON"
          >
            <Download size={13} />
            导出
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
      <div className="algorithm-presets" role="group" aria-label="切换算法">
        {presets.map((preset) => (
          <button
            key={preset.name}
            className={normalized === preset.algorithm ? 'active' : ''}
            aria-pressed={normalized === preset.algorithm}
            onClick={() => setAlgorithm(preset.algorithm)}
          >
            {preset.name}
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
          添加
        </button>
      </div>
      <textarea
        aria-label="输入魔方算法"
        value={algorithm}
        onChange={(event) => setAlgorithm(event.target.value)}
        spellCheck={false}
      />
      <button
        className="wide-button"
        disabled={s.busy || s.solving || !algorithm.trim()}
        onClick={() => runAlgorithm(algorithm)}
      >
        播放算法 <ArrowUpRight size={16} />
      </button>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent
          className="algorithm-add-dialog"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DialogTitle>添加算法</DialogTitle>
          <DialogDescription>
            为算法命名并保存为切换按钮，可继续编辑当前输入的公式。
          </DialogDescription>
          <form onSubmit={addPreset}>
            <label>
              算法名称
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError('');
                }}
                maxLength={MAX_PRESET_NAME_LENGTH}
                placeholder="为算法起个名字"
                disabled={s.solving}
                autoFocus
              />
            </label>
            <label>
              算法公式
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
                取消
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={s.solving}
              >
                保存算法
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
