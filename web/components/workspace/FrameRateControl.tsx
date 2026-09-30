import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from '@/lib/i18n';
import { getRenderFps, subscribeToRenderFps } from '@/lib/rendering/fps';
import {
  DEFAULT_FRAME_LIMIT,
  getFrameLimit,
  setFrameLimit,
  subscribeToFrameLimit,
} from '@/lib/rendering/frame-limit';

const presets = [24, 30, 60, 120, 0];

export default function FrameRateControl() {
  const fps = useSyncExternalStore(subscribeToRenderFps, getRenderFps, () => 0),
    limit = useSyncExternalStore(subscribeToFrameLimit, getFrameLimit, () => DEFAULT_FRAME_LIMIT),
    { t } = useTranslation(),
    panelId = useId(),
    host = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [custom, setCustom] = useState(!presets.includes(limit)),
    [customValue, setCustomValue] = useState(String(limit || DEFAULT_FRAME_LIMIT)),
    [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    }
    // Canvas interactions can stop bubbling; dismiss before they receive input.
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  useEffect(() => {
    if (open && custom) input.current?.focus();
  }, [open, custom]);

  return (
    <div
      className="stage-fps-control"
      ref={host}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="stage-fps"
        title={t('app.fpsHint')}
        aria-label={t('app.fps', { count: fps })}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
      >
        <span className="fps-value">{fps}</span> FPS
      </button>
      {open && (
        <div className="fps-settings" id={panelId}>
          <div className="fps-settings-title">{t('app.fpsLimit')}</div>
          <div className="fps-presets" role="group" aria-label={t('app.fpsLimit')}>
            {presets.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={!custom && limit === value}
                onClick={() => {
                  setCustom(false);
                  setError(false);
                  setFrameLimit(value);
                }}
              >
                {value ? `${value} FPS` : t('app.fpsUnlimited')}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={custom}
              onClick={() => {
                setCustom(true);
                setCustomValue(String(limit || DEFAULT_FRAME_LIMIT));
                setError(false);
              }}
            >
              {t('app.fpsCustom')}
            </button>
          </div>
          {custom && (
            <form
              className="fps-custom"
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(customValue);
                if (!Number.isSafeInteger(value) || value < 1) {
                  setError(true);
                  return;
                }
                setFrameLimit(value);
                setError(false);
              }}
            >
              <label htmlFor={`${panelId}-custom`}>{t('app.fpsCustomLimit')}</label>
              <div>
                <input
                  ref={input}
                  id={`${panelId}-custom`}
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={customValue}
                  aria-invalid={error || undefined}
                  aria-describedby={error ? `${panelId}-error` : undefined}
                  onChange={(event) => {
                    setCustomValue(event.target.value);
                    setError(false);
                  }}
                />
                <button type="submit">{t('app.fpsApply')}</button>
              </div>
              {error && <span id={`${panelId}-error`}>{t('app.fpsInvalid')}</span>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
