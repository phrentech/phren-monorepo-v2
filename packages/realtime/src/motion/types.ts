// ---------------------------------------------------------------------------
// MediaPipe Tasks Vision output types
// ---------------------------------------------------------------------------

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface FaceBlendShapes {
  categories: Array<{ categoryName: string; score: number }>;
}

export interface FaceLandmarkerResult {
  faceLandmarks: Landmark[][];
  faceBlendshapes?: FaceBlendShapes[];
}

export interface PoseLandmarkerResult {
  landmarks: Landmark[][];
  worldLandmarks: Landmark[][];
}

export interface HandLandmarkerResult {
  landmarks: Landmark[][];
  worldLandmarks: Landmark[][];
  /** MediaPipe "Left" = user's right hand in mirror/selfie mode */
  handedness: Array<Array<{ categoryName: string }>>;
}

// ---------------------------------------------------------------------------
// Solver output types
// ---------------------------------------------------------------------------

/** 52-element Float32Array of ARKit blend shape coefficients [0..1] */
export interface FaceSolverOutput {
  blendShapes: Float32Array;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Canonical 15-bone list for upper-body tracking.
 * Index in this array matches the slot in MotionFrame.bones (each slot = 4 floats xyzw).
 */
export const TRACKED_BONES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'leftHand',
  'rightHand',
  'leftEye',
  'rightEye',
] as const;

export type TrackedBone = (typeof TRACKED_BONES)[number];

export interface PoseSolverOutput {
  boneRotations: Map<TrackedBone, Quaternion>;
}

/**
 * Canonical 20-joint list for a single hand.
 * Index in this array matches the slot in MotionFrame.lh / MotionFrame.rh.
 */
export const HAND_JOINTS = [
  'wrist',
  'thumbCMC',
  'thumbMCP',
  'thumbIP',
  'thumbTip',
  'indexMCP',
  'indexPIP',
  'indexDIP',
  'indexTip',
  'middleMCP',
  'middlePIP',
  'middleDIP',
  'middleTip',
  'ringMCP',
  'ringPIP',
  'ringDIP',
  'ringTip',
  'pinkyMCP',
  'pinkyPIP',
  'pinkyDIP',
] as const;

export type HandJoint = (typeof HAND_JOINTS)[number];

export interface HandSolverOutput {
  jointRotations: Map<HandJoint, Quaternion>;
}

// ---------------------------------------------------------------------------
// Web Worker communication
// ---------------------------------------------------------------------------

export type WorkerMessage =
  | { type: 'init'; wasmPath: string; modelPaths: { face: string; pose: string; hand: string } }
  | { type: 'process_frame'; imageData: ImageBitmap; timestamp: number }
  | { type: 'init_complete' }
  | { type: 'frame_result'; timestamp: number; face: FaceLandmarkerResult | null; pose: PoseLandmarkerResult | null; hands: HandLandmarkerResult | null; processingTimeMs: number }
  | { type: 'performance_warning'; fps: number; recommendation: string }
  | { type: 'error'; message: string };
