import { setLanguage } from '@/lib/i18n';
import { solveRequest } from './solver';
import type { SolveRequest, SolveResponse } from './solver-types';

const send = (response: SolveResponse) => self.postMessage(response);
self.onmessage = async (event: MessageEvent<SolveRequest>) => {
  try {
    if (event.data.locale) setLanguage(event.data.locale);
    const result = await solveRequest(
      event.data,
      (message) => send({ type: 'progress', message }),
    );
    send({ type: 'result', result });
  } catch (error) {
    send({
      type: 'error',
      key:
        error instanceof Error && error.message.startsWith('solver.')
          ? error.message
          : 'solver.failed',
    });
  }
};
