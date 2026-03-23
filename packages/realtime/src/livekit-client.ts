import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalParticipant,
  type DisconnectReason,
} from 'livekit-client';
import { type LiveKitConfig, type MotionFrame, DATA_CHANNEL_TOPIC } from './types';
import { encodeMotionFrame } from './data-channel';

export interface PhrenRoomCallbacks {
  onParticipantConnected?: (participant: RemoteParticipant) => void;
  onParticipantDisconnected?: (participant: RemoteParticipant) => void;
  onTrackSubscribed?: (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => void;
  onTrackUnsubscribed?: (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => void;
  onDisconnected?: (reason?: DisconnectReason) => void;
  onReconnecting?: () => void;
  onReconnected?: () => void;
  onDataReceived?: (
    payload: Uint8Array,
    participant?: RemoteParticipant,
    topic?: string,
  ) => void;
}

/**
 * PhrenRoom wraps LiveKit's Room with telehealth-optimised defaults and a
 * simplified API tailored to the Phren session use-case.
 */
export class PhrenRoom {
  private readonly _room: Room;
  private readonly _config: LiveKitConfig;

  constructor(config: LiveKitConfig, callbacks: PhrenRoomCallbacks = {}) {
    this._config = config;

    this._room = new Room({
      // Adaptive stream adjusts video resolution based on visible element size
      adaptiveStream: true,
      // Dynacast pauses unused simulcast layers to save bandwidth/CPU
      dynacast: true,
      // Audio processing suitable for telehealth (echo cancellation, noise suppression)
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      disconnectOnPageLeave: true,
    });

    // Wire up event callbacks
    this._room.on(RoomEvent.ParticipantConnected, (participant) => {
      callbacks.onParticipantConnected?.(participant);
    });

    this._room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      callbacks.onParticipantDisconnected?.(participant);
    });

    this._room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      callbacks.onTrackSubscribed?.(track, publication, participant);
    });

    this._room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      callbacks.onTrackUnsubscribed?.(track, publication, participant);
    });

    this._room.on(RoomEvent.Disconnected, (reason) => {
      callbacks.onDisconnected?.(reason);
    });

    this._room.on(RoomEvent.Reconnecting, () => {
      callbacks.onReconnecting?.();
    });

    this._room.on(RoomEvent.Reconnected, () => {
      callbacks.onReconnected?.();
    });

    this._room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      callbacks.onDataReceived?.(payload, participant, topic);
    });
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  /** Connect to the LiveKit room using the configured URL and token. */
  async connect(): Promise<void> {
    await this._room.connect(this._config.url, this._config.token);
  }

  /**
   * Enable the local participant's camera and microphone.
   * Should be called after connect() once the user has granted media permissions.
   */
  async enableMedia(): Promise<void> {
    await this._room.localParticipant.enableCameraAndMicrophone();
  }

  /** Toggle the local participant's microphone mute state. */
  async toggleMicrophone(): Promise<void> {
    const pub = this._room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const isMuted = pub?.isMuted ?? false;
    await this._room.localParticipant.setMicrophoneEnabled(isMuted);
  }

  /** Toggle the local participant's camera state. */
  async toggleCamera(): Promise<void> {
    const pub = this._room.localParticipant.getTrackPublication(Track.Source.Camera);
    const isMuted = pub?.isMuted ?? false;
    await this._room.localParticipant.setCameraEnabled(isMuted);
  }

  /** Start screen sharing. */
  async startScreenShare(): Promise<void> {
    await this._room.localParticipant.setScreenShareEnabled(true);
  }

  /** Stop screen sharing. */
  async stopScreenShare(): Promise<void> {
    await this._room.localParticipant.setScreenShareEnabled(false);
  }

  // -------------------------------------------------------------------------
  // Data channel
  // -------------------------------------------------------------------------

  /**
   * Send a MotionFrame over the data channel using unreliable (lossy) delivery.
   * Dropped frames are acceptable since newer frames supersede older ones.
   */
  async sendMotionData(frame: MotionFrame): Promise<void> {
    const bytes = encodeMotionFrame(frame);
    await this._room.localParticipant.publishData(bytes, {
      reliable: false,
      topic: DATA_CHANNEL_TOPIC,
    });
  }

  /**
   * Send arbitrary data reliably (guaranteed delivery, ordered).
   * Use for control messages or events that must not be dropped.
   */
  async sendReliableData(data: Uint8Array, topic?: string): Promise<void> {
    await this._room.localParticipant.publishData(data, {
      reliable: true,
      topic,
    });
  }

  // -------------------------------------------------------------------------
  // Media helpers
  // -------------------------------------------------------------------------

  /**
   * Returns the local camera's MediaStream, or undefined if no camera track
   * is currently published.
   */
  getLocalVideoMediaStream(): MediaStream | undefined {
    const pub = this._room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track;
    if (!track) return undefined;
    // LocalTrack exposes mediaStreamTrack; wrap in MediaStream for consumers
    const msTrack = (track as { mediaStreamTrack?: MediaStreamTrack }).mediaStreamTrack;
    if (!msTrack) return undefined;
    return new MediaStream([msTrack]);
  }

  /** Disconnect from the room and stop all local tracks. */
  async disconnect(): Promise<void> {
    await this._room.disconnect(true);
  }

  // -------------------------------------------------------------------------
  // Properties
  // -------------------------------------------------------------------------

  get isConnected(): boolean {
    return this._room.state === ConnectionState.Connected;
  }

  get localParticipant(): LocalParticipant {
    return this._room.localParticipant;
  }

  get remoteParticipants(): Map<string, RemoteParticipant> {
    return this._room.remoteParticipants;
  }

  get connectionState(): ConnectionState {
    return this._room.state;
  }

  /** Escape hatch — direct access to the underlying LiveKit Room. */
  get nativeRoom(): Room {
    return this._room;
  }
}
