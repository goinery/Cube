import { getState, loadPlayer, play, settlingTurns } from './store';
import { canTurnSequence } from './interaction';
import {
  isPictureSolved,
  isSolved,
  parseAlgorithm,
  toFaceletString,
} from './model';

interface PageTool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute(input: unknown): unknown;
}
interface PageContext {
  registerTool(
    tool: PageTool,
    options: { signal: AbortSignal },
  ): void | Promise<void>;
}
function readCube() {
  const s = getState();
  return {
    facelets: toFaceletString(s.cube),
    colorSolved: !s.partialTurns && isSolved(s.cube),
    pictureSolved: !s.partialTurns && isPictureSolved(s.cube),
    partialTurns: s.partialTurns,
    magneticTurns: settlingTurns(),
    busy: s.busy,
    solving: s.solving,
    historyIndex: s.cursor,
    playback: s.player
      ? {
          title: s.player.title,
          step: s.player.index,
          total: s.player.moves.length,
          playing: s.player.playing,
        }
      : null,
  };
}
export const cubeTools: PageTool[] = [
  {
    name: 'read_cube_state',
    description:
      'Read the current legal cube state and animation status. Facelets are in URFDLB order.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute(input) {
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).length
      )
        throw new Error('Expected an empty object.');
      return readCube();
    },
  },
  {
    name: 'play_cube_algorithm',
    description:
      'Validate and animate a complete cube algorithm using the visible player. Return the resulting state after playback finishes or the user pauses it.',
    inputSchema: {
      type: 'object',
      properties: {
        algorithm: { type: 'string', minLength: 1, maxLength: 2000 },
      },
      required: ['algorithm'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).some((k) => k !== 'algorithm') ||
        !('algorithm' in input) ||
        typeof input.algorithm !== 'string' ||
        input.algorithm.length > 2000
      )
        throw new Error(
          'Provide an algorithm string of at most 2000 characters.',
        );
      const moves = parseAlgorithm(input.algorithm);
      if (!moves.length || moves.length > 200)
        throw new Error('Provide between 1 and 200 legal moves.');
      const s = getState();
      if (s.busy || s.solving || s.player?.playing)
        throw new Error(
          'The cube is busy. Wait for playback or solving to finish.',
        );
      if (!canTurnSequence(s.partialTurns, moves, s.settings.turnTolerance))
        throw new Error(
          'Align the held layers before turning a perpendicular layer.',
        );
      loadPlayer(moves, 'Algorithm');
      await play();
      return {
        completed:
          getState().player?.moves === moves &&
          getState().player?.index === moves.length,
        ...readCube(),
      };
    },
  },
];
export function registerCubeTools() {
  const context = (document as Document & { modelContext?: PageContext })
    .modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  for (const tool of cubeTools) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  }
  return () => lifecycle.abort();
}
