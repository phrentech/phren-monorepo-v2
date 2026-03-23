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
