# Phase 2: Real-Time Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real-time telehealth session engine: LiveKit video/audio, Session Coordinator Durable Object for session state, motion tracking pipeline (MediaPipe → data channel → avatar driver), and the `packages/realtime` client library. At the end of Phase 2, two users can join a telehealth session with video/audio, and the provider's webcam motion data is captured, compressed, and transmitted for avatar driving in Phase 3.

**Architecture:** The API Worker gains session routes that create LiveKit rooms, generate participant tokens, and wake a Session Coordinator Durable Object. The DO manages session state (waiting → active → paused → ended), participant presence, environment commands, and therapeutic tool activations via WebSocket. `packages/realtime` provides the client-side LiveKit wrapper and data channel abstraction. A Web Worker runs three MediaPipe Tasks Vision tasks (face, pose, hand) on the provider's webcam feed, with solvers that compress landmarks into a ~2KB/frame motion payload transmitted via LiveKit's unreliable data channel.

**Tech Stack:** `livekit-client`, `livekit-server-sdk`, `@mediapipe/tasks-vision`, Cloudflare Durable Objects (WebSocket + Hibernation API), Hono, Vitest.

**Spec:** `docs/superpowers/specs/2026-03-21-phren-v2-platform-overhaul-design.md` (Sections 6, 8)

**Linear:** Epic 4 (Telehealth Session Engine), Epic 6 (Motion & Biometric Tracking)

**Depends on:** Phase 1 complete (master branch)

---

## Scope Check

Phase 2 covers two epics that are tightly coupled — the motion tracking pipeline feeds into the LiveKit data channel managed by the session engine. These are built together because motion data transport depends on the LiveKit room being established.

**Not in scope (Phase 3):** A-Frame VR scenes, avatar rendering, environment manager, therapeutic tool UI. Phase 2 builds the *data pipeline* for motion; Phase 3 builds the *rendering*.

**Not in scope (Phase 4):** Session notes UI, session recording playback, session history views.

---

## File Map — Phase 2

```
phren-monorepo-v2/
├── packages/
│   └── realtime/
│       ├── package.json                      # + livekit-client, @mediapipe/tasks-vision deps
│       ├── tsconfig.json                     # + @cloudflare/workers-types
│       └── src/
│           ├── index.ts                      # barrel export
│           ├── types.ts                      # MotionFrame, SessionState, SessionCommand, ParticipantInfo
│           ├── livekit-client.ts             # LiveKit Room wrapper: connect, disconnect, track management
│           ├── data-channel.ts               # Data channel abstraction: send/receive motion frames
│           ├── motion/
│           │   ├── types.ts                  # MediaPipe landmark types, solver output types
│           │   ├── capture.ts                # Webcam → MediaPipe tasks orchestrator (runs in main thread, delegates to worker)
│           │   ├── worker.ts                 # Web Worker: runs FaceLandmarker + PoseLandmarker + HandLandmarker
│           │   ├── face-solver.ts            # 468 landmarks → 52 ARKit blend shape weights
│           │   ├── pose-solver.ts            # 33 pose landmarks → upper body bone rotations (quaternions)
│           │   ├── hand-solver.ts            # 21 hand landmarks × 2 → finger joint rotations
│           │   ├── frame-encoder.ts          # Combines solver outputs → compact binary MotionFrame (~2KB)
│           │   └── frame-decoder.ts          # Binary MotionFrame → structured data for avatar driver
│           └── tests/
│               ├── face-solver.test.ts
│               ├── pose-solver.test.ts
│               ├── hand-solver.test.ts
│               ├── frame-codec.test.ts       # encode → decode roundtrip
│               └── data-channel.test.ts
│
├── workers/
│   └── session-coordinator/
│       ├── package.json                      # + deps: @phren/core, @phren/db, drizzle-orm
│       ├── tsconfig.json                     # + @cloudflare/workers-types
│       ├── wrangler.toml                     # DO binding, D1, KV
│       └── src/
│           ├── index.ts                      # Worker entrypoint: exports DO class + fetch handler
│           ├── env.ts                        # Env type with DO, D1, KV bindings
│           ├── session-do.ts                 # SessionCoordinator Durable Object class
│           ├── state-machine.ts              # Session state machine: waiting → active → paused → ended
│           ├── types.ts                      # WebSocket message types (commands, events, presence)
│           └── tests/
│               ├── state-machine.test.ts
│               └── session-do.test.ts
│
├── workers/
│   └── api/
│       └── src/
│           └── routes/
│               └── sessions.ts               # NEW: session join, token generation, session control
│
└── apps/
    └── session/
        └── src/
            ├── lib/
            │   ├── stores/
            │   │   └── session.ts            # Svelte store: session state, participants, connection status
            │   └── components/
            │       ├── VideoGrid.svelte       # LiveKit video tiles (provider + patient)
            │       ├── SessionControls.svelte  # Mute/unmute, camera toggle, screen share, end session
            │       └── ConnectionStatus.svelte # Connection quality indicator
            └── routes/
                └── [appointmentId]/
                    ├── +page.server.ts        # Load appointment data, validate access
                    └── +page.svelte           # Main session page: video + controls
```

---

## Task Breakdown

### Task 1: Realtime Package — Types and LiveKit Client Wrapper

**Files:**
- Modify: `packages/realtime/package.json`
- Modify: `packages/realtime/tsconfig.json`
- Create: `packages/realtime/src/types.ts`
- Create: `packages/realtime/src/livekit-client.ts`
- Create: `packages/realtime/src/data-channel.ts`
- Modify: `packages/realtime/src/index.ts`

**Context:** `packages/realtime` currently exists as an empty stub (`export {}`). We're building it out with the LiveKit client wrapper and motion data channel abstraction. These are pure client-side modules — no Cloudflare bindings needed.

- [ ] **Step 1: Add dependencies to package.json**

```json
{
  "name": "@phren/realtime",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@phren/core": "workspace:*",
    "livekit-client": "^2.9.1"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260317.1",
    "vitest": "^4.1.0"
  }
}
```

- [ ] **Step 2: Update tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["@cloudflare/workers-types"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"],
  "exclude": ["src/motion/worker.ts"]
}
```

Note: `lib: ["DOM"]` is needed because LiveKit client and MediaPipe use browser APIs. The web worker file is excluded from the main build (it's bundled separately).

- [ ] **Step 3: Create types.ts**

```typescript
// packages/realtime/src/types.ts

/** Session states matching the DO state machine */
export type SessionState = 'waiting' | 'active' | 'paused' | 'ended';

/** Participant role in a session */
export type ParticipantRole = 'patient' | 'provider';

/** Info about a connected participant */
export interface ParticipantInfo {
  userId: string;
  role: ParticipantRole;
  displayName: string;
  joinedAt: string;
  isMuted: boolean;
  isCameraOff: boolean;
}

/** Commands sent via Durable Object WebSocket (reliable) */
export type SessionCommand =
  | { type: 'state_change'; state: SessionState }
  | { type: 'environment_change'; preset: string; customUrl?: string }
  | { type: 'tool_activate'; toolId: string; config: Record<string, unknown> }
  | { type: 'tool_deactivate'; toolId: string }
  | { type: 'chat_message'; senderId: string; content: string }
  | { type: 'participant_joined'; participant: ParticipantInfo }
  | { type: 'participant_left'; userId: string };

/** Events received from the Durable Object WebSocket (matches ServerMessage in session-coordinator) */
export type SessionEvent =
  | { type: 'state_changed'; state: SessionState; changedBy: string }
  | { type: 'participants'; participants: ParticipantInfo[] }
  | { type: 'participant_joined'; participant: ParticipantInfo }
  | { type: 'participant_left'; userId: string }
  | { type: 'environment_changed'; preset: string; customUrl?: string }
  | { type: 'tool_activated'; toolId: string; config: Record<string, unknown> }
  | { type: 'tool_deactivated'; toolId: string }
  | { type: 'chat'; senderId: string; senderName: string; content: string; timestamp: string }
  | { type: 'timer'; elapsedSeconds: number }
  | { type: 'error'; message: string }
  | { type: 'pong' };

/** Compact motion frame transmitted via data channel (~2KB) */
export interface MotionFrame {
  /** Timestamp in ms (performance.now() on sender) */
  t: number;
  /** 52 ARKit blend shape weights (0-1), indexed by BlendShapeIndex */
  bs: Float32Array;
  /** Upper body bone rotations: 15 quaternions [x,y,z,w] packed as Float32Array(60) */
  bones: Float32Array;
  /** Left hand joint rotations: 20 quaternions packed as Float32Array(80) */
  lh: Float32Array;
  /** Right hand joint rotations: 20 quaternions packed as Float32Array(80) */
  rh: Float32Array;
  /** Quality flags: which solvers produced data this frame */
  quality: {
    face: boolean;
    pose: boolean;
    hands: boolean;
  };
}

/** Binary layout: 4 (timestamp) + 208 (bs) + 240 (bones) + 320 (lh) + 320 (rh) + 1 (quality) = 1093 bytes */
export const MOTION_FRAME_BYTE_SIZE = 1093;

/** LiveKit connection config */
export interface LiveKitConfig {
  url: string;
  token: string;
  roomName: string;
}

/** Data channel message types */
export const DATA_CHANNEL_TOPIC = 'motion';
```

- [ ] **Step 4: Create livekit-client.ts**

```typescript
// packages/realtime/src/livekit-client.ts

import {
  Room,
  RoomEvent,
  Track,
  LocalParticipant,
  RemoteParticipant,
  RemoteTrackPublication,
  DisconnectReason,
  ConnectionState,
  type RoomOptions,
} from 'livekit-client';
import type { LiveKitConfig, ParticipantRole } from './types';

export interface PhrenRoomCallbacks {
  onParticipantConnected?: (participant: RemoteParticipant) => void;
  onParticipantDisconnected?: (participant: RemoteParticipant) => void;
  onTrackSubscribed?: (track: Track, publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
  onTrackUnsubscribed?: (track: Track, publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
  onDisconnected?: (reason?: DisconnectReason) => void;
  onReconnecting?: () => void;
  onReconnected?: () => void;
  onDataReceived?: (payload: Uint8Array, participant?: RemoteParticipant, topic?: string) => void;
}

/**
 * Wraps a LiveKit Room with Phren-specific defaults and lifecycle management.
 * Handles connect/disconnect, track publishing, and data channel setup.
 */
export class PhrenRoom {
  private room: Room;
  private config: LiveKitConfig;
  private callbacks: PhrenRoomCallbacks;
  private _isConnected = false;

  constructor(config: LiveKitConfig, callbacks: PhrenRoomCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;

    const roomOptions: RoomOptions = {
      adaptiveStream: true,
      dynacast: true,
      // Optimize for telehealth: prioritize audio quality
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      videoCaptureDefaults: {
        resolution: { width: 640, height: 480, frameRate: 30 },
      },
    };

    this.room = new Room(roomOptions);
    this.setupEventListeners();
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  get localParticipant(): LocalParticipant {
    return this.room.localParticipant;
  }

  get remoteParticipants(): Map<string, RemoteParticipant> {
    return this.room.remoteParticipants;
  }

  get connectionState(): ConnectionState {
    return this.room.state;
  }

  get nativeRoom(): Room {
    return this.room;
  }

  private setupEventListeners(): void {
    this.room
      .on(RoomEvent.ParticipantConnected, (participant) => {
        this.callbacks.onParticipantConnected?.(participant);
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        this.callbacks.onParticipantDisconnected?.(participant);
      })
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        this.callbacks.onTrackSubscribed?.(track, publication, participant);
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        this.callbacks.onTrackUnsubscribed?.(track, publication, participant);
      })
      .on(RoomEvent.Disconnected, (reason) => {
        this._isConnected = false;
        this.callbacks.onDisconnected?.(reason);
      })
      .on(RoomEvent.Reconnecting, () => {
        this.callbacks.onReconnecting?.();
      })
      .on(RoomEvent.Reconnected, () => {
        this._isConnected = true;
        this.callbacks.onReconnected?.();
      })
      .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        this.callbacks.onDataReceived?.(payload, participant, topic);
      });
  }

  /** Connect to the LiveKit room and publish local tracks */
  async connect(): Promise<void> {
    await this.room.connect(this.config.url, this.config.token);
    this._isConnected = true;
  }

  /** Enable camera and microphone */
  async enableMedia(camera = true, microphone = true): Promise<void> {
    if (camera) {
      await this.room.localParticipant.setCameraEnabled(true);
    }
    if (microphone) {
      await this.room.localParticipant.setMicrophoneEnabled(true);
    }
  }

  /** Toggle microphone mute state */
  async toggleMicrophone(): Promise<boolean> {
    const current = this.room.localParticipant.isMicrophoneEnabled;
    await this.room.localParticipant.setMicrophoneEnabled(!current);
    return !current;
  }

  /** Toggle camera on/off */
  async toggleCamera(): Promise<boolean> {
    const current = this.room.localParticipant.isCameraEnabled;
    await this.room.localParticipant.setCameraEnabled(!current);
    return !current;
  }

  /** Enable screen sharing */
  async startScreenShare(): Promise<void> {
    await this.room.localParticipant.setScreenShareEnabled(true);
  }

  /** Disable screen sharing */
  async stopScreenShare(): Promise<void> {
    await this.room.localParticipant.setScreenShareEnabled(false);
  }

  /**
   * Send binary data via unreliable data channel (for motion frames).
   * Uses LiveKit's built-in data publish with topic routing.
   */
  async sendMotionData(data: Uint8Array): Promise<void> {
    await this.room.localParticipant.publishData(data, {
      reliable: false,
      topic: 'motion',
    });
  }

  /**
   * Send reliable data (for session control messages that must not be lost).
   */
  async sendReliableData(data: Uint8Array, topic: string): Promise<void> {
    await this.room.localParticipant.publishData(data, {
      reliable: true,
      topic,
    });
  }

  /** Get the local video track's MediaStream for feeding to MediaPipe */
  getLocalVideoMediaStream(): MediaStream | null {
    const videoTrack = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (!videoTrack?.track) return null;
    return new MediaStream([videoTrack.track.mediaStreamTrack]);
  }

  /** Disconnect from the room and clean up */
  async disconnect(): Promise<void> {
    this._isConnected = false;
    await this.room.disconnect();
  }
}
```

- [ ] **Step 5: Create data-channel.ts**

```typescript
// packages/realtime/src/data-channel.ts

import type { MotionFrame } from './types';
import { MOTION_FRAME_BYTE_SIZE } from './types';

/**
 * Encodes a MotionFrame into a compact binary buffer for transmission
 * via LiveKit's unreliable data channel.
 *
 * Binary layout (1093 bytes total):
 *   [0..3]     float32  timestamp (ms)
 *   [4..211]   float32  52 blend shape weights
 *   [212..451] float32  15 bone quaternions (60 floats)
 *   [452..771] float32  20 left hand quaternions (80 floats)
 *   [772..1091] float32 20 right hand quaternions (80 floats)
 *   [1092]     uint8    quality flags (bit 0=face, bit 1=pose, bit 2=hands)
 */
export function encodeMotionFrame(frame: MotionFrame): Uint8Array {
  const buffer = new ArrayBuffer(MOTION_FRAME_BYTE_SIZE);
  const view = new DataView(buffer);
  const floats = new Float32Array(buffer, 0, (MOTION_FRAME_BYTE_SIZE - 1) / 4);

  // Timestamp
  floats[0] = frame.t;

  // Blend shapes (52 floats at offset 1)
  for (let i = 0; i < 52; i++) {
    floats[1 + i] = frame.bs[i] ?? 0;
  }

  // Bone rotations (60 floats at offset 53)
  for (let i = 0; i < 60; i++) {
    floats[53 + i] = frame.bones[i] ?? 0;
  }

  // Left hand (80 floats at offset 113)
  for (let i = 0; i < 80; i++) {
    floats[113 + i] = frame.lh[i] ?? 0;
  }

  // Right hand (80 floats at offset 193)
  for (let i = 0; i < 80; i++) {
    floats[193 + i] = frame.rh[i] ?? 0;
  }

  // Quality flags byte at end
  const qualityByte =
    (frame.quality.face ? 1 : 0) |
    (frame.quality.pose ? 2 : 0) |
    (frame.quality.hands ? 4 : 0);
  view.setUint8(MOTION_FRAME_BYTE_SIZE - 1, qualityByte);

  return new Uint8Array(buffer);
}

/**
 * Decodes a binary buffer back into a MotionFrame.
 * Returns null if the buffer size doesn't match.
 */
export function decodeMotionFrame(data: Uint8Array): MotionFrame | null {
  if (data.byteLength !== MOTION_FRAME_BYTE_SIZE) {
    return null;
  }

  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const floats = new Float32Array(buffer, 0, (MOTION_FRAME_BYTE_SIZE - 1) / 4);
  const view = new DataView(buffer);

  const qualityByte = view.getUint8(MOTION_FRAME_BYTE_SIZE - 1);

  return {
    t: floats[0],
    bs: new Float32Array(floats.buffer, 4, 52),
    bones: new Float32Array(floats.buffer, 4 + 52 * 4, 60),
    lh: new Float32Array(floats.buffer, 4 + 52 * 4 + 60 * 4, 80),
    rh: new Float32Array(floats.buffer, 4 + 52 * 4 + 60 * 4 + 80 * 4, 80),
    quality: {
      face: (qualityByte & 1) !== 0,
      pose: (qualityByte & 2) !== 0,
      hands: (qualityByte & 4) !== 0,
    },
  };
}
```

- [ ] **Step 6: Update barrel export**

```typescript
// packages/realtime/src/index.ts

export * from './types';
export { PhrenRoom, type PhrenRoomCallbacks } from './livekit-client';
export { encodeMotionFrame, decodeMotionFrame } from './data-channel';
```

- [ ] **Step 7: Run pnpm install and verify typecheck**

Run: `pnpm install && pnpm turbo typecheck --filter=@phren/realtime`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/realtime/
git commit -m "feat(realtime): add LiveKit client wrapper, motion frame codec, and session types"
```

---

### Task 2: Motion Frame Codec Tests

**Files:**
- Create: `packages/realtime/src/tests/frame-codec.test.ts`

**Context:** Test the binary encode/decode roundtrip for motion frames. This is the most critical data path — if encoding is wrong, avatar driving breaks.

- [ ] **Step 1: Write the tests**

```typescript
// packages/realtime/src/tests/frame-codec.test.ts

import { describe, it, expect } from 'vitest';
import { encodeMotionFrame, decodeMotionFrame } from '../data-channel';
import type { MotionFrame } from '../types';
import { MOTION_FRAME_BYTE_SIZE } from '../types';

function createTestFrame(overrides: Partial<MotionFrame> = {}): MotionFrame {
  return {
    t: 12345.678,
    bs: new Float32Array(52).fill(0.5),
    bones: new Float32Array(60).fill(0),
    lh: new Float32Array(80).fill(0),
    rh: new Float32Array(80).fill(0),
    quality: { face: true, pose: true, hands: true },
    ...overrides,
  };
}

describe('Motion Frame Codec', () => {
  it('encodes to the correct byte size', () => {
    const frame = createTestFrame();
    const encoded = encodeMotionFrame(frame);
    expect(encoded.byteLength).toBe(MOTION_FRAME_BYTE_SIZE);
  });

  it('roundtrips a full frame with all solvers active', () => {
    const frame = createTestFrame({
      t: 9999.5,
      quality: { face: true, pose: true, hands: true },
    });
    // Set some distinctive values
    frame.bs[0] = 0.1;
    frame.bs[51] = 0.9;
    frame.bones[0] = 0.707;
    frame.bones[59] = -0.707;
    frame.lh[0] = 0.5;
    frame.rh[79] = -0.5;

    const encoded = encodeMotionFrame(frame);
    const decoded = decodeMotionFrame(encoded)!;

    expect(decoded).not.toBeNull();
    expect(decoded.t).toBeCloseTo(9999.5, 1);
    expect(decoded.bs[0]).toBeCloseTo(0.1, 5);
    expect(decoded.bs[51]).toBeCloseTo(0.9, 5);
    expect(decoded.bones[0]).toBeCloseTo(0.707, 3);
    expect(decoded.bones[59]).toBeCloseTo(-0.707, 3);
    expect(decoded.lh[0]).toBeCloseTo(0.5, 5);
    expect(decoded.rh[79]).toBeCloseTo(-0.5, 5);
    expect(decoded.quality).toEqual({ face: true, pose: true, hands: true });
  });

  it('roundtrips a frame with only face solver active', () => {
    const frame = createTestFrame({
      quality: { face: true, pose: false, hands: false },
    });

    const encoded = encodeMotionFrame(frame);
    const decoded = decodeMotionFrame(encoded)!;

    expect(decoded.quality).toEqual({ face: true, pose: false, hands: false });
  });

  it('roundtrips a frame with no solvers active', () => {
    const frame = createTestFrame({
      quality: { face: false, pose: false, hands: false },
    });

    const encoded = encodeMotionFrame(frame);
    const decoded = decodeMotionFrame(encoded)!;

    expect(decoded.quality).toEqual({ face: false, pose: false, hands: false });
  });

  it('preserves blend shape precision within float32 limits', () => {
    const frame = createTestFrame();
    // Set each blend shape to a unique value
    for (let i = 0; i < 52; i++) {
      frame.bs[i] = i / 52;
    }

    const encoded = encodeMotionFrame(frame);
    const decoded = decodeMotionFrame(encoded)!;

    for (let i = 0; i < 52; i++) {
      expect(decoded.bs[i]).toBeCloseTo(i / 52, 5);
    }
  });

  it('returns null for wrong buffer size', () => {
    const tooSmall = new Uint8Array(100);
    expect(decodeMotionFrame(tooSmall)).toBeNull();

    const tooLarge = new Uint8Array(2000);
    expect(decodeMotionFrame(tooLarge)).toBeNull();
  });

  it('handles negative quaternion values', () => {
    const frame = createTestFrame();
    frame.bones[0] = -1.0;
    frame.bones[1] = 0.0;
    frame.bones[2] = 0.0;
    frame.bones[3] = 0.0;

    const encoded = encodeMotionFrame(frame);
    const decoded = decodeMotionFrame(encoded)!;

    expect(decoded.bones[0]).toBeCloseTo(-1.0, 5);
    expect(decoded.bones[1]).toBeCloseTo(0.0, 5);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm turbo test --filter=@phren/realtime`
Expected: 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/realtime/src/tests/
git commit -m "test(realtime): add motion frame codec roundtrip tests"
```

---

### Task 3: Motion Tracking Solvers — Face, Pose, Hand

**Files:**
- Create: `packages/realtime/src/motion/types.ts`
- Create: `packages/realtime/src/motion/face-solver.ts`
- Create: `packages/realtime/src/motion/pose-solver.ts`
- Create: `packages/realtime/src/motion/hand-solver.ts`
- Create: `packages/realtime/src/motion/frame-encoder.ts`
- Create: `packages/realtime/src/motion/frame-decoder.ts`

**Context:** These solvers convert raw MediaPipe landmark data into the compact motion frame format. They run in the main thread (called from the Web Worker's postMessage handler). The face solver maps 468 face mesh landmarks to 52 ARKit blend shape weights. The pose solver maps 33 pose landmarks to upper-body bone rotations. The hand solver maps 21 hand landmarks × 2 to finger joint rotations.

**Important:** MediaPipe Tasks Vision already outputs blend shape weights directly from `FaceLandmarker` when configured with `outputFaceBlendshapes: true`. Our face solver just normalizes these into the standard 52-index array. The pose and hand solvers need to convert landmarks (3D positions) to joint rotations (quaternions) — this is the heavy math.

- [ ] **Step 1: Create motion types**

```typescript
// packages/realtime/src/motion/types.ts

/** 3D point from MediaPipe landmark output */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** MediaPipe FaceLandmarker blend shape output (already named weights) */
export interface FaceBlendShapes {
  categories: Array<{
    categoryName: string;
    score: number;
  }>;
}

/** Result from FaceLandmarker */
export interface FaceLandmarkerResult {
  faceLandmarks: Landmark[][];
  faceBlendshapes?: FaceBlendShapes[];
}

/** Result from PoseLandmarker */
export interface PoseLandmarkerResult {
  landmarks: Landmark[][];
  worldLandmarks: Landmark[][];
}

/** Result from HandLandmarker */
export interface HandLandmarkerResult {
  landmarks: Landmark[][];
  worldLandmarks: Landmark[][];
  handedness: Array<Array<{ categoryName: string }>>;
}

/** Output from face solver: 52 ARKit blend shape weights */
export interface FaceSolverOutput {
  blendShapes: Float32Array; // length 52
}

/** A quaternion rotation [x, y, z, w] */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** The 15 upper-body bones we track */
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

/** Output from pose solver: bone rotations */
export interface PoseSolverOutput {
  boneRotations: Map<TrackedBone, Quaternion>;
}

/** The 20 finger joints per hand */
export const HAND_JOINTS = [
  'wrist',
  'thumbCMC', 'thumbMCP', 'thumbIP', 'thumbTip',
  'indexMCP', 'indexPIP', 'indexDIP', 'indexTip',
  'middleMCP', 'middlePIP', 'middleDIP', 'middleTip',
  'ringMCP', 'ringPIP', 'ringDIP', 'ringTip',
  'pinkyMCP', 'pinkyPIP', 'pinkyDIP',
] as const;

export type HandJoint = (typeof HAND_JOINTS)[number];

/** Output from hand solver: joint rotations for one hand */
export interface HandSolverOutput {
  jointRotations: Map<HandJoint, Quaternion>;
}

/** Messages between main thread and MediaPipe Web Worker */
export type WorkerMessage =
  | { type: 'init'; wasmPath: string; modelPaths: { face: string; pose: string; hand: string } }
  | { type: 'init_complete' }
  | { type: 'process_frame'; imageData: ImageBitmap; timestamp: number }
  | {
      type: 'frame_result';
      timestamp: number;
      face: FaceLandmarkerResult | null;
      pose: PoseLandmarkerResult | null;
      hands: HandLandmarkerResult | null;
      processingTimeMs: number;
    }
  | { type: 'error'; message: string }
  | { type: 'performance_warning'; fps: number; recommendation: 'downgrade_to_face_only' };
```

- [ ] **Step 2: Create face solver**

```typescript
// packages/realtime/src/motion/face-solver.ts

import type { FaceLandmarkerResult, FaceSolverOutput } from './types';

/**
 * The 52 ARKit face blend shape names in canonical order.
 * MediaPipe's FaceLandmarker outputs these same names when
 * `outputFaceBlendshapes: true` is set.
 */
export const ARKIT_BLEND_SHAPES = [
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeLookDownLeft', 'eyeLookDownRight',
  'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight',
  'eyeLookUpLeft', 'eyeLookUpRight', 'eyeSquintLeft', 'eyeSquintRight',
  'eyeWideLeft', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawOpen', 'jawRight',
  'mouthClose', 'mouthDimpleLeft', 'mouthDimpleRight',
  'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel',
  'mouthLeft', 'mouthLowerDownLeft', 'mouthLowerDownRight',
  'mouthPressLeft', 'mouthPressRight', 'mouthPucker',
  'mouthRight', 'mouthRollLower', 'mouthRollUpper',
  'mouthShrugLower', 'mouthShrugUpper', 'mouthSmileLeft', 'mouthSmileRight',
  'mouthStretchLeft', 'mouthStretchRight', 'mouthUpperUpLeft', 'mouthUpperUpRight',
  'noseSneerLeft', 'noseSneerRight',
  '_neutral',
] as const;

/** Map from blend shape name to index for fast lookup */
const BLEND_SHAPE_INDEX = new Map<string, number>(
  ARKIT_BLEND_SHAPES.map((name, i) => [name, i])
);

/**
 * Converts MediaPipe FaceLandmarker blend shape output to a fixed-size
 * Float32Array(52) indexed by ARKIT_BLEND_SHAPES order.
 *
 * MediaPipe already outputs named blend shape weights — we just need to
 * map them to our canonical index order and clamp to [0, 1].
 */
export function solveFace(result: FaceLandmarkerResult): FaceSolverOutput | null {
  if (!result.faceBlendshapes || result.faceBlendshapes.length === 0) {
    return null;
  }

  const blendShapes = new Float32Array(52);
  const categories = result.faceBlendshapes[0].categories;

  for (const category of categories) {
    const index = BLEND_SHAPE_INDEX.get(category.categoryName);
    if (index !== undefined && index < 52) {
      blendShapes[index] = Math.max(0, Math.min(1, category.score));
    }
  }

  return { blendShapes };
}
```

- [ ] **Step 3: Create pose solver**

```typescript
// packages/realtime/src/motion/pose-solver.ts

import type { PoseLandmarkerResult, PoseSolverOutput, Quaternion, Landmark, TrackedBone } from './types';
import { TRACKED_BONES } from './types';

/**
 * MediaPipe Pose landmark indices (33 landmarks).
 * We use worldLandmarks (3D metric space) for rotation calculation.
 */
const POSE = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

/** Identity quaternion (no rotation) */
const IDENTITY: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

/** Normalize a quaternion */
function normalize(q: Quaternion): Quaternion {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len < 0.0001) return { ...IDENTITY };
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

/** Create a quaternion from two direction vectors (from → to) */
function quaternionFromVectors(from: Landmark, to: Landmark): Quaternion {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (len < 0.0001) return { ...IDENTITY };

  // Direction vector
  const dirX = dx / len;
  const dirY = dy / len;
  const dirZ = dz / len;

  // Reference direction (up: 0, 1, 0)
  const refX = 0, refY = 1, refZ = 0;

  // Cross product (rotation axis)
  const crossX = refY * dirZ - refZ * dirY;
  const crossY = refZ * dirX - refX * dirZ;
  const crossZ = refX * dirY - refY * dirX;

  // Dot product (cos of angle)
  const dot = refX * dirX + refY * dirY + refZ * dirZ;

  // Quaternion from axis-angle
  const w = 1 + dot;
  if (w < 0.0001) {
    // Vectors are opposite — rotate 180° around any perpendicular axis
    return normalize({ x: 0, y: 0, z: 1, w: 0 });
  }

  return normalize({ x: crossX, y: crossY, z: crossZ, w });
}

/** Compute midpoint between two landmarks */
function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

/**
 * Converts MediaPipe PoseLandmarker output to upper body bone rotations.
 * Uses worldLandmarks for metric 3D positions.
 * Lower body is ignored (therapist is seated).
 */
export function solvePose(result: PoseLandmarkerResult): PoseSolverOutput | null {
  if (!result.worldLandmarks || result.worldLandmarks.length === 0) {
    return null;
  }

  const lm = result.worldLandmarks[0];
  const rotations = new Map<TrackedBone, Quaternion>();

  // Hip center (midpoint of hips)
  const hipCenter = midpoint(lm[POSE.LEFT_HIP], lm[POSE.RIGHT_HIP]);
  const shoulderCenter = midpoint(lm[POSE.LEFT_SHOULDER], lm[POSE.RIGHT_SHOULDER]);

  // Spine: hips → shoulders
  rotations.set('hips', { ...IDENTITY });
  rotations.set('spine', quaternionFromVectors(hipCenter, shoulderCenter));

  // Chest: shoulders → neck area (midpoint of ears as proxy)
  const neckProxy = midpoint(lm[POSE.LEFT_EAR], lm[POSE.RIGHT_EAR]);
  rotations.set('chest', quaternionFromVectors(shoulderCenter, neckProxy));

  // Neck: shoulder center → nose
  rotations.set('neck', quaternionFromVectors(shoulderCenter, lm[POSE.NOSE]));

  // Head: nose direction (simplified)
  const eyeCenter = midpoint(lm[POSE.LEFT_EYE], lm[POSE.RIGHT_EYE]);
  rotations.set('head', quaternionFromVectors(neckProxy, eyeCenter));

  // Left arm chain
  rotations.set('leftShoulder', quaternionFromVectors(shoulderCenter, lm[POSE.LEFT_SHOULDER]));
  rotations.set('leftUpperArm', quaternionFromVectors(lm[POSE.LEFT_SHOULDER], lm[POSE.LEFT_ELBOW]));
  rotations.set('leftLowerArm', quaternionFromVectors(lm[POSE.LEFT_ELBOW], lm[POSE.LEFT_WRIST]));
  rotations.set('leftHand', quaternionFromVectors(lm[POSE.LEFT_ELBOW], lm[POSE.LEFT_WRIST]));

  // Right arm chain
  rotations.set('rightShoulder', quaternionFromVectors(shoulderCenter, lm[POSE.RIGHT_SHOULDER]));
  rotations.set('rightUpperArm', quaternionFromVectors(lm[POSE.RIGHT_SHOULDER], lm[POSE.RIGHT_ELBOW]));
  rotations.set('rightLowerArm', quaternionFromVectors(lm[POSE.RIGHT_ELBOW], lm[POSE.RIGHT_WRIST]));
  rotations.set('rightHand', quaternionFromVectors(lm[POSE.RIGHT_ELBOW], lm[POSE.RIGHT_WRIST]));

  // Eyes (gaze direction)
  rotations.set('leftEye', quaternionFromVectors(lm[POSE.LEFT_EYE_INNER], lm[POSE.LEFT_EYE_OUTER]));
  rotations.set('rightEye', quaternionFromVectors(lm[POSE.RIGHT_EYE_INNER], lm[POSE.RIGHT_EYE_OUTER]));

  return { boneRotations: rotations };
}
```

- [ ] **Step 4: Create hand solver**

```typescript
// packages/realtime/src/motion/hand-solver.ts

import type { HandLandmarkerResult, HandSolverOutput, Quaternion, Landmark, HandJoint } from './types';
import { HAND_JOINTS } from './types';

/**
 * MediaPipe Hand landmark indices (21 per hand).
 * Landmarks represent finger joints from wrist to fingertips.
 */
const HAND = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
} as const;

/** Map landmark indices to our joint names (first 20 joints, excluding pinkyTip) */
const JOINT_LANDMARK_MAP: Array<[HandJoint, number, number]> = [
  // [joint, fromLandmark, toLandmark] — rotation = direction from parent to child
  ['wrist', HAND.WRIST, HAND.MIDDLE_MCP],
  ['thumbCMC', HAND.THUMB_CMC, HAND.THUMB_MCP],
  ['thumbMCP', HAND.THUMB_MCP, HAND.THUMB_IP],
  ['thumbIP', HAND.THUMB_IP, HAND.THUMB_TIP],
  ['thumbTip', HAND.THUMB_IP, HAND.THUMB_TIP], // same direction, marks end
  ['indexMCP', HAND.INDEX_MCP, HAND.INDEX_PIP],
  ['indexPIP', HAND.INDEX_PIP, HAND.INDEX_DIP],
  ['indexDIP', HAND.INDEX_DIP, HAND.INDEX_TIP],
  ['indexTip', HAND.INDEX_DIP, HAND.INDEX_TIP],
  ['middleMCP', HAND.MIDDLE_MCP, HAND.MIDDLE_PIP],
  ['middlePIP', HAND.MIDDLE_PIP, HAND.MIDDLE_DIP],
  ['middleDIP', HAND.MIDDLE_DIP, HAND.MIDDLE_TIP],
  ['middleTip', HAND.MIDDLE_DIP, HAND.MIDDLE_TIP],
  ['ringMCP', HAND.RING_MCP, HAND.RING_PIP],
  ['ringPIP', HAND.RING_PIP, HAND.RING_DIP],
  ['ringDIP', HAND.RING_DIP, HAND.RING_TIP],
  ['ringTip', HAND.RING_DIP, HAND.RING_TIP],
  ['pinkyMCP', HAND.PINKY_MCP, HAND.PINKY_PIP],
  ['pinkyPIP', HAND.PINKY_PIP, HAND.PINKY_DIP],
  ['pinkyDIP', HAND.PINKY_DIP, HAND.PINKY_TIP],
];

/** Identity quaternion */
const IDENTITY: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

/** Normalize a quaternion */
function normalize(q: Quaternion): Quaternion {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len < 0.0001) return { ...IDENTITY };
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

/** Create rotation quaternion from parent landmark to child landmark */
function jointRotation(parent: Landmark, child: Landmark): Quaternion {
  const dx = child.x - parent.x;
  const dy = child.y - parent.y;
  const dz = child.z - parent.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (len < 0.0001) return { ...IDENTITY };

  const dirX = dx / len;
  const dirY = dy / len;
  const dirZ = dz / len;

  // Reference: pointing up (0, 1, 0)
  const dot = dirY; // simplified dot with (0,1,0)
  const crossX = dirZ;
  const crossY = 0;
  const crossZ = -dirX;

  const w = 1 + dot;
  if (w < 0.0001) {
    return normalize({ x: 0, y: 0, z: 1, w: 0 });
  }

  return normalize({ x: crossX, y: crossY, z: crossZ, w });
}

/**
 * Converts MediaPipe HandLandmarker output to finger joint rotations.
 * Processes one hand at a time. Caller determines left/right from handedness.
 */
export function solveHand(landmarks: Landmark[]): HandSolverOutput | null {
  if (!landmarks || landmarks.length < 21) {
    return null;
  }

  const rotations = new Map<HandJoint, Quaternion>();

  for (const [joint, fromIdx, toIdx] of JOINT_LANDMARK_MAP) {
    rotations.set(joint, jointRotation(landmarks[fromIdx], landmarks[toIdx]));
  }

  return { jointRotations: rotations };
}

/**
 * Process both hands from HandLandmarker result.
 * Returns [leftHand, rightHand] — either may be null if hand not detected.
 */
export function solveHands(result: HandLandmarkerResult): [HandSolverOutput | null, HandSolverOutput | null] {
  let leftHand: HandSolverOutput | null = null;
  let rightHand: HandSolverOutput | null = null;

  if (!result.landmarks || result.landmarks.length === 0) {
    return [null, null];
  }

  for (let i = 0; i < result.landmarks.length && i < 2; i++) {
    const handedness = result.handedness[i]?.[0]?.categoryName;
    const solved = solveHand(result.landmarks[i]);

    // MediaPipe mirrors handedness — "Left" in results is actually the right hand
    // when using a front-facing camera (mirror mode)
    if (handedness === 'Left') {
      rightHand = solved;
    } else {
      leftHand = solved;
    }
  }

  return [leftHand, rightHand];
}
```

- [ ] **Step 5: Create frame encoder (solver outputs → MotionFrame)**

```typescript
// packages/realtime/src/motion/frame-encoder.ts

import type { MotionFrame, Quaternion } from '../types';
import type { FaceSolverOutput, PoseSolverOutput, HandSolverOutput, TrackedBone, HandJoint } from './types';
import { TRACKED_BONES, HAND_JOINTS } from './types';

/**
 * Combines solver outputs into a single MotionFrame ready for binary encoding.
 * Any solver output may be null (e.g., face-only fallback mode).
 */
export function buildMotionFrame(
  timestamp: number,
  face: FaceSolverOutput | null,
  pose: PoseSolverOutput | null,
  leftHand: HandSolverOutput | null,
  rightHand: HandSolverOutput | null,
): MotionFrame {
  // Blend shapes from face solver
  const bs = face ? new Float32Array(face.blendShapes) : new Float32Array(52);

  // Bone rotations from pose solver: 15 bones × 4 floats (quaternion) = 60
  const bones = new Float32Array(60);
  if (pose) {
    for (let i = 0; i < TRACKED_BONES.length; i++) {
      const bone = TRACKED_BONES[i] as TrackedBone;
      const q = pose.boneRotations.get(bone);
      if (q) {
        bones[i * 4] = q.x;
        bones[i * 4 + 1] = q.y;
        bones[i * 4 + 2] = q.z;
        bones[i * 4 + 3] = q.w;
      } else {
        // Identity quaternion
        bones[i * 4 + 3] = 1;
      }
    }
  } else {
    // All identity quaternions
    for (let i = 0; i < 15; i++) {
      bones[i * 4 + 3] = 1;
    }
  }

  // Left hand: 20 joints × 4 floats = 80
  const lh = packHandRotations(leftHand);

  // Right hand: 20 joints × 4 floats = 80
  const rh = packHandRotations(rightHand);

  return {
    t: timestamp,
    bs,
    bones,
    lh,
    rh,
    quality: {
      face: face !== null,
      pose: pose !== null,
      hands: leftHand !== null || rightHand !== null,
    },
  };
}

function packHandRotations(hand: HandSolverOutput | null): Float32Array {
  const packed = new Float32Array(80);
  if (!hand) {
    // Identity quaternions
    for (let i = 0; i < 20; i++) {
      packed[i * 4 + 3] = 1;
    }
    return packed;
  }

  for (let i = 0; i < HAND_JOINTS.length; i++) {
    const joint = HAND_JOINTS[i] as HandJoint;
    const q = hand.jointRotations.get(joint);
    if (q) {
      packed[i * 4] = q.x;
      packed[i * 4 + 1] = q.y;
      packed[i * 4 + 2] = q.z;
      packed[i * 4 + 3] = q.w;
    } else {
      packed[i * 4 + 3] = 1;
    }
  }

  return packed;
}
```

- [ ] **Step 6: Create frame decoder (MotionFrame → structured data for avatar)**

```typescript
// packages/realtime/src/motion/frame-decoder.ts

import type { MotionFrame, Quaternion } from '../types';
import type { TrackedBone, HandJoint } from './types';
import { TRACKED_BONES, HAND_JOINTS } from './types';
import { ARKIT_BLEND_SHAPES } from './face-solver';

/** Decoded motion data with named accessors for the avatar driver */
export interface DecodedMotionFrame {
  timestamp: number;
  quality: MotionFrame['quality'];

  /** Get blend shape weight by ARKit name */
  getBlendShape(name: string): number;

  /** Get all blend shapes as a name→weight map */
  getAllBlendShapes(): Map<string, number>;

  /** Get bone rotation by name */
  getBoneRotation(bone: TrackedBone): Quaternion;

  /** Get left hand joint rotation */
  getLeftHandJoint(joint: HandJoint): Quaternion;

  /** Get right hand joint rotation */
  getRightHandJoint(joint: HandJoint): Quaternion;
}

const IDENTITY: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Wraps a decoded MotionFrame with named accessors for convenient use
 * by the avatar driver (Phase 3). Zero-copy — reads directly from
 * the Float32Arrays.
 */
export function createDecodedFrame(frame: MotionFrame): DecodedMotionFrame {
  return {
    timestamp: frame.t,
    quality: frame.quality,

    getBlendShape(name: string): number {
      const index = ARKIT_BLEND_SHAPES.indexOf(name as any);
      if (index === -1 || index >= 52) return 0;
      return frame.bs[index];
    },

    getAllBlendShapes(): Map<string, number> {
      const map = new Map<string, number>();
      for (let i = 0; i < 52; i++) {
        map.set(ARKIT_BLEND_SHAPES[i], frame.bs[i]);
      }
      return map;
    },

    getBoneRotation(bone: TrackedBone): Quaternion {
      const index = TRACKED_BONES.indexOf(bone);
      if (index === -1) return { ...IDENTITY };
      return {
        x: frame.bones[index * 4],
        y: frame.bones[index * 4 + 1],
        z: frame.bones[index * 4 + 2],
        w: frame.bones[index * 4 + 3],
      };
    },

    getLeftHandJoint(joint: HandJoint): Quaternion {
      const index = HAND_JOINTS.indexOf(joint);
      if (index === -1) return { ...IDENTITY };
      return {
        x: frame.lh[index * 4],
        y: frame.lh[index * 4 + 1],
        z: frame.lh[index * 4 + 2],
        w: frame.lh[index * 4 + 3],
      };
    },

    getRightHandJoint(joint: HandJoint): Quaternion {
      const index = HAND_JOINTS.indexOf(joint);
      if (index === -1) return { ...IDENTITY };
      return {
        x: frame.rh[index * 4],
        y: frame.rh[index * 4 + 1],
        z: frame.rh[index * 4 + 2],
        w: frame.rh[index * 4 + 3],
      };
    },
  };
}
```

- [ ] **Step 7: Update barrel export**

```typescript
// packages/realtime/src/index.ts

// Core types and LiveKit wrapper
export * from './types';
export { PhrenRoom, type PhrenRoomCallbacks } from './livekit-client';
export { encodeMotionFrame, decodeMotionFrame } from './data-channel';

// Motion tracking
export * from './motion/types';
export { solveFace, ARKIT_BLEND_SHAPES } from './motion/face-solver';
export { solvePose } from './motion/pose-solver';
export { solveHand, solveHands } from './motion/hand-solver';
export { buildMotionFrame } from './motion/frame-encoder';
export { createDecodedFrame, type DecodedMotionFrame } from './motion/frame-decoder';
```

- [ ] **Step 8: Run typecheck**

Run: `pnpm turbo typecheck --filter=@phren/realtime`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/realtime/src/motion/ packages/realtime/src/index.ts
git commit -m "feat(realtime): add face, pose, and hand solvers with frame encoder/decoder"
```

---

### Task 4: Solver Unit Tests

**Files:**
- Create: `packages/realtime/src/tests/face-solver.test.ts`
- Create: `packages/realtime/src/tests/pose-solver.test.ts`
- Create: `packages/realtime/src/tests/hand-solver.test.ts`

**Context:** These tests validate the solvers with synthetic landmark data. Real MediaPipe output has specific structure — tests use minimal-but-realistic input shapes.

- [ ] **Step 1: Write face solver tests**

```typescript
// packages/realtime/src/tests/face-solver.test.ts

import { describe, it, expect } from 'vitest';
import { solveFace, ARKIT_BLEND_SHAPES } from '../motion/face-solver';
import type { FaceLandmarkerResult } from '../motion/types';

describe('Face Solver', () => {
  it('returns null when no blend shapes available', () => {
    const result: FaceLandmarkerResult = {
      faceLandmarks: [[]],
      faceBlendshapes: [],
    };
    expect(solveFace(result)).toBeNull();
  });

  it('returns null when faceBlendshapes is undefined', () => {
    const result: FaceLandmarkerResult = {
      faceLandmarks: [[]],
    };
    expect(solveFace(result)).toBeNull();
  });

  it('maps named blend shapes to correct indices', () => {
    const result: FaceLandmarkerResult = {
      faceLandmarks: [[]],
      faceBlendshapes: [{
        categories: [
          { categoryName: 'jawOpen', score: 0.8 },
          { categoryName: 'eyeBlinkLeft', score: 0.5 },
          { categoryName: 'mouthSmileLeft', score: 0.3 },
        ],
      }],
    };

    const output = solveFace(result)!;
    expect(output).not.toBeNull();
    expect(output.blendShapes.length).toBe(52);

    // Check specific indices
    const jawOpenIdx = ARKIT_BLEND_SHAPES.indexOf('jawOpen');
    const blinkLeftIdx = ARKIT_BLEND_SHAPES.indexOf('eyeBlinkLeft');
    const smileLeftIdx = ARKIT_BLEND_SHAPES.indexOf('mouthSmileLeft');

    expect(output.blendShapes[jawOpenIdx]).toBeCloseTo(0.8, 5);
    expect(output.blendShapes[blinkLeftIdx]).toBeCloseTo(0.5, 5);
    expect(output.blendShapes[smileLeftIdx]).toBeCloseTo(0.3, 5);
  });

  it('clamps values to [0, 1]', () => {
    const result: FaceLandmarkerResult = {
      faceLandmarks: [[]],
      faceBlendshapes: [{
        categories: [
          { categoryName: 'jawOpen', score: 1.5 },
          { categoryName: 'eyeBlinkLeft', score: -0.3 },
        ],
      }],
    };

    const output = solveFace(result)!;
    const jawOpenIdx = ARKIT_BLEND_SHAPES.indexOf('jawOpen');
    const blinkLeftIdx = ARKIT_BLEND_SHAPES.indexOf('eyeBlinkLeft');

    expect(output.blendShapes[jawOpenIdx]).toBe(1);
    expect(output.blendShapes[blinkLeftIdx]).toBe(0);
  });

  it('ignores unknown blend shape names', () => {
    const result: FaceLandmarkerResult = {
      faceLandmarks: [[]],
      faceBlendshapes: [{
        categories: [
          { categoryName: 'unknownShape', score: 0.5 },
          { categoryName: 'jawOpen', score: 0.7 },
        ],
      }],
    };

    const output = solveFace(result)!;
    const jawOpenIdx = ARKIT_BLEND_SHAPES.indexOf('jawOpen');
    expect(output.blendShapes[jawOpenIdx]).toBeCloseTo(0.7, 5);
  });

  it('produces exactly 52 blend shape values', () => {
    expect(ARKIT_BLEND_SHAPES.length).toBe(52);
  });
});
```

- [ ] **Step 2: Write pose solver tests**

```typescript
// packages/realtime/src/tests/pose-solver.test.ts

import { describe, it, expect } from 'vitest';
import { solvePose } from '../motion/pose-solver';
import type { PoseLandmarkerResult, Landmark } from '../motion/types';
import { TRACKED_BONES } from '../motion/types';

/** Create a minimal set of 33 landmarks for testing */
function createTestLandmarks(): Landmark[] {
  const landmarks: Landmark[] = [];
  for (let i = 0; i < 33; i++) {
    landmarks.push({ x: 0, y: 0, z: 0 });
  }

  // Set up a basic standing pose (simplified):
  // Hips at origin
  landmarks[23] = { x: -0.1, y: 0, z: 0 };   // LEFT_HIP
  landmarks[24] = { x: 0.1, y: 0, z: 0 };     // RIGHT_HIP
  // Shoulders above hips
  landmarks[11] = { x: -0.15, y: 0.5, z: 0 }; // LEFT_SHOULDER
  landmarks[12] = { x: 0.15, y: 0.5, z: 0 };  // RIGHT_SHOULDER
  // Head above shoulders
  landmarks[0] = { x: 0, y: 0.7, z: 0.05 };   // NOSE
  landmarks[7] = { x: -0.08, y: 0.65, z: 0 };  // LEFT_EAR
  landmarks[8] = { x: 0.08, y: 0.65, z: 0 };   // RIGHT_EAR
  // Eyes
  landmarks[1] = { x: -0.03, y: 0.68, z: 0.05 }; // LEFT_EYE_INNER
  landmarks[2] = { x: -0.04, y: 0.68, z: 0.05 }; // LEFT_EYE
  landmarks[3] = { x: -0.05, y: 0.68, z: 0.05 }; // LEFT_EYE_OUTER
  landmarks[4] = { x: 0.03, y: 0.68, z: 0.05 };  // RIGHT_EYE_INNER
  landmarks[5] = { x: 0.04, y: 0.68, z: 0.05 };  // RIGHT_EYE
  landmarks[6] = { x: 0.05, y: 0.68, z: 0.05 };  // RIGHT_EYE_OUTER
  // Arms at sides
  landmarks[13] = { x: -0.3, y: 0.3, z: 0 };  // LEFT_ELBOW
  landmarks[14] = { x: 0.3, y: 0.3, z: 0 };    // RIGHT_ELBOW
  landmarks[15] = { x: -0.3, y: 0.1, z: 0 };   // LEFT_WRIST
  landmarks[16] = { x: 0.3, y: 0.1, z: 0 };    // RIGHT_WRIST

  return landmarks;
}

describe('Pose Solver', () => {
  it('returns null when no landmarks', () => {
    const result: PoseLandmarkerResult = {
      landmarks: [],
      worldLandmarks: [],
    };
    expect(solvePose(result)).toBeNull();
  });

  it('returns rotations for all 15 tracked bones', () => {
    const landmarks = createTestLandmarks();
    const result: PoseLandmarkerResult = {
      landmarks: [landmarks],
      worldLandmarks: [landmarks],
    };

    const output = solvePose(result)!;
    expect(output).not.toBeNull();

    for (const bone of TRACKED_BONES) {
      const rotation = output.boneRotations.get(bone);
      expect(rotation).toBeDefined();
      // Each quaternion should be normalized (length ≈ 1)
      const len = Math.sqrt(
        rotation!.x ** 2 + rotation!.y ** 2 + rotation!.z ** 2 + rotation!.w ** 2
      );
      expect(len).toBeCloseTo(1, 3);
    }
  });

  it('spine rotation points upward when shoulders above hips', () => {
    const landmarks = createTestLandmarks();
    const result: PoseLandmarkerResult = {
      landmarks: [landmarks],
      worldLandmarks: [landmarks],
    };

    const output = solvePose(result)!;
    const spine = output.boneRotations.get('spine')!;

    // For a straight-up spine, the rotation should be close to identity
    // (since reference direction is up and spine points up)
    expect(spine.w).toBeGreaterThan(0.9);
  });
});
```

- [ ] **Step 3: Write hand solver tests**

```typescript
// packages/realtime/src/tests/hand-solver.test.ts

import { describe, it, expect } from 'vitest';
import { solveHand, solveHands } from '../motion/hand-solver';
import type { HandLandmarkerResult, Landmark } from '../motion/types';
import { HAND_JOINTS } from '../motion/types';

/** Create 21 landmarks for a flat open hand */
function createOpenHandLandmarks(): Landmark[] {
  const landmarks: Landmark[] = [];
  // Wrist at origin
  landmarks[0] = { x: 0, y: 0, z: 0 };

  // Thumb (extending to the right and up)
  landmarks[1] = { x: 0.02, y: 0.02, z: 0 };
  landmarks[2] = { x: 0.04, y: 0.04, z: 0 };
  landmarks[3] = { x: 0.06, y: 0.06, z: 0 };
  landmarks[4] = { x: 0.08, y: 0.08, z: 0 };

  // Index finger (pointing up)
  for (let i = 5; i <= 8; i++) {
    landmarks[i] = { x: -0.02, y: (i - 4) * 0.03, z: 0 };
  }

  // Middle finger
  for (let i = 9; i <= 12; i++) {
    landmarks[i] = { x: 0, y: (i - 8) * 0.03, z: 0 };
  }

  // Ring finger
  for (let i = 13; i <= 16; i++) {
    landmarks[i] = { x: 0.02, y: (i - 12) * 0.03, z: 0 };
  }

  // Pinky
  for (let i = 17; i <= 20; i++) {
    landmarks[i] = { x: 0.04, y: (i - 16) * 0.025, z: 0 };
  }

  return landmarks;
}

describe('Hand Solver', () => {
  it('returns null for empty landmarks', () => {
    expect(solveHand([])).toBeNull();
  });

  it('returns null for fewer than 21 landmarks', () => {
    const partial = createOpenHandLandmarks().slice(0, 10);
    expect(solveHand(partial)).toBeNull();
  });

  it('returns rotations for all 20 hand joints', () => {
    const landmarks = createOpenHandLandmarks();
    const output = solveHand(landmarks)!;

    expect(output).not.toBeNull();
    expect(output.jointRotations.size).toBe(20);

    for (const joint of HAND_JOINTS) {
      const rotation = output.jointRotations.get(joint);
      expect(rotation).toBeDefined();
      // Quaternion should be normalized
      const len = Math.sqrt(
        rotation!.x ** 2 + rotation!.y ** 2 + rotation!.z ** 2 + rotation!.w ** 2
      );
      expect(len).toBeCloseTo(1, 3);
    }
  });
});

describe('solveHands (both hands)', () => {
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

  it('correctly maps mirrored handedness (Left=right, Right=left)', () => {
    const landmarks = createOpenHandLandmarks();
    const result: HandLandmarkerResult = {
      landmarks: [landmarks],
      worldLandmarks: [landmarks],
      handedness: [[{ categoryName: 'Left' }]],
    };

    const [left, right] = solveHands(result);
    // MediaPipe "Left" in mirror mode = user's right hand
    expect(left).toBeNull();
    expect(right).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run all tests**

Run: `pnpm turbo test --filter=@phren/realtime`
Expected: All tests PASS (frame codec + face + pose + hand)

- [ ] **Step 5: Commit**

```bash
git add packages/realtime/src/tests/
git commit -m "test(realtime): add unit tests for face, pose, and hand solvers"
```

---

### Task 5: Session Coordinator Durable Object — State Machine and Types

**Files:**
- Modify: `workers/session-coordinator/package.json`
- Modify: `workers/session-coordinator/tsconfig.json`
- Create: `workers/session-coordinator/wrangler.toml`
- Create: `workers/session-coordinator/src/env.ts`
- Create: `workers/session-coordinator/src/types.ts`
- Create: `workers/session-coordinator/src/state-machine.ts`
- Create: `workers/session-coordinator/src/tests/state-machine.test.ts`

**Context:** The Session Coordinator DO manages the lifecycle of a telehealth session. It uses the Cloudflare Durable Objects WebSocket Hibernation API to maintain persistent WebSocket connections with both participants while minimizing billing. The state machine enforces valid transitions: `waiting → active → paused → ended`.

- [ ] **Step 1: Update package.json with dependencies**

```json
{
  "name": "@phren/session-coordinator",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@phren/core": "workspace:*",
    "@phren/db": "workspace:*",
    "drizzle-orm": "^0.45.1"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260317.1",
    "vitest": "^4.1.0"
  }
}
```

- [ ] **Step 2: Update tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create wrangler.toml**

```toml
name = "phren-session-coordinator"
main = "src/index.ts"
compatibility_date = "2026-03-01"
compatibility_flags = ["nodejs_compat"]

[durable_objects]
bindings = [
  { name = "SESSION_COORDINATOR", class_name = "SessionCoordinator" }
]

[[migrations]]
tag = "v1"
new_classes = ["SessionCoordinator"]

[[d1_databases]]
binding = "DB"
database_name = "phren-db"
database_id = "placeholder"

[[kv_namespaces]]
binding = "KV_SESSIONS"
id = "placeholder"

[[kv_namespaces]]
binding = "KV_PRESENCE"
id = "placeholder"
```

- [ ] **Step 4: Create env.ts**

```typescript
// workers/session-coordinator/src/env.ts

export interface Env {
  DB: D1Database;
  KV_SESSIONS: KVNamespace;
  KV_PRESENCE: KVNamespace;
  SESSION_COORDINATOR: DurableObjectNamespace;
}
```

- [ ] **Step 5: Create types.ts**

```typescript
// workers/session-coordinator/src/types.ts

export type SessionState = 'waiting' | 'active' | 'paused' | 'ended';

export type ParticipantRole = 'patient' | 'provider';

export interface Participant {
  userId: string;
  role: ParticipantRole;
  displayName: string;
  joinedAt: string;
  isMuted: boolean;
  isCameraOff: boolean;
}

/** Messages the client can send to the DO */
export type ClientMessage =
  | { type: 'join'; userId: string; role: ParticipantRole; displayName: string }
  | { type: 'state_change'; state: SessionState }
  | { type: 'environment_change'; preset: string; customUrl?: string }
  | { type: 'tool_activate'; toolId: string; config: Record<string, unknown> }
  | { type: 'tool_deactivate'; toolId: string }
  | { type: 'chat'; content: string }
  | { type: 'media_state'; isMuted?: boolean; isCameraOff?: boolean }
  | { type: 'ping' };

/** Messages the DO sends to clients */
export type ServerMessage =
  | { type: 'state_changed'; state: SessionState; changedBy: string }
  | { type: 'participants'; participants: Participant[] }
  | { type: 'participant_joined'; participant: Participant }
  | { type: 'participant_left'; userId: string }
  | { type: 'environment_changed'; preset: string; customUrl?: string }
  | { type: 'tool_activated'; toolId: string; config: Record<string, unknown> }
  | { type: 'tool_deactivated'; toolId: string }
  | { type: 'chat'; senderId: string; senderName: string; content: string; timestamp: string }
  | { type: 'timer'; elapsedSeconds: number }
  | { type: 'error'; message: string }
  | { type: 'pong' };

/** Persisted session data in DO storage */
export interface SessionData {
  appointmentId: string;
  livekitRoomName: string;
  state: SessionState;
  startedAt: string | null;
  endedAt: string | null;
  environment: string;
  activeTools: Array<{ toolId: string; config: Record<string, unknown> }>;
  elapsedSeconds: number;
}
```

- [ ] **Step 6: Create state machine**

```typescript
// workers/session-coordinator/src/state-machine.ts

import type { SessionState } from './types';

/**
 * Valid session state transitions.
 * - waiting → active (both participants joined and provider starts)
 * - active → paused (provider pauses session)
 * - active → ended (provider ends session)
 * - paused → active (provider resumes session)
 * - paused → ended (provider ends from paused state)
 */
const VALID_TRANSITIONS: Record<SessionState, SessionState[]> = {
  waiting: ['active'],
  active: ['paused', 'ended'],
  paused: ['active', 'ended'],
  ended: [], // terminal state
};

/** Roles allowed to trigger each transition */
const TRANSITION_PERMISSIONS: Record<string, ParticipantRole[]> = {
  'waiting->active': ['provider'],
  'active->paused': ['provider'],
  'active->ended': ['provider', 'patient'],
  'paused->active': ['provider'],
  'paused->ended': ['provider'],
};

type ParticipantRole = 'patient' | 'provider';

export interface TransitionResult {
  success: boolean;
  error?: string;
  previousState?: SessionState;
  newState?: SessionState;
}

/**
 * Validates and performs a session state transition.
 *
 * @param currentState - The current session state
 * @param targetState - The desired new state
 * @param role - The role of the participant requesting the transition
 * @returns TransitionResult indicating success or failure with reason
 */
export function tryTransition(
  currentState: SessionState,
  targetState: SessionState,
  role: ParticipantRole,
): TransitionResult {
  // Check if transition is valid
  const validTargets = VALID_TRANSITIONS[currentState];
  if (!validTargets.includes(targetState)) {
    return {
      success: false,
      error: `Invalid transition: ${currentState} → ${targetState}. Valid targets: ${validTargets.join(', ') || 'none (terminal state)'}`,
    };
  }

  // Check if role is allowed
  const key = `${currentState}->${targetState}`;
  const allowedRoles = TRANSITION_PERMISSIONS[key] ?? [];
  if (!allowedRoles.includes(role)) {
    return {
      success: false,
      error: `Role '${role}' is not allowed to transition from ${currentState} to ${targetState}`,
    };
  }

  return {
    success: true,
    previousState: currentState,
    newState: targetState,
  };
}

/**
 * Checks whether a session should auto-pause due to participant disconnect.
 * Per spec: if both participants disconnect for >5 minutes, session auto-pauses.
 */
export function shouldAutoPause(
  currentState: SessionState,
  connectedCount: number,
): boolean {
  return currentState === 'active' && connectedCount === 0;
}

/**
 * Checks whether a session should auto-end.
 * Called after the auto-pause timeout expires and no one has reconnected.
 */
export function shouldAutoEnd(
  currentState: SessionState,
  connectedCount: number,
  pausedDurationMs: number,
  maxPauseDurationMs: number = 5 * 60 * 1000, // 5 minutes
): boolean {
  return currentState === 'paused' && connectedCount === 0 && pausedDurationMs >= maxPauseDurationMs;
}
```

- [ ] **Step 7: Write state machine tests**

```typescript
// workers/session-coordinator/src/tests/state-machine.test.ts

import { describe, it, expect } from 'vitest';
import { tryTransition, shouldAutoPause, shouldAutoEnd } from '../state-machine';

describe('Session State Machine', () => {
  describe('tryTransition', () => {
    it('allows waiting → active for provider', () => {
      const result = tryTransition('waiting', 'active', 'provider');
      expect(result.success).toBe(true);
      expect(result.newState).toBe('active');
    });

    it('rejects waiting → active for patient', () => {
      const result = tryTransition('waiting', 'active', 'patient');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('allows active → paused for provider', () => {
      const result = tryTransition('active', 'paused', 'provider');
      expect(result.success).toBe(true);
    });

    it('rejects active → paused for patient', () => {
      const result = tryTransition('active', 'paused', 'patient');
      expect(result.success).toBe(false);
    });

    it('allows active → ended for both roles', () => {
      expect(tryTransition('active', 'ended', 'provider').success).toBe(true);
      expect(tryTransition('active', 'ended', 'patient').success).toBe(true);
    });

    it('allows paused → active for provider', () => {
      const result = tryTransition('paused', 'active', 'provider');
      expect(result.success).toBe(true);
    });

    it('allows paused → ended for provider', () => {
      const result = tryTransition('paused', 'ended', 'provider');
      expect(result.success).toBe(true);
    });

    it('rejects transitions from ended (terminal)', () => {
      expect(tryTransition('ended', 'active', 'provider').success).toBe(false);
      expect(tryTransition('ended', 'waiting', 'provider').success).toBe(false);
    });

    it('rejects invalid transitions', () => {
      expect(tryTransition('waiting', 'ended', 'provider').success).toBe(false);
      expect(tryTransition('waiting', 'paused', 'provider').success).toBe(false);
      expect(tryTransition('active', 'waiting', 'provider').success).toBe(false);
    });

    it('includes previous and new state on success', () => {
      const result = tryTransition('active', 'ended', 'provider');
      expect(result.previousState).toBe('active');
      expect(result.newState).toBe('ended');
    });
  });

  describe('shouldAutoPause', () => {
    it('returns true when active and no one connected', () => {
      expect(shouldAutoPause('active', 0)).toBe(true);
    });

    it('returns false when active and someone connected', () => {
      expect(shouldAutoPause('active', 1)).toBe(false);
    });

    it('returns false when not active', () => {
      expect(shouldAutoPause('waiting', 0)).toBe(false);
      expect(shouldAutoPause('paused', 0)).toBe(false);
    });
  });

  describe('shouldAutoEnd', () => {
    it('returns true when paused, nobody connected, and timeout exceeded', () => {
      expect(shouldAutoEnd('paused', 0, 6 * 60 * 1000)).toBe(true);
    });

    it('returns false when timeout not exceeded', () => {
      expect(shouldAutoEnd('paused', 0, 2 * 60 * 1000)).toBe(false);
    });

    it('returns false when someone is connected', () => {
      expect(shouldAutoEnd('paused', 1, 10 * 60 * 1000)).toBe(false);
    });

    it('returns false when not paused', () => {
      expect(shouldAutoEnd('active', 0, 10 * 60 * 1000)).toBe(false);
    });
  });
});
```

- [ ] **Step 8: Run pnpm install and tests**

Run: `pnpm install && pnpm turbo test --filter=@phren/session-coordinator`
Expected: All state machine tests PASS

- [ ] **Step 9: Commit**

```bash
git add workers/session-coordinator/
git commit -m "feat(session-coordinator): add state machine, types, and wrangler config"
```

---

### Task 6: Session Coordinator Durable Object — WebSocket Handler

**Files:**
- Create: `workers/session-coordinator/src/session-do.ts`
- Modify: `workers/session-coordinator/src/index.ts`

**Context:** The Durable Object implements the WebSocket Hibernation API for persistent connections. It tracks participants, manages session state, broadcasts events, and runs a timer during active sessions. On session end, it persists metadata to D1.

- [ ] **Step 1: Create the SessionCoordinator DO class**

```typescript
// workers/session-coordinator/src/session-do.ts

import type { Env } from './env';
import type { SessionState, Participant, ClientMessage, ServerMessage, SessionData } from './types';
import { tryTransition, shouldAutoPause } from './state-machine';
import { createDb, telehealthSessions } from '@phren/db';
import { eq } from 'drizzle-orm';

/** Tag key for storing userId on WebSocket */
const USER_ID_TAG = 'userId';
const ROLE_TAG = 'role';
const NAME_TAG = 'name';

/**
 * Session Coordinator Durable Object.
 *
 * Manages a single telehealth session's lifecycle via WebSocket connections.
 * Uses the Hibernation API to minimize billing while maintaining connections.
 */
export class SessionCoordinator implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  // In-memory session data (loaded from storage on first request)
  private sessionData: SessionData | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private pausedAt: number | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  /** HTTP fetch handler — used for initial WebSocket upgrade */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      return this.handleWebSocketUpgrade(request);
    }

    if (url.pathname === '/init' && request.method === 'POST') {
      return this.handleInit(request);
    }

    if (url.pathname === '/status') {
      await this.loadSessionData();
      return Response.json({
        state: this.sessionData?.state ?? 'unknown',
        participants: this.getConnectedParticipants(),
        elapsedSeconds: this.sessionData?.elapsedSeconds ?? 0,
      });
    }

    return new Response('Not found', { status: 404 });
  }

  /** Initialize session data (called by API Worker when creating session) */
  private async handleInit(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      appointmentId: string;
      livekitRoomName: string;
    };

    const data: SessionData = {
      appointmentId: body.appointmentId,
      livekitRoomName: body.livekitRoomName,
      state: 'waiting',
      startedAt: null,
      endedAt: null,
      environment: 'default',
      activeTools: [],
      elapsedSeconds: 0,
    };

    await this.state.storage.put('session', data);
    this.sessionData = data;

    return Response.json({ status: 'initialized' });
  }

  /** Upgrade HTTP to WebSocket using Hibernation API */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const role = url.searchParams.get('role') as 'patient' | 'provider' | null;
    const displayName = url.searchParams.get('name') ?? 'Unknown';

    if (!userId || !role) {
      return new Response('Missing userId or role', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Tag the WebSocket with user info for identification after hibernation
    this.state.acceptWebSocket(server, [
      `${USER_ID_TAG}:${userId}`,
      `${ROLE_TAG}:${role}`,
      `${NAME_TAG}:${displayName}`,
    ]);

    // Send current state to the new connection
    await this.loadSessionData();
    if (this.sessionData) {
      server.send(JSON.stringify({
        type: 'state_changed',
        state: this.sessionData.state,
        changedBy: 'system',
      } satisfies ServerMessage));

      // Send current participants
      server.send(JSON.stringify({
        type: 'participants',
        participants: this.getConnectedParticipants(),
      } satisfies ServerMessage));
    }

    // Broadcast join event
    this.broadcast({
      type: 'participant_joined',
      participant: {
        userId,
        role,
        displayName,
        joinedAt: new Date().toISOString(),
        isMuted: false,
        isCameraOff: false,
      },
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  /** WebSocket Hibernation API: called when a message arrives */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;

    await this.loadSessionData();
    if (!this.sessionData) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session not initialized' } satisfies ServerMessage));
      return;
    }

    const userId = this.getTag(ws, USER_ID_TAG);
    const role = this.getTag(ws, ROLE_TAG) as 'patient' | 'provider';
    const displayName = this.getTag(ws, NAME_TAG) ?? 'Unknown';

    let msg: ClientMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' } satisfies ServerMessage));
      return;
    }

    switch (msg.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' } satisfies ServerMessage));
        break;

      case 'state_change':
        await this.handleStateChange(msg.state, userId, role);
        break;

      case 'environment_change':
        if (role !== 'provider') {
          ws.send(JSON.stringify({ type: 'error', message: 'Only providers can change environment' } satisfies ServerMessage));
          return;
        }
        this.sessionData.environment = msg.preset;
        await this.saveSessionData();
        this.broadcast({
          type: 'environment_changed',
          preset: msg.preset,
          customUrl: msg.customUrl,
        });
        break;

      case 'tool_activate':
        if (role !== 'provider') {
          ws.send(JSON.stringify({ type: 'error', message: 'Only providers can activate tools' } satisfies ServerMessage));
          return;
        }
        this.sessionData.activeTools.push({ toolId: msg.toolId, config: msg.config });
        await this.saveSessionData();
        this.broadcast({ type: 'tool_activated', toolId: msg.toolId, config: msg.config });
        break;

      case 'tool_deactivate':
        if (role !== 'provider') {
          ws.send(JSON.stringify({ type: 'error', message: 'Only providers can deactivate tools' } satisfies ServerMessage));
          return;
        }
        this.sessionData.activeTools = this.sessionData.activeTools.filter(t => t.toolId !== msg.toolId);
        await this.saveSessionData();
        this.broadcast({ type: 'tool_deactivated', toolId: msg.toolId });
        break;

      case 'chat':
        this.broadcast({
          type: 'chat',
          senderId: userId,
          senderName: displayName,
          content: msg.content,
          timestamp: new Date().toISOString(),
        });
        break;

      case 'media_state':
        // Update participant's media state — just re-broadcast participant list
        this.broadcast({
          type: 'participants',
          participants: this.getConnectedParticipants(),
        });
        break;
    }
  }

  /** WebSocket Hibernation API: called when a connection closes */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const userId = this.getTag(ws, USER_ID_TAG);

    this.broadcast({
      type: 'participant_left',
      userId: userId ?? 'unknown',
    });

    // Check if we should auto-pause
    await this.loadSessionData();
    if (this.sessionData) {
      const connected = this.state.getWebSockets().length;
      if (shouldAutoPause(this.sessionData.state, connected)) {
        this.sessionData.state = 'paused';
        this.pausedAt = Date.now();
        await this.saveSessionData();
        this.stopTimer();

        // Schedule auto-end check after 5 minutes
        this.state.storage.setAlarm(Date.now() + 5 * 60 * 1000);
      }
    }
  }

  /** WebSocket Hibernation API: called on unexpected errors */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
    ws.close(1011, 'Internal error');
  }

  /** Alarm handler for auto-end after prolonged disconnect */
  async alarm(): Promise<void> {
    await this.loadSessionData();
    if (!this.sessionData || this.sessionData.state !== 'paused') return;

    const connected = this.state.getWebSockets().length;
    if (connected === 0) {
      // No one reconnected — auto-end the session
      await this.endSession('system');
    }
  }

  // --- Private helpers ---

  private async handleStateChange(
    targetState: SessionState,
    userId: string,
    role: 'patient' | 'provider',
  ): Promise<void> {
    if (!this.sessionData) return;

    const result = tryTransition(this.sessionData.state, targetState, role);
    if (!result.success) {
      // Send error only to the requesting socket
      const sockets = this.state.getWebSockets(`${USER_ID_TAG}:${userId}`);
      for (const ws of sockets) {
        ws.send(JSON.stringify({ type: 'error', message: result.error } satisfies ServerMessage));
      }
      return;
    }

    this.sessionData.state = targetState;

    if (targetState === 'active' && !this.sessionData.startedAt) {
      this.sessionData.startedAt = new Date().toISOString();
      this.startTimer();
    } else if (targetState === 'active') {
      // Resuming from pause
      this.startTimer();
      this.pausedAt = null;
    } else if (targetState === 'paused') {
      this.stopTimer();
      this.pausedAt = Date.now();
    } else if (targetState === 'ended') {
      await this.endSession(userId);
      return;
    }

    await this.saveSessionData();
    this.broadcast({ type: 'state_changed', state: targetState, changedBy: userId });
  }

  private async endSession(endedBy: string): Promise<void> {
    if (!this.sessionData) return;

    this.sessionData.state = 'ended';
    this.sessionData.endedAt = new Date().toISOString();
    this.stopTimer();
    await this.saveSessionData();

    // Persist to D1
    try {
      const db = createDb(this.env.DB);
      await db.update(telehealthSessions)
        .set({
          endedAt: this.sessionData.endedAt,
        })
        .where(eq(telehealthSessions.appointmentId, this.sessionData.appointmentId));
    } catch (err) {
      console.error('Failed to persist session end to D1:', err);
    }

    // Notify all participants
    this.broadcast({ type: 'state_changed', state: 'ended', changedBy: endedBy });

    // Close all WebSockets
    for (const ws of this.state.getWebSockets()) {
      ws.close(1000, 'Session ended');
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      if (this.sessionData) {
        this.sessionData.elapsedSeconds++;
        // Broadcast timer every 30 seconds
        if (this.sessionData.elapsedSeconds % 30 === 0) {
          this.broadcast({ type: 'timer', elapsedSeconds: this.sessionData.elapsedSeconds });
          // Persist to storage periodically
          this.saveSessionData();
        }
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private broadcast(message: ServerMessage, exclude?: WebSocket): void {
    const data = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      if (ws !== exclude) {
        try {
          ws.send(data);
        } catch {
          // Socket may have closed between check and send
        }
      }
    }
  }

  private getConnectedParticipants(): Participant[] {
    return this.state.getWebSockets().map(ws => ({
      userId: this.getTag(ws, USER_ID_TAG) ?? 'unknown',
      role: (this.getTag(ws, ROLE_TAG) ?? 'patient') as 'patient' | 'provider',
      displayName: this.getTag(ws, NAME_TAG) ?? 'Unknown',
      joinedAt: new Date().toISOString(),
      isMuted: false,
      isCameraOff: false,
    }));
  }

  private getTag(ws: WebSocket, prefix: string): string | undefined {
    const tags = this.state.getTags(ws);
    const tag = tags.find(t => t.startsWith(`${prefix}:`));
    return tag?.slice(prefix.length + 1);
  }

  private async loadSessionData(): Promise<void> {
    if (!this.sessionData) {
      this.sessionData = await this.state.storage.get<SessionData>('session') ?? null;
    }
  }

  private async saveSessionData(): Promise<void> {
    if (this.sessionData) {
      await this.state.storage.put('session', this.sessionData);
    }
  }
}
```

- [ ] **Step 2: Update index.ts with worker entrypoint**

```typescript
// workers/session-coordinator/src/index.ts

import type { Env } from './env';

// Re-export the Durable Object class so Cloudflare runtime can find it
export { SessionCoordinator } from './session-do';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route: /session/:id/* → forward to Durable Object
    const match = url.pathname.match(/^\/session\/([^/]+)(\/.*)?$/);
    if (!match) {
      return new Response('Not found', { status: 404 });
    }

    const sessionId = match[1];
    const subPath = match[2] ?? '/status';

    // Get the DO instance using the session ID as the name
    const doId = env.SESSION_COORDINATOR.idFromName(sessionId);
    const stub = env.SESSION_COORDINATOR.get(doId);

    // Forward the request to the DO, rewriting the path
    const doUrl = new URL(request.url);
    doUrl.pathname = subPath;

    return stub.fetch(new Request(doUrl.toString(), request));
  },
};
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm install && pnpm turbo typecheck --filter=@phren/session-coordinator`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add workers/session-coordinator/
git commit -m "feat(session-coordinator): implement Durable Object with WebSocket hibernation and session lifecycle"
```

---

### Task 7: API Worker — Session Routes

**Files:**
- Create: `workers/api/src/routes/sessions.ts`
- Modify: `workers/api/src/index.ts`

**Context:** The API Worker needs new routes for session management. These routes:
1. Create a LiveKit room and generate participant tokens using `livekit-server-sdk`
2. Wake the Session Coordinator DO and initialize it
3. Return connection info (LiveKit token + DO WebSocket URL) to the client

We need to add `livekit-server-sdk` to the API worker's dependencies.

- [ ] **Step 1: Add livekit-server-sdk dependency**

Run: `cd workers/api && pnpm add livekit-server-sdk`

- [ ] **Step 2: Create session routes**

```typescript
// workers/api/src/routes/sessions.ts

import { Hono } from 'hono';
import { AccessToken } from 'livekit-server-sdk';
import { createDb, telehealthSessions, appointments } from '@phren/db';
import { createTelehealthSession, getSessionByAppointment } from '@phren/db';
import { generateUlid } from '@phren/core';
import { eq, and, or } from 'drizzle-orm';
import type { Env } from '../env';

export const sessionRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/sessions/join
 * Body: { appointmentId: string }
 *
 * Creates or joins a telehealth session:
 * 1. Validates the appointment exists and user is a participant
 * 2. Creates LiveKit room + telehealth_sessions record if first join
 * 3. Generates a LiveKit participant token
 * 4. Initializes/wakes the Session Coordinator DO
 * 5. Returns token, room name, and DO WebSocket URL
 */
sessionRoutes.post('/join', async (c) => {
  const user = c.get('user' as never) as { id: string; role: string; name: string } | null;
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ appointmentId: string }>();
  if (!body.appointmentId) {
    return c.json({ error: 'appointmentId is required' }, 400);
  }

  const db = createDb(c.env.DB);

  // Validate appointment exists and user is a participant
  const appointment = await db.select()
    .from(appointments)
    .where(eq(appointments.id, body.appointmentId))
    .limit(1);

  if (appointment.length === 0) {
    return c.json({ error: 'Appointment not found' }, 404);
  }

  const appt = appointment[0];

  // Check user is either the patient or provider on this appointment
  const isPatient = appt.patientId === user.id;
  const isProvider = appt.providerId === user.id;
  if (!isPatient && !isProvider) {
    return c.json({ error: 'Not authorized for this appointment' }, 403);
  }

  // Get or create telehealth session
  let session = await getSessionByAppointment(db, body.appointmentId);
  const roomName = session?.livekitRoomName ?? `phren-${body.appointmentId}`;

  if (!session) {
    session = { id: generateUlid(), livekitRoomName: roomName };
    await db.insert(telehealthSessions).values({
      id: session.id,
      appointmentId: body.appointmentId,
      livekitRoomName: roomName,
      startedAt: new Date().toISOString(),
      vrEnabled: false,
    });

    // Initialize the Session Coordinator DO
    const doId = c.env.SESSION_COORDINATOR.idFromName(body.appointmentId);
    const stub = c.env.SESSION_COORDINATOR.get(doId);
    await stub.fetch(new Request('https://do/init', {
      method: 'POST',
      body: JSON.stringify({
        appointmentId: body.appointmentId,
        livekitRoomName: roomName,
      }),
    }));
  }

  // Generate LiveKit participant token
  const participantRole = isProvider ? 'provider' : 'patient';
  const participantIdentity = `${participantRole}-${user.id}`;

  const token = new AccessToken(c.env.LIVEKIT_API_KEY, c.env.LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: user.name,
    metadata: JSON.stringify({ role: participantRole, userId: user.id }),
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await token.toJwt();

  return c.json({
    token: jwt,
    roomName,
    livekitUrl: c.env.LIVEKIT_URL,
    sessionId: session.id,
    doWebSocketUrl: `wss://session-coordinator.phrentech.com/session/${body.appointmentId}/ws?userId=${user.id}&role=${participantRole}&name=${encodeURIComponent(user.name)}`,
  });
});

/**
 * GET /api/sessions/:appointmentId/status
 * Returns current session state from the DO
 */
sessionRoutes.get('/:appointmentId/status', async (c) => {
  const user = c.get('user' as never) as { id: string } | null;
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const appointmentId = c.req.param('appointmentId');
  const doId = c.env.SESSION_COORDINATOR.idFromName(appointmentId);
  const stub = c.env.SESSION_COORDINATOR.get(doId);

  const response = await stub.fetch(new Request('https://do/status'));
  const status = await response.json();

  return c.json(status);
});

/**
 * POST /api/sessions/:appointmentId/notes
 * Body: { content: string }
 * Creates a session note (provider only)
 */
sessionRoutes.post('/:appointmentId/notes', async (c) => {
  const user = c.get('user' as never) as { id: string; role: string } | null;
  if (!user || user.role !== 'provider') {
    return c.json({ error: 'Only providers can create session notes' }, 403);
  }

  const appointmentId = c.req.param('appointmentId');
  const body = await c.req.json<{ content: string }>();

  if (!body.content?.trim()) {
    return c.json({ error: 'Content is required' }, 400);
  }

  const db = createDb(c.env.DB);

  // Find the session for this appointment
  const session = await getSessionByAppointment(db, appointmentId);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const { createSessionNote } = await import('@phren/db');
  const note = await createSessionNote(db, {
    sessionId: session.id,
    providerId: user.id,
    content: body.content,
  });

  return c.json({ id: note.id }, 201);
});
```

- [ ] **Step 3: Register session routes in the API Worker**

In `workers/api/src/index.ts`, add the import and route registration:

```typescript
// Add import at top:
import { sessionRoutes } from './routes/sessions';

// Add route registration after existing routes:
app.route('/api/sessions', sessionRoutes);
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck --filter=@phren/api`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add workers/api/src/routes/sessions.ts workers/api/src/index.ts workers/api/package.json
git commit -m "feat(api): add session join, status, and notes routes with LiveKit token generation"
```

---

### Task 8: Motion Capture Pipeline — Web Worker

**Files:**
- Create: `packages/realtime/src/motion/worker.ts`
- Create: `packages/realtime/src/motion/capture.ts`

**Context:** The MediaPipe Web Worker runs FaceLandmarker, PoseLandmarker, and HandLandmarker on the provider's webcam frames. The main thread sends `ImageBitmap` frames to the worker, which processes them and posts back solver results. The `capture.ts` module orchestrates: it grabs frames from the video track, sends them to the worker, combines solver outputs into a `MotionFrame`, encodes it, and sends it via the LiveKit data channel.

**Important:** The Web Worker uses `@mediapipe/tasks-vision` which requires WASM files to be loaded. In production these are served from R2 or a CDN. The worker auto-detects performance and downgrades to face-only if FPS drops below 15.

- [ ] **Step 1: Add @mediapipe/tasks-vision dependency**

Run: `cd packages/realtime && pnpm add @mediapipe/tasks-vision`

- [ ] **Step 2: Create the Web Worker**

```typescript
// packages/realtime/src/motion/worker.ts

/// <reference lib="webworker" />

import {
  FaceLandmarker,
  PoseLandmarker,
  HandLandmarker,
  FilesetResolver,
} from '@mediapipe/tasks-vision';
import type { WorkerMessage, FaceLandmarkerResult, PoseLandmarkerResult, HandLandmarkerResult } from './types';

let faceLandmarker: FaceLandmarker | null = null;
let poseLandmarker: PoseLandmarker | null = null;
let handLandmarker: HandLandmarker | null = null;
let faceOnly = false;

// Performance monitoring
const PERF_WINDOW = 30; // frames
const frameTimes: number[] = [];

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'init':
      await initializeTasks(msg.wasmPath, msg.modelPaths);
      break;

    case 'process_frame':
      await processFrame(msg.imageData, msg.timestamp);
      break;
  }
};

async function initializeTasks(
  wasmPath: string,
  modelPaths: { face: string; pose: string; hand: string },
): Promise<void> {
  try {
    const vision = await FilesetResolver.forVisionTasks(wasmPath);

    // Initialize all three tasks in parallel
    const [face, pose, hand] = await Promise.all([
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPaths.face },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      }),
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPaths.pose },
        runningMode: 'VIDEO',
        numPoses: 1,
      }),
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPaths.hand },
        runningMode: 'VIDEO',
        numHands: 2,
      }),
    ]);

    faceLandmarker = face;
    poseLandmarker = pose;
    handLandmarker = hand;

    self.postMessage({ type: 'init_complete' } satisfies WorkerMessage);
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: `MediaPipe init failed: ${err instanceof Error ? err.message : String(err)}`,
    } satisfies WorkerMessage);
  }
}

async function processFrame(imageBitmap: ImageBitmap, timestamp: number): Promise<void> {
  const start = performance.now();

  let faceResult: FaceLandmarkerResult | null = null;
  let poseResult: PoseLandmarkerResult | null = null;
  let handResult: HandLandmarkerResult | null = null;

  try {
    // Always run face (lightest, most important for avatar expressiveness)
    if (faceLandmarker) {
      const raw = faceLandmarker.detectForVideo(imageBitmap, timestamp);
      faceResult = {
        faceLandmarks: raw.faceLandmarks ?? [],
        faceBlendshapes: raw.faceBlendshapes?.map(bs => ({
          categories: bs.categories.map(c => ({
            categoryName: c.categoryName,
            score: c.score,
          })),
        })),
      };
    }

    // Run pose and hands only if not in face-only fallback mode
    if (!faceOnly) {
      if (poseLandmarker) {
        const raw = poseLandmarker.detectForVideo(imageBitmap, timestamp);
        poseResult = {
          landmarks: raw.landmarks ?? [],
          worldLandmarks: raw.worldLandmarks ?? [],
        };
      }

      if (handLandmarker) {
        const raw = handLandmarker.detectForVideo(imageBitmap, timestamp);
        handResult = {
          landmarks: raw.landmarks ?? [],
          worldLandmarks: raw.worldLandmarks ?? [],
          handedness: raw.handedness ?? [],
        };
      }
    }
  } catch (err) {
    console.error('Frame processing error:', err);
  }

  const processingTimeMs = performance.now() - start;
  imageBitmap.close(); // Free memory

  // Track performance
  frameTimes.push(processingTimeMs);
  if (frameTimes.length > PERF_WINDOW) {
    frameTimes.shift();
  }

  // Check if we need to downgrade
  if (frameTimes.length >= PERF_WINDOW && !faceOnly) {
    const avgTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const estimatedFps = 1000 / avgTime;

    if (estimatedFps < 15) {
      faceOnly = true;
      self.postMessage({
        type: 'performance_warning',
        fps: estimatedFps,
        recommendation: 'downgrade_to_face_only',
      } satisfies WorkerMessage);
    }
  }

  self.postMessage({
    type: 'frame_result',
    timestamp,
    face: faceResult,
    pose: poseResult,
    hands: handResult,
    processingTimeMs,
  } satisfies WorkerMessage);
}
```

- [ ] **Step 3: Create the capture orchestrator**

```typescript
// packages/realtime/src/motion/capture.ts

import type { WorkerMessage, FaceLandmarkerResult, PoseLandmarkerResult, HandLandmarkerResult } from './types';
import type { MotionFrame } from '../types';
import { solveFace } from './face-solver';
import { solvePose } from './pose-solver';
import { solveHands } from './hand-solver';
import { buildMotionFrame } from './frame-encoder';
import { encodeMotionFrame } from '../data-channel';

export interface CaptureConfig {
  /** URL to MediaPipe WASM files directory */
  wasmPath: string;
  /** Paths to model files */
  modelPaths: {
    face: string;
    pose: string;
    hand: string;
  };
  /** Target capture FPS (default: 30) */
  targetFps?: number;
  /** Callback when a motion frame is ready to send */
  onFrame: (encoded: Uint8Array) => void;
  /** Callback when performance degrades */
  onPerformanceWarning?: (fps: number) => void;
  /** Callback for errors */
  onError?: (message: string) => void;
}

/**
 * Orchestrates the motion capture pipeline:
 * 1. Grabs frames from a MediaStream video track
 * 2. Sends them to the MediaPipe Web Worker
 * 3. Receives landmarks back
 * 4. Runs solvers to produce a MotionFrame
 * 5. Encodes and calls onFrame callback
 */
export class MotionCapture {
  private worker: Worker | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: OffscreenCanvas | null = null;
  private captureInterval: ReturnType<typeof setInterval> | null = null;
  private config: CaptureConfig;
  private isRunning = false;
  private isInitialized = false;

  constructor(config: CaptureConfig) {
    this.config = config;
  }

  /** Initialize the Web Worker and MediaPipe tasks */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create the worker — the bundler must be configured to handle this
      this.worker = new Worker(
        new URL('./worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const msg = event.data;

        switch (msg.type) {
          case 'init_complete':
            this.isInitialized = true;
            resolve();
            break;

          case 'frame_result':
            this.handleFrameResult(msg.timestamp, msg.face, msg.pose, msg.hands);
            break;

          case 'performance_warning':
            this.config.onPerformanceWarning?.(msg.fps);
            break;

          case 'error':
            this.config.onError?.(msg.message);
            if (!this.isInitialized) {
              reject(new Error(msg.message));
            }
            break;
        }
      };

      this.worker.postMessage({
        type: 'init',
        wasmPath: this.config.wasmPath,
        modelPaths: this.config.modelPaths,
      } satisfies WorkerMessage);
    });
  }

  /** Start capturing frames from the given MediaStream */
  start(mediaStream: MediaStream): void {
    if (!this.isInitialized || !this.worker) {
      throw new Error('MotionCapture not initialized. Call initialize() first.');
    }

    if (this.isRunning) return;
    this.isRunning = true;

    // Create a hidden video element to feed the MediaStream
    this.videoElement = document.createElement('video');
    this.videoElement.srcObject = mediaStream;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    this.videoElement.play();

    const targetFps = this.config.targetFps ?? 30;
    const intervalMs = Math.round(1000 / targetFps);

    this.captureInterval = setInterval(() => {
      this.captureFrame();
    }, intervalMs);
  }

  /** Stop capturing frames */
  stop(): void {
    this.isRunning = false;

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  /** Terminate the worker and clean up */
  destroy(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    this.isInitialized = false;
  }

  private captureFrame(): void {
    if (!this.videoElement || !this.worker || !this.isRunning) return;
    if (this.videoElement.readyState < 2) return; // Not enough data

    // Use createImageBitmap for efficient transfer to worker
    createImageBitmap(this.videoElement).then(bitmap => {
      this.worker?.postMessage(
        {
          type: 'process_frame',
          imageData: bitmap,
          timestamp: performance.now(),
        } satisfies WorkerMessage,
        [bitmap], // Transfer ownership to worker
      );
    });
  }

  private handleFrameResult(
    timestamp: number,
    face: FaceLandmarkerResult | null,
    pose: PoseLandmarkerResult | null,
    hands: HandLandmarkerResult | null,
  ): void {
    // Run solvers
    const faceSolved = face ? solveFace(face) : null;
    const poseSolved = pose ? solvePose(pose) : null;
    const [leftHand, rightHand] = hands
      ? solveHands(hands as any)
      : [null, null];

    // Build and encode the motion frame
    const frame = buildMotionFrame(timestamp, faceSolved, poseSolved, leftHand, rightHand);
    const encoded = encodeMotionFrame(frame);

    this.config.onFrame(encoded);
  }
}
```

- [ ] **Step 4: Update barrel export with capture**

Add to `packages/realtime/src/index.ts`:

```typescript
// Motion capture pipeline (browser-only)
export { MotionCapture, type CaptureConfig } from './motion/capture';
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm turbo typecheck --filter=@phren/realtime`
Expected: PASS (or minor DOM type issues to resolve)

- [ ] **Step 6: Commit**

```bash
git add packages/realtime/src/motion/worker.ts packages/realtime/src/motion/capture.ts packages/realtime/src/index.ts packages/realtime/package.json
git commit -m "feat(realtime): add MediaPipe Web Worker and motion capture orchestrator"
```

---

### Task 9: Session App — Svelte Store and Route

**Files:**
- Create: `apps/session/src/lib/stores/session.ts`
- Create: `apps/session/src/routes/[appointmentId]/+page.server.ts`
- Create: `apps/session/src/routes/[appointmentId]/+page.svelte`

**Context:** The session app needs a Svelte store to manage connection state, and a dynamic route for the actual session page. The store wraps `PhrenRoom` (LiveKit) and the DO WebSocket connection. The page loads appointment data server-side and renders the video grid + controls client-side.

- [ ] **Step 1: Create the session store**

```typescript
// apps/session/src/lib/stores/session.ts

import { writable, derived, get } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type {
  SessionState,
  ParticipantInfo,
  SessionEvent,
  LiveKitConfig,
} from '@phren/realtime';
import { PhrenRoom } from '@phren/realtime';

export interface SessionStore {
  /** Current session state */
  state: SessionState;
  /** Connected participants */
  participants: ParticipantInfo[];
  /** LiveKit connection status */
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  /** Elapsed session time in seconds */
  elapsedSeconds: number;
  /** Current VR environment */
  environment: string;
  /** Active therapeutic tools */
  activeTools: Array<{ toolId: string; config: Record<string, unknown> }>;
  /** Chat messages */
  chatMessages: Array<{ senderId: string; senderName: string; content: string; timestamp: string }>;
  /** Error messages */
  error: string | null;
  /** Whether local mic is muted */
  isMuted: boolean;
  /** Whether local camera is off */
  isCameraOff: boolean;
}

const initialState: SessionStore = {
  state: 'waiting',
  participants: [],
  connectionStatus: 'disconnected',
  elapsedSeconds: 0,
  environment: 'default',
  activeTools: [],
  chatMessages: [],
  error: null,
  isMuted: false,
  isCameraOff: false,
};

function createSessionStore() {
  const store: Writable<SessionStore> = writable({ ...initialState });
  let phrenRoom: PhrenRoom | null = null;
  let doWebSocket: WebSocket | null = null;
  let doReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let doReconnectAttempts = 0;

  /** Connect to both LiveKit and the Session Coordinator DO */
  async function connect(
    livekitConfig: LiveKitConfig,
    doWebSocketUrl: string,
  ): Promise<void> {
    store.update(s => ({ ...s, connectionStatus: 'connecting', error: null }));

    try {
      // Connect LiveKit
      phrenRoom = new PhrenRoom(livekitConfig, {
        onParticipantConnected: () => updateParticipants(),
        onParticipantDisconnected: () => updateParticipants(),
        onDisconnected: () => {
          store.update(s => ({ ...s, connectionStatus: 'disconnected' }));
        },
        onReconnecting: () => {
          store.update(s => ({ ...s, connectionStatus: 'reconnecting' }));
        },
        onReconnected: () => {
          store.update(s => ({ ...s, connectionStatus: 'connected' }));
        },
      });

      await phrenRoom.connect();
      await phrenRoom.enableMedia(true, true);

      // Connect DO WebSocket
      connectDOWebSocket(doWebSocketUrl);

      store.update(s => ({ ...s, connectionStatus: 'connected' }));
    } catch (err) {
      store.update(s => ({
        ...s,
        connectionStatus: 'disconnected',
        error: err instanceof Error ? err.message : 'Connection failed',
      }));
      throw err;
    }
  }

  function connectDOWebSocket(url: string): void {
    doWebSocket = new WebSocket(url);

    doWebSocket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as SessionEvent;
        handleDOMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    doWebSocket.onclose = () => {
      // Exponential backoff reconnect
      if (doReconnectAttempts < 10) {
        const delay = Math.min(1000 * Math.pow(2, doReconnectAttempts), 30000);
        doReconnectTimer = setTimeout(() => {
          doReconnectAttempts++;
          connectDOWebSocket(url);
        }, delay);
      }
    };

    doWebSocket.onopen = () => {
      doReconnectAttempts = 0;
    };
  }

  function handleDOMessage(msg: SessionEvent): void {
    switch (msg.type) {
      case 'state_changed':
        store.update(s => ({ ...s, state: msg.state }));
        break;
      case 'participants':
        store.update(s => ({ ...s, participants: msg.participants }));
        break;
      case 'environment_changed':
        store.update(s => ({ ...s, environment: msg.preset }));
        break;
      case 'tool_activated':
        store.update(s => ({
          ...s,
          activeTools: [...s.activeTools, { toolId: msg.toolId, config: msg.config }],
        }));
        break;
      case 'tool_deactivated':
        store.update(s => ({
          ...s,
          activeTools: s.activeTools.filter(t => t.toolId !== msg.toolId),
        }));
        break;
      case 'chat':
        store.update(s => ({
          ...s,
          chatMessages: [...s.chatMessages, {
            senderId: msg.senderId,
            senderName: msg.senderName,
            content: msg.content,
            timestamp: msg.timestamp,
          }],
        }));
        break;
      case 'timer':
        store.update(s => ({ ...s, elapsedSeconds: msg.elapsedSeconds }));
        break;
      case 'error':
        store.update(s => ({ ...s, error: msg.message }));
        break;
    }
  }

  function updateParticipants(): void {
    // LiveKit participants — merged with DO participant data
    if (!phrenRoom) return;
    // Participant info comes from DO messages, not LiveKit directly
  }

  /** Toggle microphone */
  async function toggleMute(): Promise<void> {
    if (!phrenRoom) return;
    const isMuted = !(await phrenRoom.toggleMicrophone());
    store.update(s => ({ ...s, isMuted: !isMuted }));
  }

  /** Toggle camera */
  async function toggleCamera(): Promise<void> {
    if (!phrenRoom) return;
    const isCameraOn = await phrenRoom.toggleCamera();
    store.update(s => ({ ...s, isCameraOff: !isCameraOn }));
  }

  /** Send a chat message via DO WebSocket */
  function sendChat(content: string): void {
    doWebSocket?.send(JSON.stringify({ type: 'chat', content }));
  }

  /** Request session state change via DO WebSocket */
  function requestStateChange(state: SessionState): void {
    doWebSocket?.send(JSON.stringify({ type: 'state_change', state }));
  }

  /** Get the PhrenRoom instance (for motion capture integration) */
  function getRoom(): PhrenRoom | null {
    return phrenRoom;
  }

  /** Disconnect everything */
  async function disconnect(): Promise<void> {
    if (doReconnectTimer) clearTimeout(doReconnectTimer);
    doWebSocket?.close();
    doWebSocket = null;
    await phrenRoom?.disconnect();
    phrenRoom = null;
    store.set({ ...initialState });
  }

  return {
    subscribe: store.subscribe,
    connect,
    disconnect,
    toggleMute,
    toggleCamera,
    sendChat,
    requestStateChange,
    getRoom,
  };
}

export const sessionStore = createSessionStore();
```

- [ ] **Step 2: Create the page server load function**

```typescript
// apps/session/src/routes/[appointmentId]/+page.server.ts

import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals, platform, fetch }) => {
  if (!locals.user) {
    redirect(302, '/');
  }

  // Call the API to join the session and get tokens
  const response = await fetch(`${platform?.env?.API_URL ?? 'https://api.phrentech.com'}/api/sessions/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appointmentId: params.appointmentId }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    error(response.status, data.error ?? 'Failed to join session');
  }

  const sessionInfo = await response.json();

  return {
    appointmentId: params.appointmentId,
    token: sessionInfo.token,
    roomName: sessionInfo.roomName,
    livekitUrl: sessionInfo.livekitUrl,
    sessionId: sessionInfo.sessionId,
    doWebSocketUrl: sessionInfo.doWebSocketUrl,
    user: locals.user,
  };
};
```

- [ ] **Step 3: Create the session page component**

```svelte
<!-- apps/session/src/routes/[appointmentId]/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { sessionStore } from '$lib/stores/session';

  export let data;

  let videoContainer: HTMLDivElement;

  onMount(async () => {
    try {
      await sessionStore.connect(
        {
          url: data.livekitUrl,
          token: data.token,
          roomName: data.roomName,
        },
        data.doWebSocketUrl,
      );
    } catch (err) {
      console.error('Failed to connect:', err);
    }
  });

  onDestroy(() => {
    sessionStore.disconnect();
  });

  function handleEndSession() {
    if (confirm('Are you sure you want to end this session?')) {
      sessionStore.requestStateChange('ended');
    }
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
</script>

<div class="session-container">
  <header class="session-header">
    <div class="session-info">
      <span class="session-state state-{$sessionStore.state}">{$sessionStore.state}</span>
      <span class="session-timer">{formatTime($sessionStore.elapsedSeconds)}</span>
    </div>
    {#if $sessionStore.connectionStatus !== 'connected'}
      <div class="connection-banner {$sessionStore.connectionStatus}">
        {$sessionStore.connectionStatus === 'connecting' ? 'Connecting...' :
         $sessionStore.connectionStatus === 'reconnecting' ? 'Reconnecting...' :
         'Disconnected'}
      </div>
    {/if}
  </header>

  <main class="video-area" bind:this={videoContainer}>
    <div class="video-grid">
      <!-- Video tiles will be rendered here by LiveKit track subscriptions -->
      <div class="video-tile local">
        <p>Your camera</p>
      </div>
      <div class="video-tile remote">
        <p>Waiting for other participant...</p>
      </div>
    </div>
  </main>

  <footer class="controls-bar">
    <button
      class="control-btn"
      class:active={!$sessionStore.isMuted}
      on:click={() => sessionStore.toggleMute()}
    >
      {$sessionStore.isMuted ? '🔇 Unmute' : '🎤 Mute'}
    </button>

    <button
      class="control-btn"
      class:active={!$sessionStore.isCameraOff}
      on:click={() => sessionStore.toggleCamera()}
    >
      {$sessionStore.isCameraOff ? '📷 Camera On' : '📹 Camera Off'}
    </button>

    <button class="control-btn end" on:click={handleEndSession}>
      End Session
    </button>
  </footer>

  {#if $sessionStore.error}
    <div class="error-toast">{$sessionStore.error}</div>
  {/if}
</div>

<style>
  .session-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #1a1a2e;
    color: white;
  }

  .session-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: #16213e;
  }

  .session-info {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .session-state {
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .state-waiting { background: #f59e0b; color: #000; }
  .state-active { background: #10b981; color: #000; }
  .state-paused { background: #6366f1; }
  .state-ended { background: #ef4444; }

  .session-timer {
    font-family: monospace;
    font-size: 1.125rem;
  }

  .connection-banner {
    padding: 0.25rem 0.75rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .connection-banner.connecting { background: #f59e0b; color: #000; }
  .connection-banner.reconnecting { background: #f59e0b; color: #000; }
  .connection-banner.disconnected { background: #ef4444; }

  .video-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .video-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    width: 100%;
    max-width: 1200px;
    aspect-ratio: 16/9;
  }

  .video-tile {
    background: #0f3460;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 16/9;
  }

  .controls-bar {
    display: flex;
    justify-content: center;
    gap: 1rem;
    padding: 1rem;
    background: #16213e;
  }

  .control-btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 2rem;
    cursor: pointer;
    font-size: 0.875rem;
    background: #334155;
    color: white;
    transition: background 0.2s;
  }

  .control-btn:hover { background: #475569; }
  .control-btn.active { background: #10b981; }
  .control-btn.end { background: #ef4444; }
  .control-btn.end:hover { background: #dc2626; }

  .error-toast {
    position: fixed;
    bottom: 5rem;
    left: 50%;
    transform: translateX(-50%);
    background: #ef4444;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    z-index: 100;
  }
</style>
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck --filter=@phren/session`
Expected: PASS (may need to add `@phren/realtime` dependency to session app)

- [ ] **Step 5: Commit**

```bash
git add apps/session/src/
git commit -m "feat(session-app): add session store, route, and video UI for telehealth sessions"
```

---

### Task 10: Session App — Video Grid and Controls Components

**Files:**
- Create: `apps/session/src/lib/components/VideoGrid.svelte`
- Create: `apps/session/src/lib/components/SessionControls.svelte`
- Create: `apps/session/src/lib/components/ConnectionStatus.svelte`

**Context:** These components handle the actual LiveKit video rendering. `VideoGrid` manages attaching/detaching remote video tracks to DOM elements. `SessionControls` provides the mute/camera/screenshare/end-session controls. `ConnectionStatus` shows connection quality.

- [ ] **Step 1: Create VideoGrid component**

```svelte
<!-- apps/session/src/lib/components/VideoGrid.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { sessionStore } from '$lib/stores/session';
  import {
    Track,
    type RemoteTrackPublication,
    type RemoteParticipant,
  } from 'livekit-client';

  let localVideoEl: HTMLVideoElement;
  let remoteVideoEl: HTMLVideoElement;
  let remoteParticipant: RemoteParticipant | null = null;

  function attachTrack(track: Track, element: HTMLVideoElement): void {
    const mediaTrack = track.mediaStreamTrack;
    if (element && mediaTrack) {
      element.srcObject = new MediaStream([mediaTrack]);
    }
  }

  function detachTrack(element: HTMLVideoElement): void {
    if (element) {
      element.srcObject = null;
    }
  }

  onMount(() => {
    const room = sessionStore.getRoom();
    if (!room) return;

    // Attach local video
    const nativeRoom = room.nativeRoom;
    const localVideoTrack = nativeRoom.localParticipant.getTrackPublication(Track.Source.Camera);
    if (localVideoTrack?.track) {
      attachTrack(localVideoTrack.track, localVideoEl);
    }

    // Handle remote participant tracks
    nativeRoom.on('trackSubscribed', (track, publication, participant) => {
      if (track.kind === Track.Kind.Video && track.source === Track.Source.Camera) {
        remoteParticipant = participant;
        attachTrack(track, remoteVideoEl);
      }
    });

    nativeRoom.on('trackUnsubscribed', (track) => {
      if (track.kind === Track.Kind.Video) {
        detachTrack(remoteVideoEl);
      }
    });

    // Check for existing remote participant
    for (const [, participant] of nativeRoom.remoteParticipants) {
      const videoTrack = participant.getTrackPublication(Track.Source.Camera);
      if (videoTrack?.track) {
        remoteParticipant = participant;
        attachTrack(videoTrack.track, remoteVideoEl);
      }
    }
  });

  onDestroy(() => {
    detachTrack(localVideoEl);
    detachTrack(remoteVideoEl);
  });
</script>

<div class="video-grid">
  <div class="video-tile local">
    <video bind:this={localVideoEl} autoplay muted playsinline></video>
    <span class="label">You</span>
    {#if $sessionStore.isMuted}
      <span class="muted-indicator">🔇</span>
    {/if}
  </div>

  <div class="video-tile remote">
    {#if remoteParticipant}
      <video bind:this={remoteVideoEl} autoplay playsinline></video>
      <span class="label">{remoteParticipant.name ?? 'Participant'}</span>
    {:else}
      <div class="waiting">
        <p>Waiting for other participant to join...</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .video-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    width: 100%;
    max-width: 1200px;
  }

  .video-tile {
    position: relative;
    background: #0f3460;
    border-radius: 0.75rem;
    overflow: hidden;
    aspect-ratio: 16/9;
  }

  .video-tile video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .label {
    position: absolute;
    bottom: 0.5rem;
    left: 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }

  .muted-indicator {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
  }

  .waiting {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #94a3b8;
  }
</style>
```

- [ ] **Step 2: Create SessionControls component**

```svelte
<!-- apps/session/src/lib/components/SessionControls.svelte -->
<script lang="ts">
  import { sessionStore } from '$lib/stores/session';

  export let userRole: 'patient' | 'provider' = 'patient';

  function handleStartSession() {
    sessionStore.requestStateChange('active');
  }

  function handlePauseSession() {
    sessionStore.requestStateChange('paused');
  }

  function handleResumeSession() {
    sessionStore.requestStateChange('active');
  }

  function handleEndSession() {
    if (confirm('Are you sure you want to end this session?')) {
      sessionStore.requestStateChange('ended');
    }
  }
</script>

<div class="controls">
  <div class="media-controls">
    <button
      class="btn"
      class:muted={$sessionStore.isMuted}
      on:click={() => sessionStore.toggleMute()}
      title={$sessionStore.isMuted ? 'Unmute' : 'Mute'}
    >
      {$sessionStore.isMuted ? '🔇' : '🎤'}
    </button>

    <button
      class="btn"
      class:off={$sessionStore.isCameraOff}
      on:click={() => sessionStore.toggleCamera()}
      title={$sessionStore.isCameraOff ? 'Turn camera on' : 'Turn camera off'}
    >
      {$sessionStore.isCameraOff ? '📷' : '📹'}
    </button>
  </div>

  <div class="session-controls">
    {#if userRole === 'provider'}
      {#if $sessionStore.state === 'waiting'}
        <button class="btn start" on:click={handleStartSession}>
          ▶ Start Session
        </button>
      {/if}

      {#if $sessionStore.state === 'active'}
        <button class="btn pause" on:click={handlePauseSession}>
          ⏸ Pause
        </button>
      {/if}

      {#if $sessionStore.state === 'paused'}
        <button class="btn resume" on:click={handleResumeSession}>
          ▶ Resume
        </button>
      {/if}
    {/if}

    {#if $sessionStore.state !== 'ended' && $sessionStore.state !== 'waiting'}
      <button class="btn end" on:click={handleEndSession}>
        End Session
      </button>
    {/if}
  </div>
</div>

<style>
  .controls {
    display: flex;
    justify-content: center;
    gap: 2rem;
    padding: 0.75rem 1rem;
  }

  .media-controls, .session-controls {
    display: flex;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.625rem 1.25rem;
    border: none;
    border-radius: 2rem;
    cursor: pointer;
    font-size: 0.875rem;
    background: #334155;
    color: white;
    transition: all 0.2s;
  }

  .btn:hover { background: #475569; }
  .btn.muted, .btn.off { background: #dc2626; }
  .btn.start { background: #10b981; color: #000; }
  .btn.pause { background: #f59e0b; color: #000; }
  .btn.resume { background: #10b981; color: #000; }
  .btn.end { background: #ef4444; }
  .btn.end:hover { background: #dc2626; }
</style>
```

- [ ] **Step 3: Create ConnectionStatus component**

```svelte
<!-- apps/session/src/lib/components/ConnectionStatus.svelte -->
<script lang="ts">
  import { sessionStore } from '$lib/stores/session';

  const statusLabels: Record<string, string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
    reconnecting: 'Reconnecting...',
  };

  $: label = statusLabels[$sessionStore.connectionStatus] ?? 'Unknown';
  $: isHealthy = $sessionStore.connectionStatus === 'connected';
</script>

{#if !isHealthy}
  <div class="status-bar {$sessionStore.connectionStatus}">
    <span class="dot"></span>
    <span>{label}</span>
  </div>
{/if}

<style>
  .status-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    animation: pulse 1.5s infinite;
  }

  .connecting { background: #f59e0b33; color: #f59e0b; }
  .connecting .dot { background: #f59e0b; }

  .reconnecting { background: #f59e0b33; color: #f59e0b; }
  .reconnecting .dot { background: #f59e0b; }

  .disconnected { background: #ef444433; color: #ef4444; }
  .disconnected .dot { background: #ef4444; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
```

- [ ] **Step 4: Run build**

Run: `pnpm turbo build --filter=@phren/session`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/session/src/lib/components/
git commit -m "feat(session-app): add VideoGrid, SessionControls, and ConnectionStatus components"
```

---

### Task 11: Integration — Wire Session Components into Page

**Files:**
- Modify: `apps/session/src/routes/[appointmentId]/+page.svelte`
- Modify: `apps/session/package.json` (add @phren/realtime dependency)

**Context:** Replace the placeholder page with the actual components. Also add the `@phren/realtime` dependency to the session app and ensure the session page uses `VideoGrid`, `SessionControls`, and `ConnectionStatus`.

- [ ] **Step 1: Add @phren/realtime dependency to session app**

Run: `cd apps/session && pnpm add @phren/realtime@workspace:*`

- [ ] **Step 2: Update the session page to use components**

Replace the content of `apps/session/src/routes/[appointmentId]/+page.svelte`:

```svelte
<!-- apps/session/src/routes/[appointmentId]/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { sessionStore } from '$lib/stores/session';
  import VideoGrid from '$lib/components/VideoGrid.svelte';
  import SessionControls from '$lib/components/SessionControls.svelte';
  import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';

  export let data;

  $: userRole = data.user?.role === 'provider' ? 'provider' : 'patient';

  onMount(async () => {
    try {
      await sessionStore.connect(
        {
          url: data.livekitUrl,
          token: data.token,
          roomName: data.roomName,
        },
        data.doWebSocketUrl,
      );
    } catch (err) {
      console.error('Failed to connect to session:', err);
    }
  });

  onDestroy(() => {
    sessionStore.disconnect();
  });

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
</script>

<svelte:head>
  <title>Phren Session</title>
</svelte:head>

<div class="session-container">
  <header class="session-header">
    <div class="session-info">
      <span class="session-state state-{$sessionStore.state}">
        {$sessionStore.state}
      </span>
      <span class="session-timer">
        {formatTime($sessionStore.elapsedSeconds)}
      </span>
      <span class="participant-count">
        {$sessionStore.participants.length} participant{$sessionStore.participants.length !== 1 ? 's' : ''}
      </span>
    </div>
    <ConnectionStatus />
  </header>

  <main class="video-area">
    <VideoGrid />
  </main>

  <footer class="controls-bar">
    <SessionControls {userRole} />
  </footer>

  {#if $sessionStore.error}
    <div class="error-toast" role="alert">
      {$sessionStore.error}
    </div>
  {/if}

  {#if $sessionStore.state === 'ended'}
    <div class="session-ended-overlay">
      <div class="ended-card">
        <h2>Session Ended</h2>
        <p>Duration: {formatTime($sessionStore.elapsedSeconds)}</p>
        <a href="/" class="btn-home">Return Home</a>
      </div>
    </div>
  {/if}
</div>

<style>
  .session-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #1a1a2e;
    color: white;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .session-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1.5rem;
    background: #16213e;
    border-bottom: 1px solid #1e3a5f;
  }

  .session-info {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .session-state {
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .state-waiting { background: #f59e0b; color: #000; }
  .state-active { background: #10b981; color: #000; }
  .state-paused { background: #6366f1; }
  .state-ended { background: #ef4444; }

  .session-timer {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1rem;
    color: #94a3b8;
  }

  .participant-count {
    font-size: 0.75rem;
    color: #64748b;
  }

  .video-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .controls-bar {
    background: #16213e;
    border-top: 1px solid #1e3a5f;
  }

  .error-toast {
    position: fixed;
    bottom: 6rem;
    left: 50%;
    transform: translateX(-50%);
    background: #ef4444;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    z-index: 100;
    animation: fadeIn 0.3s ease;
  }

  .session-ended-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .ended-card {
    background: #16213e;
    padding: 2rem 3rem;
    border-radius: 1rem;
    text-align: center;
  }

  .ended-card h2 { margin-bottom: 0.5rem; }
  .ended-card p { color: #94a3b8; margin-bottom: 1.5rem; }

  .btn-home {
    display: inline-block;
    padding: 0.75rem 2rem;
    background: #6366f1;
    color: white;
    border-radius: 0.5rem;
    text-decoration: none;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateX(-50%) translateY(1rem); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
```

- [ ] **Step 3: Run full build**

Run: `pnpm turbo build --filter=@phren/session`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/session/src/routes/\[appointmentId\]/ apps/session/package.json
git commit -m "feat(session-app): wire VideoGrid, SessionControls, and ConnectionStatus into session page"
```

---

### Task 12: Update CI/CD and Verify Full Build

**Files:**
- Modify: `.github/workflows/deploy-production.yml` (add session-coordinator worker deploy)
- Modify: `.github/workflows/ci.yml` (ensure new packages are tested)

**Context:** The deploy pipeline needs to include the new `session-coordinator` worker. CI should already pick up the new packages via `turbo build/test/typecheck` since they're in the workspace.

- [ ] **Step 1: Update deploy workflow to include session-coordinator**

Add to `.github/workflows/deploy-production.yml` a new deploy step:

```yaml
      - name: Deploy Session Coordinator Worker
        run: pnpm wrangler deploy --config workers/session-coordinator/wrangler.toml
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

- [ ] **Step 2: Run full verification**

Run: `pnpm turbo build test typecheck`
Expected: All tasks pass

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-production.yml
git commit -m "chore(ci): add session-coordinator worker to production deploy pipeline"
```

---

## Phase 2 Complete Checkpoint

After all 12 tasks, verify by running:

```bash
pnpm turbo build && pnpm turbo test && pnpm turbo typecheck
```

**What's been built:**
- `packages/realtime`: LiveKit client wrapper, motion frame binary codec, face/pose/hand solvers, MediaPipe Web Worker, motion capture orchestrator
- `workers/session-coordinator`: Durable Object with WebSocket Hibernation API, session state machine, participant management, auto-pause/auto-end
- `workers/api/src/routes/sessions.ts`: Session join (LiveKit token gen + DO init), status, notes endpoints
- `apps/session`: Svelte session store, VideoGrid/SessionControls/ConnectionStatus components, dynamic session route

**What's NOT built yet (Phase 3):**
- A-Frame VR scene rendering
- Avatar driver (consuming motion data to animate Ready Player Me model)
- Environment manager (swapping VR environments)
- Therapeutic tools (breathing exercise, grounding toolkit)
- VR mode toggle in session app

**What's NOT built yet (Phase 4):**
- Patient app features (appointment booking, profile, matching)
- Provider app features (dashboard, messaging, settings)
- AI therapist matching
