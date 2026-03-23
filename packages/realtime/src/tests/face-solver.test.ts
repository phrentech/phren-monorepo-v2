import { describe, it, expect } from 'vitest';
import { solveFace, ARKIT_BLEND_SHAPES } from '../motion/face-solver';
import { type FaceLandmarkerResult } from '../motion/types';

describe('solveFace', () => {
  it('returns null when faceBlendshapes is undefined', () => {
    const result: FaceLandmarkerResult = {
      faceLandmarks: [],
      faceBlendshapes: undefined,
    };
    expect(solveFace(result)).toBeNull();
  });

  it('returns null when faceBlendshapes is an empty array', () => {
    const result: FaceLandmarkerResult = {
      faceLandmarks: [],
      faceBlendshapes: [],
    };
    expect(solveFace(result)).toBeNull();
  });

  it('maps named blend shapes to correct indices', () => {
    const result: FaceLandmarkerResult = {
      faceLandmarks: [],
      faceBlendshapes: [
        {
          categories: [
            { categoryName: 'jawOpen', score: 0.8 },
            { categoryName: 'eyeBlinkLeft', score: 0.5 },
            { categoryName: 'mouthSmileLeft', score: 0.3 },
          ],
        },
      ],
    };

    const output = solveFace(result);
    expect(output).not.toBeNull();

    const jawOpenIdx = ARKIT_BLEND_SHAPES.indexOf('jawOpen');
    const eyeBlinkLeftIdx = ARKIT_BLEND_SHAPES.indexOf('eyeBlinkLeft');
    const mouthSmileLeftIdx = ARKIT_BLEND_SHAPES.indexOf('mouthSmileLeft');

    expect(output!.blendShapes[jawOpenIdx]).toBeCloseTo(0.8, 5);
    expect(output!.blendShapes[eyeBlinkLeftIdx]).toBeCloseTo(0.5, 5);
    expect(output!.blendShapes[mouthSmileLeftIdx]).toBeCloseTo(0.3, 5);
  });

  it('clamps values above 1 to 1', () => {
    const result: FaceLandmarkerResult = {
      faceLandmarks: [],
      faceBlendshapes: [
        {
          categories: [{ categoryName: 'jawOpen', score: 1.5 }],
        },
      ],
    };

    const output = solveFace(result);
    expect(output).not.toBeNull();
    const idx = ARKIT_BLEND_SHAPES.indexOf('jawOpen');
    expect(output!.blendShapes[idx]).toBe(1);
  });

  it('clamps values below 0 to 0', () => {
    const result: FaceLandmarkerResult = {
      faceLandmarks: [],
      faceBlendshapes: [
        {
          categories: [{ categoryName: 'jawOpen', score: -0.3 }],
        },
      ],
    };

    const output = solveFace(result);
    expect(output).not.toBeNull();
    const idx = ARKIT_BLEND_SHAPES.indexOf('jawOpen');
    expect(output!.blendShapes[idx]).toBe(0);
  });

  it('ignores unknown blend shape names', () => {
    const result: FaceLandmarkerResult = {
      faceLandmarks: [],
      faceBlendshapes: [
        {
          categories: [
            { categoryName: 'unknownShape', score: 0.9 },
            { categoryName: 'anotherUnknown', score: 0.7 },
          ],
        },
      ],
    };

    const output = solveFace(result);
    expect(output).not.toBeNull();
    // All values should remain 0 since no known shapes were provided
    for (let i = 0; i < 52; i++) {
      expect(output!.blendShapes[i]).toBe(0);
    }
  });
});

describe('ARKIT_BLEND_SHAPES', () => {
  it('has exactly 52 entries', () => {
    expect(ARKIT_BLEND_SHAPES.length).toBe(52);
  });
});
