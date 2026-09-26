import { STUDIO_DEFAULTS } from '../puzzle-config';

/** One outstanding frame, no background work, and no idle time added to animation. */
export function createFrameLoop(render: (now: number, dt: number) => void) {
  let frame = 0,
    previous = 0,
    disposed = false,
    rendering = false;
  const invalidate = () => {
    if (disposed || frame || document.hidden) return;
    if (!rendering) previous = 0;
    frame = requestAnimationFrame(tick);
  };
  function tick(now: number) {
    frame = 0;
    if (disposed || document.hidden) return;
    const { initialDelta, maxDelta } = STUDIO_DEFAULTS.frame;
    const dt = previous
      ? Math.min(maxDelta, (now - previous) / 1000)
      : initialDelta;
    previous = now;
    rendering = true;
    try {
      render(now, dt);
    } finally {
      rendering = false;
    }
  }
  function visibility() {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
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
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
