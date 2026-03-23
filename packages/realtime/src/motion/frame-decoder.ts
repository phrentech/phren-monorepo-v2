import { type MotionFrame } from '../types';
import {
  type TrackedBone,
  type HandJoint,
  type Quaternion,
  TRACKED_BONES,
  HAND_JOINTS,
} from './types';
import { BLEND_SHAPE_INDEX } from './face-solver';

export interface DecodedMotionFrame {
  /** Raw MotionFrame this wraps */
  readonly frame: MotionFrame;

  /** Get a single blend shape value by ARKit name, or 0 if not found */
  getBlendShape(name: string): number;

  /** Get all 52 blend shape values as a Float32Array view (zero-copy) */
  getAllBlendShapes(): Float32Array;

  /** Get a bone rotation quaternion by TrackedBone name */
  getBoneRotation(bone: TrackedBone): Quaternion;

  /** Get a left-hand joint rotation quaternion by HandJoint name */
  getLeftHandJoint(joint: HandJoint): Quaternion;

  /** Get a right-hand joint rotation quaternion by HandJoint name */
  getRightHandJoint(joint: HandJoint): Quaternion;
}

// Pre-build index maps for O(1) lookup
const BONE_INDEX = new Map<TrackedBone, number>(
  TRACKED_BONES.map((bone, i) => [bone, i]),
);

const HAND_JOINT_INDEX = new Map<HandJoint, number>(
  HAND_JOINTS.map((joint, i) => [joint, i]),
);

const IDENTITY_Q: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

function readQuaternion(array: Float32Array, index: number): Quaternion {
  const offset = index * 4;
  return {
    x: array[offset]     ?? 0,
    y: array[offset + 1] ?? 0,
    z: array[offset + 2] ?? 0,
    w: array[offset + 3] ?? 1,
  };
}

/**
 * Create a zero-copy wrapper around a MotionFrame that exposes named accessors.
 */
export function createDecodedFrame(frame: MotionFrame): DecodedMotionFrame {
  return {
    frame,

    getBlendShape(name: string): number {
      const idx = BLEND_SHAPE_INDEX.get(name);
      if (idx === undefined) return 0;
      return frame.bs[idx] ?? 0;
    },

    getAllBlendShapes(): Float32Array {
      // Return a view of the underlying buffer — zero-copy
      return frame.bs;
    },

    getBoneRotation(bone: TrackedBone): Quaternion {
      const idx = BONE_INDEX.get(bone);
      if (idx === undefined) return { ...IDENTITY_Q };
      return readQuaternion(frame.bones, idx);
    },

    getLeftHandJoint(joint: HandJoint): Quaternion {
      const idx = HAND_JOINT_INDEX.get(joint);
      if (idx === undefined) return { ...IDENTITY_Q };
      return readQuaternion(frame.lh, idx);
    },

    getRightHandJoint(joint: HandJoint): Quaternion {
      const idx = HAND_JOINT_INDEX.get(joint);
      if (idx === undefined) return { ...IDENTITY_Q };
      return readQuaternion(frame.rh, idx);
    },
  };
}
