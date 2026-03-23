import { describe, it, expect } from 'vitest';
import { encodeMotionFrame, decodeMotionFrame } from '../data-channel';
import { type MotionFrame, MOTION_FRAME_BYTE_SIZE } from '../types';

function createTestFrame(): MotionFrame {
  const bs = new Float32Array(52).fill(0);
  const bones = new Float32Array(60).fill(0);
  const lh = new Float32Array(80).fill(0);
  const rh = new Float32Array(80).fill(0);
  return { t: 1.5, bs, bones, lh, rh, quality: 0b111 };
}

describe('motion frame codec', () => {
  it('encodes to correct byte size (1093 bytes)', () => {
    const frame = createTestFrame();
    const encoded = encodeMotionFrame(frame);
    expect(encoded.byteLength).toBe(MOTION_FRAME_BYTE_SIZE);
    expect(encoded.byteLength).toBe(1093);
  });

  it('roundtrips a full frame with all solvers active', () => {
    const frame = createTestFrame();
    // Set distinctive values in each array
    frame.t = 42.125;
    frame.bs[0] = 0.1;
    frame.bs[51] = 0.9;
    frame.bones[0] = 1.23;
    frame.bones[59] = -0.75;
    frame.lh[0] = 0.55;
    frame.lh[79] = -0.33;
    frame.rh[0] = 0.77;
    frame.rh[79] = 0.12;
    frame.quality = 0b111;

    const decoded = decodeMotionFrame(encodeMotionFrame(frame));
    expect(decoded).not.toBeNull();

    expect(decoded!.t).toBeCloseTo(42.125, 3);
    expect(decoded!.bs[0]).toBeCloseTo(0.1, 5);
    expect(decoded!.bs[51]).toBeCloseTo(0.9, 5);
    expect(decoded!.bones[0]).toBeCloseTo(1.23, 5);
    expect(decoded!.bones[59]).toBeCloseTo(-0.75, 5);
    expect(decoded!.lh[0]).toBeCloseTo(0.55, 5);
    expect(decoded!.lh[79]).toBeCloseTo(-0.33, 5);
    expect(decoded!.rh[0]).toBeCloseTo(0.77, 5);
    expect(decoded!.rh[79]).toBeCloseTo(0.12, 5);
    expect(decoded!.quality).toBe(0b111);
  });

  it('roundtrips a frame with only face solver active (quality flags)', () => {
    const frame = createTestFrame();
    frame.quality = 0b001; // only bit0 (face) set
    frame.bs[10] = 0.45;

    const decoded = decodeMotionFrame(encodeMotionFrame(frame));
    expect(decoded).not.toBeNull();
    expect(decoded!.quality).toBe(0b001);
    expect(decoded!.bs[10]).toBeCloseTo(0.45, 5);
    // pose and hands bits should be clear
    expect(decoded!.quality & 0b110).toBe(0);
  });

  it('roundtrips a frame with no solvers active', () => {
    const frame = createTestFrame();
    frame.quality = 0b000;
    frame.t = 0.0;

    const decoded = decodeMotionFrame(encodeMotionFrame(frame));
    expect(decoded).not.toBeNull();
    expect(decoded!.quality).toBe(0);
    expect(decoded!.t).toBeCloseTo(0.0, 5);
  });

  it('preserves blend shape precision within float32 limits', () => {
    const frame = createTestFrame();
    // Set each of the 52 blend shapes to a unique value
    for (let i = 0; i < 52; i++) {
      frame.bs[i] = i / 51; // values from 0.0 to 1.0 spread across 52 slots
    }

    const decoded = decodeMotionFrame(encodeMotionFrame(frame));
    expect(decoded).not.toBeNull();

    for (let i = 0; i < 52; i++) {
      // float32 has ~7 significant decimal digits; toBeCloseTo with 5 decimals is safe
      expect(decoded!.bs[i]).toBeCloseTo(frame.bs[i]!, 5);
    }
  });

  it('returns null for wrong buffer size (too small)', () => {
    const tooSmall = new Uint8Array(1092);
    expect(decodeMotionFrame(tooSmall)).toBeNull();
  });

  it('returns null for wrong buffer size (too large)', () => {
    const tooLarge = new Uint8Array(1094);
    expect(decodeMotionFrame(tooLarge)).toBeNull();
  });

  it('handles negative quaternion values in bones', () => {
    const frame = createTestFrame();
    // Fill bones with negative values simulating quaternion components
    for (let i = 0; i < 60; i++) {
      frame.bones[i] = -1 + (i / 30); // values from -1.0 to +1.0
    }

    const decoded = decodeMotionFrame(encodeMotionFrame(frame));
    expect(decoded).not.toBeNull();

    for (let i = 0; i < 60; i++) {
      expect(decoded!.bones[i]).toBeCloseTo(frame.bones[i]!, 5);
    }
  });
});
