import { definition } from './model';
import { solveGroup } from './group-solver';
self.onmessage = (event) => {
  const started = performance.now();
  try {
    const { id, state, mode, pictures } = event.data;
    const result = solveGroup(
      definition(id),
      state,
      mode,
      pictures,
      (message) => self.postMessage({ type: 'progress', message }),
    );
    self.postMessage({
      type: 'result',
      ...result,
      seconds: Math.round((performance.now() - started) / 100) / 10,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      key:
        error instanceof Error && error.message.startsWith('solver.')
          ? error.message
          : 'solver.failed',
    });
  }
};
