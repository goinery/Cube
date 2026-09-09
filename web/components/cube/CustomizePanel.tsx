'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Upload,
  Download,
  Save,
  FolderOpen,
  RotateCcw,
  Trash2,
  Unlink,
  Type,
} from 'lucide-react';
import { FACES, COLORS, FACE, type Face } from '@/lib/cube/model';
import {
  defaultAppearance,
  defaultTransform,
  faceIds,
  groupBounds,
  importImage,
  removeFromGroups,
  paintSticker,
  loadImage,
  drawGroup,
  type ImageGroup,
} from '@/lib/cube/appearance';
import {
  useCube,
  patch,
  setAppearance,
  notify,
  cameraActions,
} from '@/lib/cube/store';
import {
  saveProject,
  readProject,
  loadProject,
  exportProject,
  importProject,
} from '@/lib/cube/persistence';
import { FaceGrid } from './FaceMaps';
import { Range, Choice } from './Controls';
export default function CustomizePanel() {
  const s = useCube(),
    upload = useRef<HTMLInputElement>(null),
    importRef = useRef<HTMLInputElement>(null),
    preview = useRef<HTMLCanvasElement>(null),
    [loading, setLoading] = useState(false),
    [text, setText] = useState('AXIS');
  const first = s.selected[0],
    firstArt = first ? s.appearance.stickers[first] : null;
  const group = firstArt?.group
    ? s.appearance.groups[firstArt.group]
    : undefined;
  useEffect(() => {
    let active = true;
    const c = preview.current;
    if (!group || !c) {
      return;
    }
    const b = group.bounds || groupBounds(group.members);
    c.width = b.cols * 200;
    c.height = b.rows * 200;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#343b34';
    ctx.fillRect(0, 0, c.width, c.height);
    void loadImage(group.image).then((img) => {
      if (!active) return;
      drawGroup(ctx, img, group, c.width, c.height);
      ctx.strokeStyle = '#ffffff80';
      ctx.lineWidth = 1;
      for (let i = 1; i < b.cols; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 200, 0);
        ctx.lineTo(i * 200, c.height);
        ctx.stroke();
      }
      for (let i = 1; i < b.rows; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 200);
        ctx.lineTo(c.width, i * 200);
        ctx.stroke();
      }
    });
    return () => {
      active = false;
    };
  }, [group, s.artVersion]);
  function updateGroup(update: Partial<ImageGroup>) {
    if (!group) return;
    const a = structuredClone(s.appearance);
    a.groups[group.id] = { ...group, ...update };
    setAppearance(a);
  }
  function chooseFace(face: Face) {
    patch({ editFace: face, selected: faceIds(face) });
    cameraActions.face(face);
  }
  async function addImage(file: File) {
    if (!s.selected.length) {
      notify('请先选择一个或多个贴片。');
      return;
    }
    if (new Set(s.selected.map((id) => id[0])).size > 1) {
      notify('一个拼图组需位于同一原始面，请在面编辑器中重新选择。');
      return;
    }
    setLoading(true);
    try {
      const image = await importImage(file);
      const a = removeFromGroups(s.appearance, s.selected),
        id = crypto.randomUUID();
      a.groups[id] = {
        id,
        members: [...s.selected],
        image,
        bounds: groupBounds(s.selected),
        ...defaultTransform(),
      };
      for (const sid of s.selected)
        a.stickers[sid] = { ...a.stickers[sid], group: id, rotation: 0 };
      setAppearance(a);
      notify(
        s.selected.length === 9
          ? '整面照片已分配到 9 个真实贴片。'
          : `图片已分配到 ${s.selected.length} 个贴片。`,
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function replaceImage(file: File) {
    if (!group) return;
    setLoading(true);
    try {
      updateGroup({ image: await importImage(file) });
      notify('图片已替换，保留当前裁切设置。');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function dissolve() {
    if (!group) return;
    setLoading(true);
    try {
      const a = structuredClone(s.appearance);
      for (const id of group.members) {
        const c = document.createElement('canvas');
        await paintSticker(c, id, s.appearance, 400);
        const gid = crypto.randomUUID();
        a.groups[gid] = {
          id: gid,
          members: [id],
          image: c.toDataURL('image/png'),
          bounds: groupBounds([id]),
          ...defaultTransform(),
        };
        a.stickers[id] = {
          color: a.stickers[id].color,
          rotation: 0,
          group: gid,
        };
      }
      delete a.groups[group.id];
      setAppearance(a);
      notify(
        `图片组已拆分为 ${group.members.length} 个可独立缩放、裁切的贴片。`,
      );
    } finally {
      setLoading(false);
    }
  }
  function applyColor(color: string) {
    if (!s.selected.length) return;
    const a = structuredClone(s.appearance);
    for (const id of s.selected) a.stickers[id].color = color;
    setAppearance(a);
  }
  function addText() {
    if (!s.selected.length) {
      notify('请先选择贴片。');
      return;
    }
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 900;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = firstArt?.color || '#d7e0c1';
    ctx.fillRect(0, 0, 900, 900);
    ctx.fillStyle = '#263027';
    ctx.font = `600 ${Math.min(170, 700 / Math.max(1, text.length))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 50), 450, 450);
    c.toBlob((blob) => {
      if (blob)
        void addImage(new File([blob], 'text.png', { type: 'image/png' }));
    });
  }
  const handleError = (e: unknown) => notify((e as Error).message);
  return (
    <>
      <div className="face-selector">
        {FACES.map((f) => (
          <button
            key={f}
            className={s.editFace === f ? 'active' : ''}
            aria-pressed={s.editFace === f}
            onClick={() => chooseFace(f)}
          >
            <i style={{ background: COLORS[f] }} />
            {f}
          </button>
        ))}
      </div>
      <div className="edit-grid-heading">
        <span>{FACE[s.editFace].name}面 · 原始贴片布局</span>
        <button onClick={() => patch({ selected: faceIds(s.editFace) })}>
          选择整面
        </button>
      </div>
      <div className="editor-face">
        <FaceGrid face={s.editFace} home large />
      </div>
      <div className="selection-actions">
        <span>已选 {s.selected.length} / 54</span>
        <button onClick={() => patch({ selected: [] })}>清空选择</button>
        <button
          onClick={() =>
            patch({
              selected: faceIds(s.editFace).filter(
                (id) => !s.selected.includes(id),
              ),
            })
          }
        >
          反选本面
        </button>
      </div>
      <p className="microcopy">
        点击格子多选。整面选中后上传，9
        格共同组成一张照片。打乱时图片跟随实体块。
      </p>
      <input
        ref={upload}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addImage(file);
          e.target.value = '';
        }}
      />
      <button
        className="upload-zone"
        disabled={loading || !s.selected.length}
        onClick={() => upload.current?.click()}
      >
        <ImagePlus size={23} />
        <strong>
          {loading
            ? '正在处理图片…'
            : s.selected.length === 9
              ? '上传整面照片'
              : '创建图片组 / 上传图片'}
        </strong>
        <span>PNG · JPG · WebP / 最多 25 MB</span>
      </button>
      <div className="color-control">
        <span>所选贴片颜色</span>
        <label className="color-input">
          <input
            aria-label="所选贴片颜色"
            type="color"
            value={firstArt?.color || COLORS[s.editFace]}
            disabled={!s.selected.length}
            onChange={(e) => applyColor(e.target.value)}
          />
          <code>{firstArt?.color || '—'}</code>
        </label>
      </div>
      {group && (
        <section className="image-editor">
          <div className="section-head">
            <h3>图片组 · {group.members.length} 格</h3>
            <button
              className="text-button"
              onClick={() => patch({ selected: [...group.members] })}
            >
              选中此组
            </button>
          </div>
          <div className="image-previews">
            <div>
              <span>原图 / 裁切范围</span>
              <div className="source-image">
                <img src={group.image} alt="上传的原始图片" />
                <i
                  style={{
                    left: `${group.cropX * 100}%`,
                    top: `${group.cropY * 100}%`,
                    width: `${group.cropW * 100}%`,
                    height: `${group.cropH * 100}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <span>贴片分割预览</span>
              <canvas ref={preview} />
            </div>
          </div>
          <Choice
            label="图片适配"
            value={group.fit}
            options={[
              ['fill', 'Fill / 覆盖'],
              ['fit', 'Fit / 完整'],
              ['crop', 'Crop / 裁切'],
            ]}
            onChange={(v) => updateGroup({ fit: v as ImageGroup['fit'] })}
          />
          <Range
            label="缩放"
            value={group.scale}
            min={0.1}
            max={4}
            onChange={(scale) => updateGroup({ scale })}
            unit="×"
          />
          <Range
            label="水平偏移"
            value={group.x}
            min={-1}
            max={1}
            onChange={(x) => updateGroup({ x })}
          />
          <Range
            label="垂直偏移"
            value={group.y}
            min={-1}
            max={1}
            onChange={(y) => updateGroup({ y })}
          />
          <Range
            label="图片旋转"
            value={group.rotation}
            min={-180}
            max={180}
            step={1}
            digits={0}
            unit="°"
            onChange={(rotation) => updateGroup({ rotation })}
          />
          {group.fit === 'crop' && (
            <div className="crop-controls">
              <Range
                label="裁切左边界"
                value={group.cropX}
                min={0}
                max={0.95}
                onChange={(cropX) =>
                  updateGroup({
                    cropX,
                    cropW: Math.min(group.cropW, 1 - cropX),
                  })
                }
              />
              <Range
                label="裁切上边界"
                value={group.cropY}
                min={0}
                max={0.95}
                onChange={(cropY) =>
                  updateGroup({
                    cropY,
                    cropH: Math.min(group.cropH, 1 - cropY),
                  })
                }
              />
              <Range
                label="裁切宽度"
                value={group.cropW}
                min={0.05}
                max={1 - group.cropX}
                onChange={(cropW) => updateGroup({ cropW })}
              />
              <Range
                label="裁切高度"
                value={group.cropH}
                min={0.05}
                max={1 - group.cropY}
                onChange={(cropH) => updateGroup({ cropH })}
              />
            </div>
          )}
          <div className="image-actions">
            <button onClick={() => updateGroup(defaultTransform())}>
              <RotateCcw size={14} />
              居中重置
            </button>
            <label className="file-button">
              <Upload size={14} />
              替换图片
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  if (e.target.files?.[0]) void replaceImage(e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <button disabled={loading} onClick={() => void dissolve()}>
              <Unlink size={14} />
              解散组
            </button>
          </div>
        </section>
      )}
      {firstArt?.image && !group && (
        <button
          className="wide-button"
          onClick={() => {
            const a = structuredClone(s.appearance),
              gid = crypto.randomUUID();
            a.groups[gid] = {
              id: gid,
              members: [first],
              image: firstArt.image!,
              bounds: groupBounds([first]),
              ...defaultTransform(),
            };
            a.stickers[first].group = gid;
            delete a.stickers[first].image;
            setAppearance(a);
          }}
        >
          编辑独立贴片的缩放与裁切 <ImagePlus size={15} />
        </button>
      )}
      {first && (
        <>
          <Range
            label="所选贴片独立朝向"
            value={firstArt?.rotation || 0}
            min={-180}
            max={180}
            step={90}
            digits={0}
            unit="°"
            onChange={(rotation) => {
              const a = structuredClone(s.appearance);
              for (const id of s.selected) a.stickers[id].rotation = rotation;
              setAppearance(a);
            }}
          />
          <div className="image-actions">
            <button
              onClick={() =>
                setAppearance(removeFromGroups(s.appearance, s.selected))
              }
            >
              <Trash2 size={14} />
              移除所选图片
            </button>
            <button
              onClick={() => {
                const a = removeFromGroups(s.appearance, s.selected);
                for (const id of s.selected)
                  a.stickers[id] = {
                    color: COLORS[id[0] as Face],
                    rotation: 0,
                  };
                setAppearance(a);
              }}
            >
              <RotateCcw size={14} />
              重置所选
            </button>
          </div>
        </>
      )}
      <section className="panel-section">
        <h3>文字与配色</h3>
        <div className="text-design">
          <input
            aria-label="贴片文字"
            value={text}
            maxLength={50}
            onChange={(e) => setText(e.target.value)}
          />
          <button title="应用文字" aria-label="应用文字" onClick={addText}>
            <Type size={18} />
          </button>
        </div>
        <div className="palette-presets">
          {[
            ['原厂', Object.values(COLORS)],
            [
              '矿物',
              [
                '#ded9cd',
                '#a15e50',
                '#6c9985',
                '#cfb666',
                '#c18a61',
                '#627e99',
              ],
            ],
            [
              '石墨',
              [
                '#e9e8e0',
                '#484d50',
                '#757e75',
                '#afb5a4',
                '#92928a',
                '#636d75',
              ],
            ],
          ].map(([label, colors]) => (
            <button
              key={label as string}
              onClick={() => {
                const a = structuredClone(s.appearance);
                FACES.forEach((f, i) =>
                  faceIds(f).forEach((id) => {
                    a.stickers[id].color = (colors as string[])[i];
                  }),
                );
                setAppearance(a);
              }}
            >
              <span>
                {(colors as string[]).slice(0, 4).map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              {label}
            </button>
          ))}
        </div>
      </section>
      <section className="panel-section">
        <div className="section-head">
          <h3>保存我的作品</h3>
          <span className="tag">自动保存</span>
        </div>
        <div className="project-actions">
          <button
            disabled={s.busy || s.solving}
            onClick={() =>
              void saveProject().then(
                () => notify('完整方案已保存到本机。'),
                handleError,
              )
            }
          >
            <Save size={16} />
            保存方案
          </button>
          <button
            disabled={s.busy || s.solving}
            onClick={() =>
              void readProject()
                .then((p) => {
                  if (p) {
                    loadProject(p);
                    notify('已载入保存的方案。');
                  } else notify('尚未保存方案。');
                })
                .catch(handleError)
            }
          >
            <FolderOpen size={16} />
            载入方案
          </button>
          <button onClick={exportProject}>
            <Download size={16} />
            导出文件
          </button>
          <button
            disabled={s.busy || s.solving}
            onClick={() => importRef.current?.click()}
          >
            <Upload size={16} />
            导入文件
          </button>
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              void importProject(f).then(
                () => notify('方案已导入。'),
                handleError,
              );
            e.target.value = '';
          }}
        />
        <p className="microcopy">
          图片仅保存在你的浏览器。导出文件包含全部图片、编辑参数与魔方状态，可在其他设备导入。
        </p>
        <button
          className="wide-button"
          onClick={() => {
            setAppearance(defaultAppearance());
            notify('六面外观已恢复原厂设置。');
          }}
        >
          恢复全部默认外观 <RotateCcw size={15} />
        </button>
      </section>
    </>
  );
}
