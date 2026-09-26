type Handlers = {
  [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void;
};

export function bindViewportEvents(
  canvas: HTMLCanvasElement,
  handlers: Handlers,
  capture = false,
) {
  const entries = Object.entries(handlers) as [
    keyof HTMLElementEventMap,
    EventListener,
  ][];
  for (const [type, handler] of entries)
    canvas.addEventListener(type, handler, { capture, passive: false });
  return () => {
    for (const [type, handler] of entries)
      canvas.removeEventListener(type, handler, capture);
  };
}
