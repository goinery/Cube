import { colorSolved, parseAlgorithm, pictureSolved } from './model';
import type { Session } from './session';
import { t } from '../i18n';

interface PageTool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
}
interface PageContext {
  registerTool: (
    tool: PageTool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
}
export function registerPuzzleTools(session: Session) {
  const context = (document as Document & { modelContext?: PageContext })
    .modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const read = () => ({
    puzzleId: session.def.id,
    rotations: [...session.state.puzzle.rotations],
    colorSolved:
      !session.motion.held && colorSolved(session.def, session.state.puzzle),
    pictureSolved:
      !session.motion.held && pictureSolved(session.def, session.state.puzzle),
    partialTurns: session.motion.capture(),
    busy: session.motion.moving,
    solving: session.state.solving,
    historyIndex: session.state.cursor,
    playback: session.state.player
      ? {
          step: session.state.player.index,
          total: session.state.player.moves.length,
          playing: session.state.player.playing,
        }
      : null,
  });
  const tools: PageTool[] = [
    {
      name: 'read_cube_state',
      description: t('agent.read'),
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: (input) => {
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          Object.keys(input).length
        )
          throw new Error(t('agent.empty'));
        return read();
      },
    },
    {
      name: 'play_cube_algorithm',
      description: t('agent.play'),
      inputSchema: {
        type: 'object',
        properties: {
          algorithm: { type: 'string', minLength: 1, maxLength: 2000 },
        },
        required: ['algorithm'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          Object.keys(input).some((k) => k !== 'algorithm') ||
          !('algorithm' in input) ||
          typeof input.algorithm !== 'string' ||
          input.algorithm.length > 2000
        )
          throw new Error(t('agent.input'));
        const moves = parseAlgorithm(session.def, input.algorithm);
        if (!moves.length || moves.length > 200)
          throw new Error(t('agent.input'));
        if (
          session.state.solving ||
          session.state.player?.playing ||
          session.motion.dragging
        )
          throw new Error(t('agent.busy'));
        session.loadPlayer(moves);
        await session.play();
        return {
          ...read(),
          completed:
            session.state.player?.moves === moves &&
            session.state.player.index === moves.length,
        };
      },
    },
  ];
  for (const tool of tools)
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  return () => lifecycle.abort();
}
