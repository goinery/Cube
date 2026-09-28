import { definition } from './model';
import { solvePuzzle } from './solver';
self.onmessage = async (event) => {
  const started = performance.now();
  try {
    const { id, state, pictures } = event.data;
    const result = await solvePuzzle(
      definition(id),
      state,
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
