import type { Locale } from '@/lib/i18n';
import type { CubeState } from '../cube/model';
import type { Message, PuzzleId, PuzzleState, Stage } from './types';

export type SolveMode = 'standard' | 'cfop';
export type NxnSolveRequest = {
  pictures: boolean;
} & (
  | { id: 'cube'; state: CubeState; mode: SolveMode }
  | { id: Exclude<PuzzleId, 'megaminx'>; state: PuzzleState; mode: 'standard' }
);
export type SolveRequest = (
  | NxnSolveRequest
  | { id: 'megaminx'; state: PuzzleState; pictures: boolean; mode: 'standard' }
) & { locale?: Locale };

export interface SolveOutput {
  moves: string[];
  stages: Stage[];
  colorMoves?: number;
  centerMoves?: number;
}
export interface Solution extends SolveOutput {
  count: number;
  seconds: number;
  mode: SolveMode;
}
export type SolveResponse =
  | { type: 'progress'; message: Message }
  | { type: 'result'; result: Solution }
  | { type: 'error'; key: string };
