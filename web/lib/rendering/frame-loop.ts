import { STUDIO_DEFAULTS } from '@/puzzles/config';
import { createFpsCounter } from './fps';
import { getFrameLimit } from './frame-limit';

/** One outstanding frame and no idle time added to animation. */
export function createFrameLoop(
  render: (now: number, dt: number) => void | boolean,
  options: { measureFps?: boolean } = {},
) {
  const fps = options.measureFps === false ? null : createFpsCounter();
  let frame = 0,
    previous = 0,
    lastRendered = 0,
    nextRender = 0,
    lastLimit = getFrameLimit(),
    disposed = false,
    rendering = false;
  const invalidate = () => {
    if (disposed || frame || document.hidden) return;
    // Input can wake a paused loop many times per second. Keep its render
    // deadline even when restarting animation timing after an idle period.
    if (!rendering) previous = 0;
    frame = requestAnimationFrame(tick);
  };
  function tick(now: number) {
    frame = 0;
    if (disposed || document.hidden) return;
    const limit = getFrameLimit(),
      interval = limit ? 1000 / limit : 0;
    if (limit !== lastLimit) {
      lastLimit = limit;
      nextRender = lastRendered && interval ? lastRendered + interval : 0;
    }
    // Keep a fixed cadence so a display's refresh rate need not divide the cap.
    // Skipped callbacks neither advance animation nor contribute to measured FPS.
    if (interval && now < nextRender) {
      frame = requestAnimationFrame(tick);
      return;
    }
    nextRender = interval
      ? nextRender && now - nextRender < interval
        ? nextRender + interval
        : now + interval
      : 0;
    const { initialDelta, maxDelta } = STUDIO_DEFAULTS.frame;
    const dt = previous
      ? Math.min(maxDelta, (now - previous) / 1000)
      : initialDelta;
    previous = now;
    rendering = true;
    try {
      if (render(now, dt) !== false) {
        lastRendered = now;
        fps?.frame();
      }
    } finally {
      rendering = false;
    }
  }
  function visibility() {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      fps?.reset();
    } else {
      previous = 0;
      invalidate();
    }
  }
  document.addEventListener('visibilitychange', visibility);
  return {
    invalidate,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      fps?.dispose();
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
