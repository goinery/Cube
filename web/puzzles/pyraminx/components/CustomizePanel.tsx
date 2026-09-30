import { useRef, useState } from 'react';
import { Download, Focus, RotateCcw, Upload, X } from 'lucide-react';
import { tx, useLanguage } from '@/lib/i18n';
import { importImage } from '@/lib/workspace/images';
import { download } from '@/lib/workspace/files';
import PalettePresets from '@/components/workspace/PalettePresets';
import { captureProject, importProject } from '../persistence';
import { FACE_HEIGHT_RATIO } from '../appearance';
import { FACE_COLORS, FACE_NAMES, PYRAMINX_PALETTES, TILES, PIECES } from '../model';
import { cameraActions, defaultColors, getState, notify, patch, usePyraminx, type Photo } from '../store';
import PhotoDialog from './PhotoDialog';
async function readJSON(file: File) {
  if (file.size > 12000000) throw new Error(tx('legacy.m299'));
  return JSON.parse(await file.text());
}
function TilePicker() {
  useLanguage();
  const s = usePyraminx();
  return (
    <div
      className="pyr-tile-picker"
      style={{ aspectRatio: `1 / ${FACE_HEIGHT_RATIO}` }}
      aria-label={tx('legacy.m309')}
    >
      {TILES.filter((t) => t.face === s.editFace).map((tile) => {
        const points = tile.uv
          .map(([x, y]) => `${x * 260},${(1 - y) * 225}`)
          .join(' ');
        return (
          <button
            key={tile.id}
            className="pyr-tile-button"
            disabled={s.solving}
            aria-label={`${tx('puzzle.' + PIECES[tile.piece].kind)} ${tile.id}`}
            aria-pressed={s.selected.includes(tile.id)}
            style={{
              clipPath: `polygon(${tile.uv.map(([x, y]) => `${x * 100}% ${(1 - y) * 100}%`).join(',')})`,
            }}
            onClick={() => {
              patch({
                selected: s.selected.includes(tile.id)
                  ? s.selected.filter((id) => id !== tile.id)
                  : [...s.selected, tile.id],
              });
            }}
          >
            <svg
              viewBox="0 0 260 225"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polygon
                points={points}
                fill={s.colors[tile.id]}
                stroke={s.selected.includes(tile.id) ? '#ffffff' : '#1e1e1e'}
                strokeWidth={s.selected.includes(tile.id) ? 5 : 3}
                strokeLinejoin="round"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
export default function CustomizePanel() {
  useLanguage();
  const s = usePyraminx(), locked = s.busy || s.solving;
  const [color, setColor] = useState(FACE_COLORS[3]),
    [photo, setPhoto] = useState<{
      face: number;
      photo: Photo;
    } | null>(null);
  const importInput = useRef<HTMLInputElement>(null),
    photoInput = useRef<HTMLInputElement>(null);
  async function uploadPhoto(file: File) {
    const face = getState().editFace;
    try { setPhoto({face, photo: {src: await importImage(file), x: 0, y: 0, scale: 1, rotation: 0}}); }
    catch (error) { notify((error as Error).message); }
  }
  return <>

            <div className="section-head">
              <h3>{tx('legacy.m350')}</h3>
              <span className="tag">
                {s.selected.length}
                {tx('legacy.m351')}
              </span>
            </div>
            <div className="face-selector">
              {FACE_NAMES.map((name, i) => (
                <button
                  key={i}
                  className={s.editFace === i ? 'active' : ''}
                  aria-pressed={s.editFace === i}
                  onClick={() => {
                    patch({
                      editFace: i,
                      selected: TILES.filter((t) => t.face === i).map(
                        (t) => t.id,
                      ),
                    });
                    cameraActions.face(i);
                  }}
                >
                  <i style={{ background: FACE_COLORS[i] }} />
                  {name}
                </button>
              ))}
            </div>
            <div className="editor-face">
              <TilePicker />
            </div>
            <div className="selection-actions">
              <button
                disabled={s.solving}
                onClick={() =>
                  patch({
                    selected: TILES.filter((t) => t.face === s.editFace).map(
                      (t) => t.id,
                    ),
                  })
                }
              >
                {tx('legacy.m160')}
              </button>
              <button
                disabled={s.solving}
                onClick={() => patch({ selected: [] })}
              >
                {tx('legacy.m353')}
              </button>
            </div>
            <div className="color-control">
              <label htmlFor="pyr-color">{tx('legacy.m354')}</label>
              <input
                id="pyr-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <button
                className="secondary-button"
                disabled={s.solving || !s.selected.length}
                onClick={() => {
                  const colors = { ...s.colors };
                  s.selected.forEach((id) => {
                    colors[id] = color;
                  });
                  patch({ colors });
                }}
              >
                {tx('legacy.m355')}
              </button>
            </div>
            <PalettePresets
              palettes={PYRAMINX_PALETTES}
              disabled={s.solving}
              onSelect={({ colors }) =>
                patch({
                  colors: Object.fromEntries(
                    TILES.map((tile) => [tile.id, colors[tile.face]]),
                  ),
                })
              }
            />
            <section className="panel-section">
              <h3>{tx('legacy.m356')}</h3>
              <button
                className="wide-button"
                disabled={s.solving}
                onClick={() => photoInput.current?.click()}
              >
                {tx('legacy.m358')}
                <Upload size={16} />
              </button>
              {s.photos[s.editFace] && (
                <>
                  <button
                    className="wide-button"
                    disabled={s.solving}
                    onClick={() =>
                      setPhoto({
                        face: s.editFace,
                        photo: s.photos[s.editFace],
                      })
                    }
                  >
                    {tx('legacy.m176')}
                    <Focus size={16} />
                  </button>
                  <button
                    className="wide-button"
                    disabled={s.solving}
                    onClick={() => {
                      const photos = { ...s.photos };
                      delete photos[s.editFace];
                      patch({ photos });
                    }}
                  >
                    {tx('legacy.m359')}
                    <X size={16} />
                  </button>
                </>
              )}
            </section>
            <section className="panel-section">
              <h3>{tx('legacy.m360')}</h3>
              <button
                className="wide-button"
                disabled={locked}
                onClick={() => download(captureProject(), 'AXIS-pyraminx.json')}
              >
                {tx('legacy.m361')}
                <Download size={16} />
              </button>
              <button
                className="wide-button"
                disabled={locked}
                onClick={() => importInput.current?.click()}
              >
                {tx('legacy.m362')}
                <Upload size={16} />
              </button>
              <button
                className="wide-button"
                disabled={locked}
                onClick={() => patch({ colors: defaultColors(), photos: {} })}
              >
                {tx('legacy.m363')}
                <RotateCcw size={16} />
              </button>
            </section>
                <input
        ref={importInput}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file)
            void readJSON(file)
              .then(
                (value) => {
                  importProject(value);
                  notify(tx('legacy.m400'));
                },
                (error) => notify((error as Error).message),
              )
              .catch((error) => notify((error as Error).message));
        }}
      />
      <input
        ref={photoInput}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void uploadPhoto(file);
        }}
      />
      {photo && (
        <PhotoDialog
          face={photo.face}
          photo={photo.photo}
          onClose={() => setPhoto(null)}
          onApply={(value) => {
            patch({ photos: { ...getState().photos, [photo.face]: value } });
            setPhoto(null);
          }}
        />
      )}
  </>;
}
