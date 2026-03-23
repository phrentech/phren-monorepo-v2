import {
  type HandLandmarkerResult,
  type HandSolverOutput,
  type HandJoint,
  type Landmark,
  HAND_JOINTS,
} from './types';
import { quaternionFromVectors } from './pose-solver';

// ---------------------------------------------------------------------------
// MediaPipe Hand landmark indices (0-based, 21 landmarks per hand)
// ---------------------------------------------------------------------------
// 0  = WRIST
// 1  = THUMB_CMC,  2  = THUMB_MCP,  3  = THUMB_IP,  4  = THUMB_TIP
// 5  = INDEX_MCP,  6  = INDEX_PIP,  7  = INDEX_DIP,  8  = INDEX_TIP
// 9  = MIDDLE_MCP, 10 = MIDDLE_PIP, 11 = MIDDLE_DIP, 12 = MIDDLE_TIP
// 13 = RING_MCP,   14 = RING_PIP,   15 = RING_DIP,   16 = RING_TIP
// 17 = PINKY_MCP,  18 = PINKY_PIP,  19 = PINKY_DIP,  20 = PINKY_TIP

/**
 * Maps each HandJoint name to [fromLandmarkIndex, toLandmarkIndex].
 * The rotation represents how the bone segment points from `from` toward `to`.
 */
export const JOINT_LANDMARK_MAP: ReadonlyMap<HandJoint, [number, number]> = new Map([
  ['wrist',     [0, 9]],   // wrist → middle MCP (palm direction)
  ['thumbCMC',  [0, 1]],
  ['thumbMCP',  [1, 2]],
  ['thumbIP',   [2, 3]],
  ['thumbTip',  [3, 4]],
  ['indexMCP',  [5, 6]],
  ['indexPIP',  [6, 7]],
  ['indexDIP',  [7, 8]],
  ['indexTip',  [8, 8]],   // tip has no child — identity fallback handled below
  ['middleMCP', [9, 10]],
  ['middlePIP', [10, 11]],
  ['middleDIP', [11, 12]],
  ['middleTip', [12, 12]],
  ['ringMCP',   [13, 14]],
  ['ringPIP',   [14, 15]],
  ['ringDIP',   [15, 16]],
  ['ringTip',   [16, 16]],
  ['pinkyMCP',  [17, 18]],
  ['pinkyPIP',  [18, 19]],
  ['pinkyDIP',  [19, 19]],
] as const);

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Solve a single hand from 21 landmarks.
 * Returns null if the landmark array has fewer than 21 entries.
 */
export function solveHand(landmarks: Landmark[]): HandSolverOutput | null {
  if (landmarks.length < 21) return null;

  const jointRotations = new Map<HandJoint, typeof IDENTITY>();

  for (const joint of HAND_JOINTS) {
    const mapping = JOINT_LANDMARK_MAP.get(joint);
    if (!mapping) {
      jointRotations.set(joint, { ...IDENTITY });
      continue;
    }

    const [fromIdx, toIdx] = mapping;
    if (fromIdx === toIdx) {
      // Tip joints or degenerate — use identity
      jointRotations.set(joint, { ...IDENTITY });
      continue;
    }

    const from = landmarks[fromIdx];
    const to = landmarks[toIdx];
    if (!from || !to) {
      jointRotations.set(joint, { ...IDENTITY });
      continue;
    }

    jointRotations.set(joint, quaternionFromVectors(from, to));
  }

  return { jointRotations };
}

/**
 * Process both hands from a HandLandmarkerResult.
 *
 * MediaPipe reports handedness in "mirror" mode:
 *   categoryName "Left"  → user's RIGHT hand (as seen in a mirror/selfie)
 *   categoryName "Right" → user's LEFT  hand
 *
 * Returns [leftHand, rightHand] — either may be null if not detected.
 */
export function solveHands(
  result: HandLandmarkerResult,
): [HandSolverOutput | null, HandSolverOutput | null] {
  let leftHand: HandSolverOutput | null = null;
  let rightHand: HandSolverOutput | null = null;

  for (let i = 0; i < result.landmarks.length; i++) {
    const landmarks = result.landmarks[i];
    const handednessArr = result.handedness[i];
    if (!landmarks || !handednessArr) continue;

    // MediaPipe "Left" in mirror mode = user's right; flip the label
    const mediapipeLabel = handednessArr[0]?.categoryName ?? '';
    const isUserLeft = mediapipeLabel === 'Right'; // mirrored: MP "Right" = user left

    const solved = solveHand(landmarks);

    if (isUserLeft) {
      leftHand = solved;
    } else {
      rightHand = solved;
    }
  }

  return [leftHand, rightHand];
}
