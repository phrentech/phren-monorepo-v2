import { type MotionFrame } from '../types';
import {
  type FaceSolverOutput,
  type PoseSolverOutput,
  type HandSolverOutput,
  TRACKED_BONES,
  HAND_JOINTS,
} from './types';

const IDENTITY_Q = { x: 0, y: 0, z: 0, w: 1 } as const;

/** Bit flags for MotionFrame.quality */
export const QUALITY_FACE = 0b001 as const;
export const QUALITY_POSE = 0b010 as const;
export const QUALITY_HANDS = 0b100 as const;

/**
 * Combine solver outputs into a MotionFrame ready for transmission.
 *
 * Packing:
 *   - bones:  TRACKED_BONES[i] → floats at i*4 .. i*4+3  (x, y, z, w)
 *   - lh/rh:  HAND_JOINTS[i]  → floats at i*4 .. i*4+3  (x, y, z, w)
 *   - Missing solver data is filled with identity quaternions (w=1).
 *   - quality flags are set for each non-null input.
 */
export function buildMotionFrame(
  timestamp: number,
  face: FaceSolverOutput | null,
  pose: PoseSolverOutput | null,
  leftHand: HandSolverOutput | null,
  rightHand: HandSolverOutput | null,
): MotionFrame {
  // --- Blend shapes (52 floats) ---
  const bs = face ? face.blendShapes.slice() : new Float32Array(52);

  // --- Bone rotations (15 bones * 4 floats = 60) ---
  const bones = new Float32Array(60);
  for (let i = 0; i < TRACKED_BONES.length; i++) {
    const bone = TRACKED_BONES[i]!;
    const q = pose?.boneRotations.get(bone) ?? IDENTITY_Q;
    const offset = i * 4;
    bones[offset]     = q.x;
    bones[offset + 1] = q.y;
    bones[offset + 2] = q.z;
    bones[offset + 3] = q.w;
  }

  // --- Left hand joints (20 joints * 4 floats = 80) ---
  const lh = new Float32Array(80);
  for (let i = 0; i < HAND_JOINTS.length; i++) {
    const joint = HAND_JOINTS[i]!;
    const q = leftHand?.jointRotations.get(joint) ?? IDENTITY_Q;
    const offset = i * 4;
    lh[offset]     = q.x;
    lh[offset + 1] = q.y;
    lh[offset + 2] = q.z;
    lh[offset + 3] = q.w;
  }

  // --- Right hand joints (20 joints * 4 floats = 80) ---
  const rh = new Float32Array(80);
  for (let i = 0; i < HAND_JOINTS.length; i++) {
    const joint = HAND_JOINTS[i]!;
    const q = rightHand?.jointRotations.get(joint) ?? IDENTITY_Q;
    const offset = i * 4;
    rh[offset]     = q.x;
    rh[offset + 1] = q.y;
    rh[offset + 2] = q.z;
    rh[offset + 3] = q.w;
  }

  // --- Quality flags ---
  let quality = 0;
  if (face !== null)                              quality |= QUALITY_FACE;
  if (pose !== null)                              quality |= QUALITY_POSE;
  if (leftHand !== null || rightHand !== null)    quality |= QUALITY_HANDS;

  return { t: timestamp, bs, bones, lh, rh, quality };
}
