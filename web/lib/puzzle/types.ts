import type { Quaternion } from 'three';

export type PuzzleId = 'cube-2' | 'cube-4' | 'cube-5' | 'megaminx';
export type V3 = [number, number, number];
export type V2 = [number, number];
export interface FaceDefinition {
  id: string;
  normal: V3;
  right: V3;
  up: V3;
  center: V3;
  outline: V2[];
  color: string;
}
export interface TileDefinition {
  id: string;
  face: string;
  piece: number;
  outline: V2[];
  center: V2;
}
export interface PieceDefinition {
  id: string;
  kind: 'corner' | 'wing' | 'edge' | 'center' | 'x-center' | 't-center';
  anchor: V3;
  home: V3;
  tiles: string[];
}
export interface RotationGroup {
  quaternions: Quaternion[];
  multiply: number[][];
  inverse: number[];
}
export interface Definition {
  id: PuzzleId;
  order: number;
  step: number;
  faces: FaceDefinition[];
  pieces: PieceDefinition[];
  tiles: TileDefinition[];
  group: RotationGroup;
  primitiveMoves: string[];
}
export interface PuzzleState {
  rotations: number[];
}
export interface Move {
  token: string;
  key: string;
  axis: V3;
  angle: number;
  rotation: number;
  whole: boolean;
  affects: (piece: number, orientation: number) => boolean;
}
export interface MotionSettings {
  easing?: 'smooth' | 'magnetic' | 'linear';
  magnetStrength: number;
  magnetDamping: number;
  turnTolerance: number;
  speed: number;
}
export interface Pose {
  rotation: Quaternion;
}
export interface Message {
  key: string;
  params?: Record<string, string | number>;
}
export interface Stage {
  key: string;
  start: number;
  end: number;
  params?: Record<string, string | number>;
}
