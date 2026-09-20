import { solvePuzzle } from './solver';
import type { PuzzleState } from './model';
self.onmessage = (event: MessageEvent<PuzzleState>) => {
  try {
    const result = solvePuzzle(event.data, (status) =>
      self.postMessage({ status }),
    );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : '求解失败。',
    });
  }
};
