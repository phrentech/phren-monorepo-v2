import { type MotionFrame, MOTION_FRAME_BYTE_SIZE } from './types';

// Byte offsets within a packed MotionFrame buffer
const OFFSET_T = 0;        // float32 timestamp          bytes 0–3
const OFFSET_BS = 4;       // float32[52] blend shapes   bytes 4–211
const OFFSET_BONES = 212;  // float32[60] bones          bytes 212–451
const OFFSET_LH = 452;     // float32[80] left hand      bytes 452–771
const OFFSET_RH = 772;     // float32[80] right hand     bytes 772–1091
const OFFSET_FLAGS = 1092; // uint8 quality flags        byte 1092

/**
 * Pack a MotionFrame into a fixed-size 1093-byte Uint8Array suitable for
 * transmission over a LiveKit data channel.
 */
export function encodeMotionFrame(frame: MotionFrame): Uint8Array {
  const buf = new ArrayBuffer(MOTION_FRAME_BYTE_SIZE);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  // Timestamp
  view.setFloat32(OFFSET_T, frame.t, true);

  // Blend shapes (52 floats)
  for (let i = 0; i < 52; i++) {
    view.setFloat32(OFFSET_BS + i * 4, frame.bs[i] ?? 0, true);
  }

  // Bone rotations (60 floats)
  for (let i = 0; i < 60; i++) {
    view.setFloat32(OFFSET_BONES + i * 4, frame.bones[i] ?? 0, true);
  }

  // Left hand joints (80 floats)
  for (let i = 0; i < 80; i++) {
    view.setFloat32(OFFSET_LH + i * 4, frame.lh[i] ?? 0, true);
  }

  // Right hand joints (80 floats)
  for (let i = 0; i < 80; i++) {
    view.setFloat32(OFFSET_RH + i * 4, frame.rh[i] ?? 0, true);
  }

  // Quality flags byte
  u8[OFFSET_FLAGS] = frame.quality & 0xff;

  return u8;
}

/**
 * Unpack a MotionFrame from a 1093-byte Uint8Array.
 * Returns null if the buffer is not exactly MOTION_FRAME_BYTE_SIZE bytes.
 */
export function decodeMotionFrame(data: Uint8Array): MotionFrame | null {
  if (data.byteLength !== MOTION_FRAME_BYTE_SIZE) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const t = view.getFloat32(OFFSET_T, true);

  const bs = new Float32Array(52);
  for (let i = 0; i < 52; i++) {
    bs[i] = view.getFloat32(OFFSET_BS + i * 4, true);
  }

  const bones = new Float32Array(60);
  for (let i = 0; i < 60; i++) {
    bones[i] = view.getFloat32(OFFSET_BONES + i * 4, true);
  }

  const lh = new Float32Array(80);
  for (let i = 0; i < 80; i++) {
    lh[i] = view.getFloat32(OFFSET_LH + i * 4, true);
  }

  const rh = new Float32Array(80);
  for (let i = 0; i < 80; i++) {
    rh[i] = view.getFloat32(OFFSET_RH + i * 4, true);
  }

  const quality = data[OFFSET_FLAGS] ?? 0;

  return { t, bs, bones, lh, rh, quality };
}
