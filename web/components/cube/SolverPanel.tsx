'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Zap,
  Route,
  GraduationCap,
  ArrowUpRight,
  LoaderCircle,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  useCube,
  patch,
  notify,
  loadPlayer,
  play,
  pause,
  getState,
} from '@/lib/cube/store';
import {
  checkBeforeSolve,
  cubeFingerprint,
  type Preflight,
} from '@/lib/cube/preflight';
import type { Solution, SolveMode } from '@/lib/cube/solver-core';
import { Toggle } from './Controls';
export default function SolverPanel() {
  const s = useCube(),
    [mode, setMode] = useState<SolveMode>('fast'),
    [pictures, setPictures] = useState(true),
    [check, setCheck] = useState<Preflight | null>(null),
    [checkedArt, setCheckedArt] = useState(-1),
    [result, setResult] = useState<Solution | null>(null);
  const worker = useRef<Worker | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
      patch({ solving: false });
    },
    [],
  );
  function cancel() {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    patch({ solving: false, solveStatus: '' });
  }
  function inspect() {
    const current = getState();
    if (current.busy || current.solving) return;
    if (current.partialTurns) {
      notify('请先将错位转层对齐，再检测求解。');
      return;
    }
    pause();
    const report = checkBeforeSolve(
      current.cube,
      current.history,
      current.cursor,
      current.appearance,
    );
    setCheckedArt(current.artVersion);
    setCheck(report);
    setPictures(report.recommendPictures);
    setResult(null);
  }
  function solve() {
    const current = getState();
    if (current.busy || current.solving) return;
    if (current.partialTurns) {
      notify('请先将错位转层对齐，再开始求解。');
      return;
    }
    if (
      !check ||
      check.fingerprint !== cubeFingerprint(current.cube) ||
      checkedArt !== current.artVersion
    ) {
      inspect();
      return;
    }
    if (!check.valid || !check.needed || (check.colorSolved && !pictures))
      return;
    pause();
    patch({ solving: true, solveStatus: '启动求解器…' });
    setResult(null);
    let w: Worker;
    try {
      w = new Worker(
        new URL('../../lib/cube/solver.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      cancel();
      notify('求解器启动失败，请刷新后重试。');
      return;
    }
    worker.current = w;
    timer.current = setTimeout(() => {
      cancel();
      notify('这次搜索用时较长，已取消。可以再次尝试快速求解。');
    }, 60000);
    w.onmessage = (e) => {
      if (worker.current !== w) return;
      if (e.data.type === 'progress') patch({ solveStatus: e.data.message });
      else if (e.data.type === 'error') {
        cancel();
        notify(e.data.message);
      } else if (e.data.type === 'result') {
        const r = e.data.result as Solution;
        cancel();
        setResult(r);
        setCheck(null);
        loadPlayer(
          r.moves,
          mode === 'cfop'
            ? 'CFOP 分阶段还原'
            : mode === 'near'
              ? 'Near-optimal 近优求解'
              : 'Fast 快速求解',
          r.stages,
        );
        void play();
      }
    };
    w.onerror = () => {
      if (worker.current !== w) return;
      cancel();
      notify('求解器启动失败，请刷新后重试。');
    };
    w.postMessage({ cube: current.cube, mode, pictures });
  }
  const stale = Boolean(
    check &&
    (s.partialTurns ||
      check.fingerprint !== cubeFingerprint(s.cube) ||
      checkedArt !== s.artVersion),
  );
  const options: [SolveMode, typeof Zap, string, string][] = [
    ['fast', Zap, 'Fast / 快速', '两阶段搜索，优先速度与稳定性。'],
    ['near', Route, 'Near-optimal / 近优', '尝试更多搜索起点，保留最短候选。'],
    ['cfop', GraduationCap, 'CFOP / 分阶段教学', 'Cross → F2L → OLL → PLL。'],
  ];
  return (
    <>
      <div className="solver-options">
        {options.map(([id, Icon, title, desc]) => (
          <button
            key={id}
            disabled={s.solving}
            className={mode === id ? 'active' : ''}
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
          >
            <Icon size={20} />
            <span>
              <strong>{title}</strong>
              <small>{desc}</small>
            </span>
            <i />
          </button>
        ))}
      </div>
      {check && (
        <div
          className={`preflight ${check.valid ? '' : 'invalid'}`}
          aria-live="polite"
        >
          <strong>
            {stale
              ? '配置已变化，请重新检测'
              : check.valid
                ? '配置合法 · 检查完成'
                : '配置检查未通过'}
          </strong>
          <p>{check.message}</p>
          <small>
            颜色{check.colorSolved ? '已复原' : '待复原'} · 贴片方向
            {check.pictureSolved ? '已复原' : '待复原'} · {check.images}{' '}
            个图片贴片 / {check.groups} 个拼图组
          </small>
          {check.colorSolved && !pictures && (
            <p>仅还原颜色时，无需计算。开启图片方向还原可继续。</p>
          )}
        </div>
      )}
      <Toggle
        label="同时还原图片方向"
        value={pictures}
        onChange={setPictures}
        disabled={s.solving}
      />
      <p className="microcopy">
        照片中心定向可能增加转层步数。近优模式不保证绝对最短解。
      </p>
      <button
        className="primary-button solve-button"
        disabled={
          s.busy ||
          s.solving ||
          Boolean(s.partialTurns) ||
          Boolean(
            check &&
            !stale &&
            (!check.valid || !check.needed || (check.colorSolved && !pictures)),
          )
        }
        onClick={solve}
      >
        <span>
          {!check || stale
            ? '检测并建议解法'
            : !check.needed
              ? '无需计算'
              : '开始计算 · 完成后自动播放'}
        </span>
        {s.solving ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <ArrowUpRight size={18} />
        )}
      </button>
      {s.solving && (
        <output className="solver-progress">
          <LoaderCircle className="spin" size={16} />
          <span>{s.solveStatus}</span>
          <button title="终止计算" aria-label="终止计算" onClick={cancel}>
            <X size={17} />
            终止
          </button>
        </output>
      )}
      {result && (
        <div className="solver-result">
          <CheckCircle2 size={17} />
          <div>
            <strong>
              {result.moves.length} 步 · {(result.elapsed / 1000).toFixed(2)} 秒
            </strong>
            <p>
              颜色还原 {result.colorMoves} 步
              {result.centerMoves > 0
                ? ` + 图片定向 ${result.centerMoves} 步`
                : ''}
            </p>
          </div>
        </div>
      )}
      <div className="cfop-guide">
        <span className="eyebrow">THE FOUR STAGES</span>
        {[
          ['01', 'Cross', '对齐四个十字棱块'],
          ['02', 'F2L', '完成四组角棱配对'],
          ['03', 'OLL', '统一顶层颜色方向'],
          ['04', 'PLL', '排列顶层，还原六面'],
        ].map(([n, title, desc]) => (
          <div key={n}>
            <span>{n}</span>
            <strong>{title}</strong>
            <p>{desc}</p>
          </div>
        ))}
      </div>
    </>
  );
}
