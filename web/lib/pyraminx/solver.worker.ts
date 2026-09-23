import { setLanguage, type Locale } from '../i18n';
import { tx } from '@/lib/i18n';
import { solvePuzzle } from './solver';
import type { PuzzleState } from './model';
self.onmessage = (event: MessageEvent<PuzzleState & { locale?: Locale }>) => {
  if (event.data.locale) setLanguage(event.data.locale);
  try {
    const result = solvePuzzle(event.data, (status) =>
      self.postMessage({ status }),
    );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : tx('legacy.m505'),
    });
  }
};
