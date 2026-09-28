/** Debounce content changes, retain dirty work during motion, and flush on detach. */
export function watchAutosave<T>(options: {
  read: () => T;
  subscribe: (listener: () => void) => () => void;
  equal: (a: T, b: T) => boolean;
  enabled: () => boolean;
  ready: () => boolean;
  save: () => unknown;
  onError: () => void;
  delay?: number;
}) {
  let previous = options.read();
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing = false;
  let detached = false;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty || !options.enabled() || writing) return;
    if (!detached && !options.ready()) return;
    dirty = false;
    writing = true;
    // Invoke synchronously so localStorage can also flush during pagehide.
    try {
      Promise.resolve(options.save()).catch(options.onError).finally(() => {
        writing = false;
        if (detached && dirty) flush();
        else if (dirty) schedule();
      });
    } catch {
      writing = false;
      options.onError();
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    if (dirty && options.enabled() && options.ready())
      timer = setTimeout(flush, options.delay ?? 600);
  };
  const unsubscribe = options.subscribe(() => {
    const next = options.read();
    dirty ||= !options.equal(previous, next);
    previous = next;
    if (!options.enabled()) dirty = false;
    schedule();
  });
  const hide = () => { if (document.visibilityState === 'hidden') flush(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', hide);
  return () => {
    unsubscribe();
    detached = true;
    flush();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', hide);
  };
}

export function sameFields<T>(a: T, b: T, fields: readonly (keyof T)[]) {
  return fields.every((key) => a[key] === b[key]);
}
