import { type FaceLandmarkerResult, type FaceSolverOutput } from './types';

/**
 * 52 ARKit blend shape names in canonical order.
 * Index in this array = index in FaceSolverOutput.blendShapes.
 */
export const ARKIT_BLEND_SHAPES = [
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'eyeLookInLeft',
  'eyeLookInRight',
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeWideLeft',
  'eyeWideRight',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'noseSneerLeft',
  'noseSneerRight',
  'tongueOut',
] as const;

/** Fast name → index lookup */
export const BLEND_SHAPE_INDEX: ReadonlyMap<string, number> = new Map(
  ARKIT_BLEND_SHAPES.map((name, i) => [name, i]),
);

/**
 * Map MediaPipe FaceLandmarker blend shapes to a fixed-size Float32Array(52).
 * Returns null if the result contains no blend shape data.
 * Values are clamped to [0, 1].
 */
export function solveFace(result: FaceLandmarkerResult): FaceSolverOutput | null {
  if (!result.faceBlendshapes || result.faceBlendshapes.length === 0) {
    return null;
  }

  const blendShapes = new Float32Array(52); // defaults to 0

  // Use the first detected face
  const categories = result.faceBlendshapes[0]?.categories;
  if (!categories) return null;

  for (const cat of categories) {
    const idx = BLEND_SHAPE_INDEX.get(cat.categoryName);
    if (idx !== undefined) {
      // Clamp to [0, 1]
      blendShapes[idx] = Math.max(0, Math.min(1, cat.score));
    }
  }

  return { blendShapes };
}
