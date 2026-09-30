const sampleInterval = 500;
const listeners = new Set<() => void>();
let fps = 0;
let owner: symbol | null = null;

export const getRenderFps = () => fps;
export function subscribeToRenderFps(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Count rendered frames without starting a separate animation loop. */
export function createFpsCounter() {
  const token = Symbol('viewport');
  owner = token;
  let frames = 0,
    started = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  function publish(value: number) {
    if (owner !== token || fps === value) return;
    fps = value;
    listeners.forEach((listener) => listener());
  }
  function reset() {
    clearTimeout(timer);
    timer = undefined;
    frames = 0;
    started = 0;
    publish(0);
  }
  function sample() {
    timer = undefined;
    if (owner !== token) return;
    const now = performance.now();
    publish(Math.round((frames * 1000) / (now - started)));
    if (!frames) {
      started = 0;
      return;
    }
    frames = 0;
    started = now;
    timer = setTimeout(sample, sampleInterval);
  }
  reset();
  return {
    frame() {
      if (owner !== token) return;
      frames++;
      if (timer !== undefined) return;
      started = performance.now();
      timer = setTimeout(sample, sampleInterval);
    },
    reset,
    dispose() {
      reset();
      if (owner === token) owner = null;
    },
  };
}
