import { describe, it, expect } from 'vitest';
import { solvePose } from '../motion/pose-solver';
import { type PoseLandmarkerResult, type Landmark, TRACKED_BONES } from '../motion/types';

/**
 * Creates 33 landmarks representing a basic standing pose.
 * - Hips at y=0 (landmarks 23, 24)
 * - Shoulders at y=0.5 (landmarks 11, 12)
 * - Nose at y=0.7 (landmark 0)
 * - Eyes near nose (landmarks 2, 5)
 * - Arms hanging at sides (elbows y=0.3, wrists y=0.1)
 */
function createTestLandmarks(): Landmark[] {
  // Initialize 33 landmarks at origin
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));

  // Nose
  lm[0] = { x: 0, y: 0.7, z: 0 };

  // Eyes (slightly offset from nose)
  lm[1] = { x: -0.03, y: 0.69, z: 0.01 }; // left eye inner
  lm[2] = { x: -0.05, y: 0.69, z: 0.01 }; // left eye
  lm[3] = { x: -0.07, y: 0.68, z: 0.01 }; // left eye outer
  lm[4] = { x: 0.03, y: 0.69, z: 0.01 };  // right eye inner
  lm[5] = { x: 0.05, y: 0.69, z: 0.01 };  // right eye
  lm[6] = { x: 0.07, y: 0.68, z: 0.01 };  // right eye outer

  // Shoulders (y=0.5)
  lm[11] = { x: -0.2, y: 0.5, z: 0 }; // left shoulder
  lm[12] = { x: 0.2, y: 0.5, z: 0 };  // right shoulder

  // Elbows (arms at sides, y=0.3)
  lm[13] = { x: -0.2, y: 0.3, z: 0 }; // left elbow
  lm[14] = { x: 0.2, y: 0.3, z: 0 };  // right elbow

  // Wrists (y=0.1)
  lm[15] = { x: -0.2, y: 0.1, z: 0 }; // left wrist
  lm[16] = { x: 0.2, y: 0.1, z: 0 };  // right wrist

  // Hips (y=0)
  lm[23] = { x: -0.1, y: 0, z: 0 }; // left hip
  lm[24] = { x: 0.1, y: 0, z: 0 };  // right hip

  return lm;
}

describe('solvePose', () => {
  it('returns null when worldLandmarks is empty', () => {
    const result: PoseLandmarkerResult = {
      landmarks: [],
      worldLandmarks: [],
    };
    expect(solvePose(result)).toBeNull();
  });

  it('returns rotations for all 15 tracked bones', () => {
    const landmarks = createTestLandmarks();
    const result: PoseLandmarkerResult = {
      landmarks: [],
      worldLandmarks: [landmarks],
    };

    const output = solvePose(result);
    expect(output).not.toBeNull();

    for (const bone of TRACKED_BONES) {
      const rotation = output!.boneRotations.get(bone);
      expect(rotation, `Expected rotation for bone: ${bone}`).toBeDefined();

      // Quaternion should be normalized (length ≈ 1)
      const len = Math.sqrt(
        rotation!.x * rotation!.x +
        rotation!.y * rotation!.y +
        rotation!.z * rotation!.z +
        rotation!.w * rotation!.w,
      );
      expect(len, `Bone ${bone} quaternion should be normalized`).toBeCloseTo(1, 5);
    }
  });

  it('spine rotation points roughly upward when shoulders are above hips (w > 0.9)', () => {
    const landmarks = createTestLandmarks();
    const result: PoseLandmarkerResult = {
      landmarks: [],
      worldLandmarks: [landmarks],
    };

    const output = solvePose(result);
    expect(output).not.toBeNull();

    const spineRotation = output!.boneRotations.get('spine');
    expect(spineRotation).toBeDefined();

    // When the spine points straight up (+Y), the quaternion is identity (w=1).
    // With shoulders above hips in our test pose, w should be close to 1.
    expect(spineRotation!.w).toBeGreaterThan(0.9);
  });
});
