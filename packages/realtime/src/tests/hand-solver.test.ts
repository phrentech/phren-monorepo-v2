import { describe, it, expect } from 'vitest';
import { solveHand, solveHands } from '../motion/hand-solver';
import { type HandLandmarkerResult, type Landmark, HAND_JOINTS } from '../motion/types';

/**
 * Creates 21 landmarks for a flat open hand.
 * Wrist at origin, fingers extend along +Y axis, hand lies in XY plane.
 *
 * Landmark layout (MediaPipe hand):
 *  0 = WRIST
 *  1-4   = THUMB (CMC, MCP, IP, TIP) — offset along X
 *  5-8   = INDEX (MCP, PIP, DIP, TIP)
 *  9-12  = MIDDLE (MCP, PIP, DIP, TIP)
 *  13-16 = RING (MCP, PIP, DIP, TIP)
 *  17-20 = PINKY (MCP, PIP, DIP, TIP)
 */
function createOpenHandLandmarks(): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));

  // Wrist
  lm[0] = { x: 0, y: 0, z: 0 };

  // Thumb — extends diagonally
  lm[1] = { x: -0.04, y: 0.04, z: 0 }; // CMC
  lm[2] = { x: -0.07, y: 0.07, z: 0 }; // MCP
  lm[3] = { x: -0.09, y: 0.09, z: 0 }; // IP
  lm[4] = { x: -0.11, y: 0.11, z: 0 }; // TIP

  // Index finger
  lm[5] = { x: -0.03, y: 0.08, z: 0 }; // MCP
  lm[6] = { x: -0.03, y: 0.12, z: 0 }; // PIP
  lm[7] = { x: -0.03, y: 0.15, z: 0 }; // DIP
  lm[8] = { x: -0.03, y: 0.18, z: 0 }; // TIP

  // Middle finger
  lm[9]  = { x: 0, y: 0.09, z: 0 }; // MCP
  lm[10] = { x: 0, y: 0.13, z: 0 }; // PIP
  lm[11] = { x: 0, y: 0.16, z: 0 }; // DIP
  lm[12] = { x: 0, y: 0.19, z: 0 }; // TIP

  // Ring finger
  lm[13] = { x: 0.03, y: 0.08, z: 0 }; // MCP
  lm[14] = { x: 0.03, y: 0.12, z: 0 }; // PIP
  lm[15] = { x: 0.03, y: 0.15, z: 0 }; // DIP
  lm[16] = { x: 0.03, y: 0.18, z: 0 }; // TIP

  // Pinky
  lm[17] = { x: 0.06, y: 0.07, z: 0 }; // MCP
  lm[18] = { x: 0.06, y: 0.10, z: 0 }; // PIP
  lm[19] = { x: 0.06, y: 0.13, z: 0 }; // DIP
  lm[20] = { x: 0.06, y: 0.15, z: 0 }; // TIP

  return lm;
}

describe('solveHand', () => {
  it('returns null for empty landmarks array', () => {
    expect(solveHand([])).toBeNull();
  });

  it('returns null for fewer than 21 landmarks', () => {
    const lm: Landmark[] = Array.from({ length: 20 }, () => ({ x: 0, y: 0, z: 0 }));
    expect(solveHand(lm)).toBeNull();
  });

  it('returns rotations for all 20 hand joints with normalized quaternions', () => {
    const landmarks = createOpenHandLandmarks();
    const output = solveHand(landmarks);
    expect(output).not.toBeNull();

    for (const joint of HAND_JOINTS) {
      const rotation = output!.jointRotations.get(joint);
      expect(rotation, `Expected rotation for joint: ${joint}`).toBeDefined();

      // Quaternion should be normalized (length ≈ 1)
      const len = Math.sqrt(
        rotation!.x * rotation!.x +
        rotation!.y * rotation!.y +
        rotation!.z * rotation!.z +
        rotation!.w * rotation!.w,
      );
      expect(len, `Joint ${joint} quaternion should be normalized`).toBeCloseTo(1, 5);
    }
  });
});

describe('solveHands', () => {
  it('returns [null, null] for empty result', () => {
    const result: HandLandmarkerResult = {
      landmarks: [],
      worldLandmarks: [],
      handedness: [],
    };
    const [left, right] = solveHands(result);
    expect(left).toBeNull();
    expect(right).toBeNull();
  });

  it('correctly maps mirrored handedness: MediaPipe "Left" → user right hand', () => {
    const landmarks = createOpenHandLandmarks();
    const result: HandLandmarkerResult = {
      landmarks: [landmarks],
      worldLandmarks: [],
      // MediaPipe "Left" in mirror mode = user's RIGHT hand
      handedness: [[{ categoryName: 'Left' }]],
    };

    const [leftHand, rightHand] = solveHands(result);
    // MP "Left" → user's right hand
    expect(rightHand).not.toBeNull();
    expect(leftHand).toBeNull();
  });

  it('correctly maps mirrored handedness: MediaPipe "Right" → user left hand', () => {
    const landmarks = createOpenHandLandmarks();
    const result: HandLandmarkerResult = {
      landmarks: [landmarks],
      worldLandmarks: [],
      // MediaPipe "Right" in mirror mode = user's LEFT hand
      handedness: [[{ categoryName: 'Right' }]],
    };

    const [leftHand, rightHand] = solveHands(result);
    // MP "Right" → user's left hand
    expect(leftHand).not.toBeNull();
    expect(rightHand).toBeNull();
  });
});
