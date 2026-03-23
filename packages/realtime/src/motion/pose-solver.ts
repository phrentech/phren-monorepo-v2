import {
  type Landmark,
  type PoseLandmarkerResult,
  type PoseSolverOutput,
  type Quaternion,
  type TrackedBone,
  TRACKED_BONES,
} from './types';

// ---------------------------------------------------------------------------
// MediaPipe Pose landmark indices
// ---------------------------------------------------------------------------
const NOSE = 0;
const LEFT_EYE_INNER = 1;
const LEFT_EYE = 2;
const LEFT_EYE_OUTER = 3;
const RIGHT_EYE_INNER = 4;
const RIGHT_EYE = 5;
const RIGHT_EYE_OUTER = 6;
// 7 = left ear, 8 = right ear
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
// 17-22 = fingers/hands
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

// Suppress unused-variable warnings for indices we reference only in comments.
void LEFT_EYE_INNER, void LEFT_EYE_OUTER, void RIGHT_EYE_INNER, void RIGHT_EYE_OUTER;

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

/** Identity quaternion */
const IDENTITY: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

/** Midpoint between two landmarks */
export function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: (a.z + b.z) * 0.5,
  };
}

/** Normalize a quaternion in-place; returns identity if near-zero length */
export function normalize(q: Quaternion): Quaternion {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len < 1e-10) return { ...IDENTITY };
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

/**
 * Compute the shortest-arc rotation quaternion that rotates unit vector `from`
 * onto unit vector `to`.
 */
export function quaternionFromVectors(from: Landmark, to: Landmark): Quaternion {
  // Normalize direction vectors
  const fx = to.x - from.x;
  const fy = to.y - from.y;
  const fz = to.z - from.z;
  const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz);

  if (fLen < 1e-10) return { ...IDENTITY };

  const dx = fx / fLen;
  const dy = fy / fLen;
  const dz = fz / fLen;

  // Reference direction: +Y axis (bind pose "bone points up")
  const rx = 0;
  const ry = 1;
  const rz = 0;

  // Dot product
  const dot = rx * dx + ry * dy + rz * dz;

  // Cross product (ref × dir)
  const cx = ry * dz - rz * dy;
  const cy = rz * dx - rx * dz;
  const cz = rx * dy - ry * dx;

  const crossLen = Math.sqrt(cx * cx + cy * cy + cz * cz);

  if (crossLen < 1e-10) {
    // Parallel or anti-parallel
    if (dot > 0) return { ...IDENTITY };
    // 180° rotation around any perpendicular axis
    return normalize({ x: 1, y: 0, z: 0, w: 0 });
  }

  // Half-angle formula: w = cos(θ/2), xyz = sin(θ/2) * axis
  const w = 1 + dot; // = 2*cos²(θ/2) before normalize
  return normalize({ x: cx, y: cy, z: cz, w });
}

// ---------------------------------------------------------------------------
// Pose solver
// ---------------------------------------------------------------------------

/**
 * Convert MediaPipe PoseLandmarker world landmarks to 15 upper-body bone
 * rotations expressed as quaternions.
 *
 * Returns null if no world landmarks are present.
 */
export function solvePose(result: PoseLandmarkerResult): PoseSolverOutput | null {
  if (!result.worldLandmarks || result.worldLandmarks.length === 0) return null;

  const wl = result.worldLandmarks[0];
  if (!wl || wl.length < 25) return null;

  const boneRotations = new Map<TrackedBone, Quaternion>();

  // --- Hips: mid-hips pointing up toward mid-chest ---
  const midHips = midpoint(wl[LEFT_HIP]!, wl[RIGHT_HIP]!);
  const midShoulders = midpoint(wl[LEFT_SHOULDER]!, wl[RIGHT_SHOULDER]!);
  boneRotations.set('hips', quaternionFromVectors(midHips, midShoulders));

  // --- Spine: same direction as hips (simplified single-segment spine) ---
  boneRotations.set('spine', quaternionFromVectors(midHips, midShoulders));

  // --- Chest: shoulders pointing up toward neck (approximated) ---
  const neckApprox = midShoulders; // MediaPipe has no neck landmark
  boneRotations.set('chest', quaternionFromVectors(midShoulders, wl[NOSE]!));

  // --- Neck: shoulders midpoint → nose ---
  boneRotations.set('neck', quaternionFromVectors(neckApprox, wl[NOSE]!));

  // --- Head: same as neck (no separate head orientation without face) ---
  boneRotations.set('head', quaternionFromVectors(neckApprox, wl[NOSE]!));

  // --- Left shoulder / upper arm / lower arm ---
  boneRotations.set('leftShoulder', quaternionFromVectors(wl[LEFT_SHOULDER]!, wl[LEFT_ELBOW]!));
  boneRotations.set('leftUpperArm', quaternionFromVectors(wl[LEFT_SHOULDER]!, wl[LEFT_ELBOW]!));
  boneRotations.set('leftLowerArm', quaternionFromVectors(wl[LEFT_ELBOW]!, wl[LEFT_WRIST]!));

  // --- Right shoulder / upper arm / lower arm ---
  boneRotations.set('rightShoulder', quaternionFromVectors(wl[RIGHT_SHOULDER]!, wl[RIGHT_ELBOW]!));
  boneRotations.set('rightUpperArm', quaternionFromVectors(wl[RIGHT_SHOULDER]!, wl[RIGHT_ELBOW]!));
  boneRotations.set('rightLowerArm', quaternionFromVectors(wl[RIGHT_ELBOW]!, wl[RIGHT_WRIST]!));

  // --- Hands (wrist orientation, identity-ish without hand landmarks) ---
  boneRotations.set('leftHand', { ...IDENTITY });
  boneRotations.set('rightHand', { ...IDENTITY });

  // --- Eyes (direction from eye landmark to nose, approximated) ---
  boneRotations.set('leftEye', quaternionFromVectors(wl[LEFT_EYE]!, wl[NOSE]!));
  boneRotations.set('rightEye', quaternionFromVectors(wl[RIGHT_EYE]!, wl[NOSE]!));

  // Fill any missing bones with identity
  for (const bone of TRACKED_BONES) {
    if (!boneRotations.has(bone)) {
      boneRotations.set(bone, { ...IDENTITY });
    }
  }

  return { boneRotations };
}
