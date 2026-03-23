export * from './types';
export { PhrenRoom, type PhrenRoomCallbacks } from './livekit-client';
export { encodeMotionFrame, decodeMotionFrame } from './data-channel';

// Motion solvers
export * from './motion/types';
export { ARKIT_BLEND_SHAPES, BLEND_SHAPE_INDEX, solveFace } from './motion/face-solver';
export {
  midpoint,
  normalize,
  quaternionFromVectors,
  solvePose,
} from './motion/pose-solver';
export { JOINT_LANDMARK_MAP, solveHand, solveHands } from './motion/hand-solver';
export {
  QUALITY_FACE,
  QUALITY_POSE,
  QUALITY_HANDS,
  buildMotionFrame,
} from './motion/frame-encoder';
export { type DecodedMotionFrame, createDecodedFrame } from './motion/frame-decoder';

// Motion capture pipeline (browser-only)
export { MotionCapture, type CaptureConfig } from './motion/capture';
