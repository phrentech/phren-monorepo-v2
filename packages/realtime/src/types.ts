// Session state machine
export type SessionState = 'waiting' | 'active' | 'paused' | 'ended';

// Participant roles in a telehealth session
export type ParticipantRole = 'patient' | 'provider';

// Participant metadata
export interface ParticipantInfo {
  userId: string;
  role: ParticipantRole;
  displayName: string;
  joinedAt: number;
  isMuted: boolean;
  isCameraOff: boolean;
}

// Commands sent to the Durable Object WebSocket
export type SessionCommand =
  | { type: 'join'; userId: string; role: ParticipantRole; displayName: string }
  | { type: 'leave' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'end' }
  | { type: 'set_environment'; environment: string }
  | { type: 'activate_tool'; toolId: string }
  | { type: 'deactivate_tool'; toolId: string }
  | { type: 'chat'; text: string }
  | { type: 'ping' };

// Events received from the Durable Object WebSocket
export type SessionEvent =
  | { type: 'state_changed'; state: SessionState }
  | { type: 'participants'; participants: ParticipantInfo[] }
  | { type: 'participant_joined'; participant: ParticipantInfo }
  | { type: 'participant_left'; userId: string }
  | { type: 'environment_changed'; environment: string }
  | { type: 'tool_activated'; toolId: string }
  | { type: 'tool_deactivated'; toolId: string }
  | { type: 'chat'; userId: string; text: string; timestamp: number }
  | { type: 'timer'; elapsed: number; remaining: number | null }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong' };

/**
 * Binary motion frame transmitted over LiveKit data channel.
 *
 * Layout (1093 bytes total):
 *   [0..3]       float32  timestamp (seconds)
 *   [4..211]     float32[52] blend shapes
 *   [212..451]   float32[60] bone rotation floats
 *   [452..771]   float32[80] left hand joint floats
 *   [772..1091]  float32[80] right hand joint floats
 *   [1092]       uint8    quality flags (bit0=face, bit1=pose, bit2=hands)
 */
export interface MotionFrame {
  /** Timestamp in seconds */
  t: number;
  /** 52 ARKit-compatible blend shape coefficients [0..1] */
  bs: Float32Array;
  /** 60 bone rotation floats (20 bones * 3 euler angles) */
  bones: Float32Array;
  /** 80 left hand joint floats */
  lh: Float32Array;
  /** 80 right hand joint floats */
  rh: Float32Array;
  /** Bit flags: bit0=faceTracked, bit1=poseTracked, bit2=handsTracked */
  quality: number;
}

/** Byte size of a serialized MotionFrame */
export const MOTION_FRAME_BYTE_SIZE = 1093 as const;

/** LiveKit connection configuration */
export interface LiveKitConfig {
  url: string;
  token: string;
  roomName: string;
}

/** Data channel topic for motion frames */
export const DATA_CHANNEL_TOPIC = 'motion' as const;
