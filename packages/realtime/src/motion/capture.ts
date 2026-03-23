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
