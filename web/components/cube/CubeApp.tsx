'use client';
import { useEffect, useState } from 'react';
import {
  Box,
  Layers3,
  Palette,
  WandSparkles,
  Move3D,
  Scan,
  Undo2,
  Redo2,
  RotateCcw,
  Shuffle,
  Expand,
  Eye,
  ArrowUpRight,
  MousePointer2,
  Keyboard,
  Copy,
  ChevronDown,
  Focus,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Viewport from './Viewport';
import FaceMaps from './FaceMaps';
import Player from './Player';
import CustomizePanel from './CustomizePanel';
import SolverPanel from './SolverPanel';
import { startAutosave } from '@/lib/cube/persistence';
import { registerCubeTools } from '@/lib/cube/webmcp';
import { Range, Choice, Toggle } from './Controls';
import {
  useCube,
  getState,
  pause,
  patch,
  settings,
  perform,
  undo,
  redo,
  resetCube,
  loadPlayer,
  play,
  applyInstant,
  runAlgorithm,
  notify,
  cameraActions,
  restoreHistory,
  type Mode,
  type View,
} from '@/lib/cube/store';
import { FACES, COLORS, isSolved, scramble, type Face } from '@/lib/cube/model';

const modes: [Mode, string, typeof Box][] = [
  ['play', '玩魔方', Box],
  ['explode', '拆解', Layers3],
  ['customize', '定制', Palette],
  ['solver', '求解', WandSparkles],
  ['camera', '视角', Move3D],
  ['inspect', '检查', Scan],
];
const modeTitles: Record<Mode, [string, string]> = {
  play: ['PLAY / EXPLORE', '每一步，都由你掌控。'],
  explode: ['ENGINEERING / 26+1', '拆开，看看精密如何发生。'],
  customize: ['DESIGN / 54 TILES', '把你的灵感，放在每一面。'],
  solver: ['SOLVE / LEARN', '看懂每一步的意义。'],
  camera: ['CAMERA / STUDIO', '换个角度，发现更多。'],
  inspect: ['INSPECT / LIVE', '每个零件，各就其位。'],
};
export default function CubeApp() {
  const s = useCube(),
    [algorithm, setAlgorithm] = useState("R U R' U'"),
    [modifier, setModifier] = useState(''),
    [animateScramble, setAnimateScramble] = useState(true),
    [panelOpen, setPanelOpen] = useState(true);
  useEffect(registerCubeTools, []);
  useEffect(() => {
    let disposed = false,
      cleanup: (() => void) | undefined;
    void startAutosave().then((fn) => {
      if (disposed) fn();
      else cleanup = fn;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable=true],[role=slider],[role=combobox]',
        )
      )
        return;
      if (e.key === 'Escape') {
        patch({ presentation: false });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void (e.shiftKey ? redo() : undo());
        return;
      }
      if (!e.ctrlKey && !e.metaKey && /^[rludfb]$/i.test(e.key)) {
        e.preventDefault();
        void perform(
          e.key.toUpperCase() + (e.altKey ? '2' : e.shiftKey ? "'" : ''),
        );
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (getState().player?.playing) pause();
        else void play();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  function newScramble() {
    if (s.busy || s.solving) return;
    const moves = scramble();
    patch({
      scramble: moves.join(' '),
      scrambleCursor: s.cursor + moves.length,
    });
    if (animateScramble) {
      loadPlayer(moves, 'Scramble');
      void play();
    } else applyInstant(moves, 'Scramble');
  }
  const solved = isSolved(s.cube),
    locked = s.busy || s.solving;
  return (
    <main
      className={`cube-app ${s.presentation ? 'presentation' : ''} ${panelOpen ? '' : 'panel-collapsed'}`}
    >
      <header className="app-header">
        <a href="/" className="brand" aria-label="AXIS 魔方工作室">
          <span className="brand-symbol">
            <Box size={24} strokeWidth={1.5} />
          </span>
          <strong>
            AXIS<span>/</span>03
          </strong>
          <span className="brand-divider" />
          <span className="brand-subtitle">魔方工作室</span>
        </a>
        <div className="header-center">
          MAGNETIC PRECISION CUBE <span>·</span> DIGITAL EDITION
        </div>
        <div className="header-actions">
          <span className="local-badge">
            <i />
            本地工作区
          </span>
          <button
            className="icon-button"
            title="全屏"
            aria-label="全屏"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void document.documentElement
                  .requestFullscreen()
                  .catch(() => notify('可使用浏览器菜单进入全屏。'));
            }}
          >
            <Expand size={18} />
          </button>
          <button
            className="icon-button presentation-toggle"
            disabled={s.solving}
            title="展示模式"
            aria-label="展示模式"
            onClick={() => patch({ presentation: !s.presentation })}
          >
            <Eye size={18} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <section
          className="stage"
          data-solving={s.solving || undefined}
          inert={s.solving}
        >
          <Viewport />
          {s.solving && (
            <div className="solve-lock" aria-live="polite">
              正在计算 · 魔方已锁定 · 可在求解面板终止
            </div>
          )}
          <div className="stage-heading">
            <div className="eyebrow">
              INTERACTIVE OBJECT <span>001</span>
            </div>
            <h1>精密，于指尖。</h1>
            <p>
              3 × 3 × 3 <span>/</span> 磁力竞速魔方
            </p>
          </div>
          <div className="stage-state">
            <i className={solved ? 'solved' : ''} />
            <span>
              {s.currentMove
                ? `转动 ${s.currentMove}`
                : solved
                  ? '已复原'
                  : '自由探索'}
            </span>
            <span className="state-divider" />
            <span>{s.cursor} 步</span>
          </div>
          <div className="view-controls">
            <Choice
              label="视图"
              value={s.view}
              options={[
                ['normal', '纯 3D'],
                ['hidden', '隐藏面映射'],
                ['six', '六面总览'],
                ['net', '平面展开'],
              ]}
              onChange={(v) => patch({ view: v as View })}
            />
          </div>
          <FaceMaps />
          <div className="stage-bottom">
            <div className="interaction-hint">
              <MousePointer2 size={15} />
              <span>
                {s.mode === 'customize'
                  ? '点击贴片多选 · 在右侧编辑外观'
                  : s.mode === 'explode' || s.mode === 'camera'
                    ? '拖动旋转视角 · 双指或滚轮缩放'
                    : s.mode === 'inspect'
                      ? '点击零件查看信息 · 拖动空白旋转视角'
                      : '按住拖动转层 · 松手磁力归位'}
              </span>
            </div>
            <div className="camera-buttons">
              <button
                title="重置视角"
                aria-label="重置视角"
                onClick={() => cameraActions.reset()}
              >
                <RotateCcw size={16} />
              </button>
              <button
                title="适配视图"
                aria-label="适配视图"
                onClick={() => cameraActions.fit()}
              >
                <Focus size={18} />
                <span>适配视图</span>
              </button>
            </div>
          </div>
          <div className="object-spec">
            <span>26 PIECES</span>
            <span>6 AXES</span>
            <span>54 TILES</span>
          </div>
          {!s.ready && (
            <div className="loading-overlay">
              <Box size={36} />
              <strong>AXIS / 03</strong>
              <span>正在装配模型与材质…</span>
              <div className="loading-bar" />
            </div>
          )}
        </section>
        <aside className="control-panel">
          <button
            className="mobile-handle"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen(!panelOpen)}
          >
            <span />
            {panelOpen ? '收起控制面板' : '展开控制面板'}
            <ChevronDown size={16} />
          </button>
          <Tabs
            className="mode-tabs"
            value={s.mode}
            onValueChange={(v) => {
              if (s.solving) return;
              patch({ mode: v as Mode });
              setPanelOpen(true);
            }}
          >
            <TabsList>
              {modes.map(([id, label, Icon]) => (
                <TabsTrigger key={id} value={id} disabled={s.solving}>
                  <Icon size={18} />
                  <span>{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="panel-scroll">
            <div className="panel-heading">
              <span className="eyebrow">{modeTitles[s.mode][0]}</span>
              <h2>{modeTitles[s.mode][1]}</h2>
            </div>
            {s.mode === 'play' && (
              <>
                <div className="quick-actions">
                  <button
                    className="primary-button"
                    onClick={newScramble}
                    disabled={locked}
                  >
                    <Shuffle size={17} />
                    随机打乱
                    <ArrowUpRight size={17} />
                  </button>
                  <button
                    className="secondary-button"
                    onClick={resetCube}
                    disabled={locked}
                  >
                    <RotateCcw size={16} />
                    复原
                  </button>
                </div>
                <div className="history-actions">
                  <button
                    disabled={locked || !s.cursor}
                    onClick={() => void undo()}
                  >
                    <Undo2 size={16} />
                    撤销
                  </button>
                  <button
                    disabled={locked || s.cursor === s.history.length}
                    onClick={() => void redo()}
                  >
                    <Redo2 size={16} />
                    重做
                  </button>
                  <span>
                    {s.cursor} / {s.history.length}
                  </span>
                </div>
                <Toggle
                  label="播放打乱动画"
                  value={animateScramble}
                  onChange={setAnimateScramble}
                />
                {s.scramble && (
                  <div className="scramble-record">
                    <div className="control-label">
                      <span>当前打乱</span>
                      <button
                        aria-label="复制打乱"
                        onClick={() =>
                          void navigator.clipboard.writeText(s.scramble).then(
                            () => notify('打乱已复制。'),
                            () => notify('复制失败，请手动选择文字。'),
                          )
                        }
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <p>{s.scramble}</p>
                  </div>
                )}
                <section className="panel-section">
                  <div className="section-head">
                    <h3>面转动</h3>
                    <div className="modifier-buttons">
                      {['', "'", '2'].map((v) => (
                        <button
                          key={v}
                          aria-pressed={modifier === v}
                          className={modifier === v ? 'active' : ''}
                          onClick={() => setModifier(v)}
                        >
                          {v === '' ? '90°' : v === "'" ? '−90°' : '180°'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="face-moves">
                    {FACES.map((f) => (
                      <button
                        key={f}
                        onClick={() => void perform(f + modifier)}
                        disabled={locked}
                      >
                        <i style={{ background: COLORS[f] }} />
                        <strong>
                          {f}
                          {modifier}
                        </strong>
                      </button>
                    ))}
                  </div>
                  <p className="microcopy">
                    <Keyboard size={14} /> R L U D F B · Shift 反向 · Alt 半转
                  </p>
                </section>
                <section className="panel-section">
                  <div className="section-head">
                    <h3>算法实验室</h3>
                    <span className="tag">NOTATION</span>
                  </div>
                  <textarea
                    aria-label="输入魔方算法"
                    value={algorithm}
                    onChange={(e) => setAlgorithm(e.target.value)}
                    spellCheck={false}
                  />
                  <div className="algorithm-presets">
                    <button onClick={() => setAlgorithm("R U R' U'")}>
                      性感公式
                    </button>
                    <button onClick={() => setAlgorithm('R2 L2 U2 D2 F2 B2')}>
                      棋盘格
                    </button>
                    <button onClick={() => setAlgorithm("R U R' U R U2 R'")}>
                      Sune
                    </button>
                  </div>
                  <button
                    className="wide-button"
                    disabled={locked}
                    onClick={() => runAlgorithm(algorithm)}
                  >
                    播放算法 <ArrowUpRight size={16} />
                  </button>
                </section>
              </>
            )}
            {s.mode === 'explode' && (
              <>
                <div className="engineering-card">
                  <Layers3 size={27} />
                  <div>
                    <strong>从装配，到每一颗磁铁</strong>
                    <p>分层展开，原位聚合。</p>
                  </div>
                  <span>03</span>
                </div>
                <Range
                  label="拆解程度"
                  value={s.settings.explode}
                  min={0}
                  max={3}
                  onChange={(v) => {
                    settings({ explode: v });
                    cameraActions.fit();
                  }}
                />
                <div className="explode-presets">
                  {[
                    [0, '完整'],
                    [1, '分块'],
                    [2, '结构'],
                    [3, '完全拆解'],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      className={
                        Math.abs(s.settings.explode - Number(v)) < 0.03
                          ? 'active'
                          : ''
                      }
                      onClick={() => {
                        settings({ explode: Number(v) });
                        setTimeout(() => cameraActions.fit(), 30);
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <Range
                  label="内部组件分离"
                  value={s.settings.internal}
                  min={0}
                  max={1.5}
                  onChange={(v) => settings({ internal: v })}
                />
                <Range
                  label="块间间隙"
                  value={s.settings.gap}
                  step={0.001}
                  digits={3}
                  min={0}
                  max={0.3}
                  onChange={(v) => settings({ gap: v })}
                />
                <Range
                  label="块体尺寸"
                  value={s.settings.size}
                  min={0.65}
                  max={1.08}
                  onChange={(v) => settings({ size: v })}
                />
                <Range
                  label="贴片偏移"
                  value={s.settings.stickerOffset}
                  min={0}
                  max={0.2}
                  onChange={(v) => settings({ stickerOffset: v })}
                />
                <Toggle
                  label="显示磁性组件"
                  value={s.settings.showMagnets}
                  onChange={(v) => settings({ showMagnets: v })}
                />
                <button
                  className="wide-button"
                  onClick={() => {
                    settings({
                      explode: 0,
                      gap: 0.006,
                      size: 1,
                      stickerOffset: 0.002,
                      internal: 1,
                    });
                    setTimeout(() => cameraActions.reset(), 30);
                  }}
                >
                  恢复完整装配 <RotateCcw size={16} />
                </button>
                <div className="part-legend">
                  <h3>结构索引</h3>
                  <p>
                    <i style={{ background: '#cccfbd' }} />
                    彩色外壳 <span>54</span>
                  </p>
                  <p>
                    <i style={{ background: '#5e6870' }} />
                    角块 / 棱块骨架 <span>8 / 12</span>
                  </p>
                  <p>
                    <i style={{ background: '#b7c4cd' }} />
                    磁力定位 / 轴心磁铁 <span>48 / 16</span>
                  </p>
                  <p>
                    <i style={{ background: '#b1c5a2' }} />
                    中心张力调节 <span>6</span>
                  </p>
                  <p>
                    <i style={{ background: '#333f4a' }} />
                    六轴核心 <span>1</span>
                  </p>
                </div>
              </>
            )}
            {s.mode === 'camera' && (
              <>
                <div className="camera-grid">
                  {FACES.map((f) => (
                    <button key={f} onClick={() => cameraActions.face(f)}>
                      <span>{f}</span>
                      {
                        (
                          {
                            U: '上',
                            D: '下',
                            R: '右',
                            L: '左',
                            F: '前',
                            B: '后',
                          } as Record<Face, string>
                        )[f]
                      }
                      视图
                    </button>
                  ))}
                </div>
                <button
                  className="wide-button"
                  onClick={() => cameraActions.reset()}
                >
                  标准产品视角 <Move3D size={18} />
                </button>
                <button
                  className="wide-button"
                  onClick={() => cameraActions.focus()}
                >
                  所选部件特写 <Focus size={18} />
                </button>
                <button
                  className="wide-button"
                  onClick={() => cameraActions.fit()}
                >
                  适配当前模型 <Focus size={18} />
                </button>
                <Toggle
                  label="自动旋转展示"
                  value={s.settings.autoRotate}
                  onChange={(v) => settings({ autoRotate: v })}
                />
                <Range
                  label="塑料表面粗糙度"
                  value={s.settings.roughness}
                  min={0.18}
                  max={0.65}
                  onChange={(v) => settings({ roughness: v })}
                />
                <Choice
                  label="显示品质"
                  value={s.settings.quality}
                  options={[
                    ['auto', '自动'],
                    ['high', '高品质'],
                    ['low', '流畅'],
                  ]}
                  onChange={(v) =>
                    settings({ quality: v as 'auto' | 'high' | 'low' })
                  }
                />
                <Choice
                  label="转层缓动"
                  value={s.settings.easing}
                  options={[
                    ['magnetic', '磁力吸附'],
                    ['smooth', '平滑'],
                    ['linear', '线性'],
                  ]}
                  onChange={(v) =>
                    settings({ easing: v as 'magnetic' | 'smooth' | 'linear' })
                  }
                />
                <button
                  className="wide-button"
                  onClick={() => patch({ presentation: true })}
                >
                  进入展示模式 <Expand size={17} />
                </button>
                <p className="microcopy">按 Esc 或右上角眼睛按钮退出展示。</p>
              </>
            )}
            {s.mode === 'inspect' && (
              <>
                <div className="inspection-state">
                  <span className="live-dot" />
                  物理状态合法 <strong>26 / 26</strong>
                </div>
                <p className="help-text">
                  点击 3D
                  贴片或辅助面格子，交叉高亮同一贴片。颜色与图片是外观，不会改变魔方的真实状态。
                </p>
                <div className="inspection-list">
                  {s.selected.length ? (
                    s.selected.map((id) => {
                      const p = s.cube.find((p) =>
                        p.stickers.some((t) => t.id === id),
                      )!;
                      return (
                        <div key={id}>
                          <strong>{id}</strong>
                          <span>
                            {p.kind === 'corner'
                              ? '角块'
                              : p.kind === 'edge'
                                ? '棱块'
                                : '中心块'}
                          </span>
                          <code>{p.pos.join(' , ')}</code>
                        </div>
                      );
                    })
                  ) : (
                    <p>选择一个贴片以查看所属零件。</p>
                  )}
                </div>
                <button
                  className="wide-button"
                  disabled={locked || !s.history.length}
                  onClick={() => {
                    const history = s.history.slice(0, s.cursor);
                    restoreHistory([], 0);
                    loadPlayer(history, 'History replay');
                    void play();
                  }}
                >
                  回放操作历史 <ArrowUpRight size={16} />
                </button>
                <button
                  className="wide-button"
                  disabled={
                    locked || !s.scramble || s.cursor < s.scrambleCursor
                  }
                  onClick={() => restoreHistory(s.history, s.scrambleCursor)}
                >
                  回到打乱状态 <RotateCcw size={16} />
                </button>
                <p className="microcopy">
                  转动、撤销与求解共用同一个物理状态；拆解、材质与镜头独立于状态。
                </p>
              </>
            )}
            {s.mode === 'customize' && <CustomizePanel />}
            {s.mode === 'solver' && <SolverPanel />}
            <Player />
            <div className="panel-footer">
              <span>AXIS ENGINE</span>
              <span>
                01.0 <i />
              </span>
            </div>
          </div>
        </aside>
      </div>
      <footer className="app-footer">
        <span>DESIGNED TO BE EXPLORED.</span>
        <span>
          <i />
          {s.mode === 'explode'
            ? `EXPLODE ${s.settings.explode.toFixed(2)}`
            : 'ALL SYSTEMS CONNECTED'}
        </span>
        <span>
          LOCAL FIRST <span>·</span> 3D WORKSPACE
        </span>
      </footer>
      {s.notice && (
        <div role="status" className="toast">
          {s.notice}
        </div>
      )}
    </main>
  );
}
