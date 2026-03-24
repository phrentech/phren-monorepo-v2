import { writable, get } from 'svelte/store';
import { PhrenRoom, type LiveKitConfig, type PhrenRoomCallbacks } from '@phren/realtime';
import { Track } from 'livekit-client';

// ---- Types matching the session-coordinator DO ----

type SessionState = 'waiting' | 'active' | 'paused' | 'ended';
type ParticipantRole = 'provider' | 'patient';

interface DOParticipant {
  userId: string;
  role: ParticipantRole;
  displayName: string;
  joinedAt: number;
  mediaState: { audioEnabled: boolean; videoEnabled: boolean };
  activeTools: string[];
}

interface ChatMessage {
  text: string;
  from: string;
  fromRole: string;
  sentAt: number;
}

type ServerMessage =
  | { type: 'state_changed'; state: SessionState; changedBy: string }
  | { type: 'participants'; participants: DOParticipant[] }
  | { type: 'participant_joined'; participant: DOParticipant }
  | { type: 'participant_left'; userId: string; role: ParticipantRole }
  | { type: 'environment_changed'; environment: string; changedBy: string }
  | { type: 'tool_activated'; toolId: string; activatedBy: string }
  | { type: 'tool_deactivated'; toolId: string; deactivatedBy: string }
  | { type: 'chat'; text: string; from: string; fromRole: ParticipantRole; sentAt: number }
  | { type: 'timer'; elapsedMs: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

type ClientMessage =
  | { type: 'join'; userId: string; role: ParticipantRole; displayName: string }
  | { type: 'state_change'; targetState: SessionState }
  | { type: 'environment_change'; environment: string }
  | { type: 'tool_activate'; toolId: string }
  | { type: 'tool_deactivate'; toolId: string }
  | { type: 'chat'; text: string }
  | { type: 'media_state'; audioEnabled: boolean; videoEnabled: boolean }
  | { type: 'ping' };

// ---- Store state ----

export interface SessionStoreState {
  state: SessionState;
  participants: Array<{
    userId: string;
    role: string;
    displayName: string;
    joinedAt: number;
  }>;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  elapsedMs: number;
  environment: string;
  activeTools: string[];
  chatMessages: ChatMessage[];
  error: string | null;
  isMuted: boolean;
  isCameraOff: boolean;
}

const initialState: SessionStoreState = {
  state: 'waiting',
  participants: [],
  connectionStatus: 'disconnected',
  elapsedMs: 0,
  environment: 'default',
  activeTools: [],
  chatMessages: [],
  error: null,
  isMuted: false,
  isCameraOff: false,
};

// ---- Internals ----

let room: PhrenRoom | null = null;
let ws: WebSocket | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentDoUrl: string | null = null;
let currentUserId: string | null = null;
let currentUserRole: ParticipantRole | null = null;
let currentDisplayName: string | null = null;

const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_RECONNECT_DELAY_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

function getReconnectDelay(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY_MS);
  // Add jitter: 0-25% of base
  return base + Math.random() * base * 0.25;
}

// ---- Store creation ----

function createSessionStore() {
  const { subscribe, set, update } = writable<SessionStoreState>({ ...initialState });

  function handleDOMessage(data: string) {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    update((s) => {
      switch (msg.type) {
        case 'state_changed':
          return { ...s, state: msg.state, error: null };

        case 'participants':
          return {
            ...s,
            participants: msg.participants.map((p) => ({
              userId: p.userId,
              role: p.role,
              displayName: p.displayName,
              joinedAt: p.joinedAt,
            })),
          };

        case 'participant_joined':
          return {
            ...s,
            participants: [
              ...s.participants,
              {
                userId: msg.participant.userId,
                role: msg.participant.role,
                displayName: msg.participant.displayName,
                joinedAt: msg.participant.joinedAt,
              },
            ],
          };

        case 'participant_left':
          return {
            ...s,
            participants: s.participants.filter((p) => p.userId !== msg.userId),
          };

        case 'environment_changed':
          return { ...s, environment: msg.environment };

        case 'tool_activated':
          return {
            ...s,
            activeTools: s.activeTools.includes(msg.toolId)
              ? s.activeTools
              : [...s.activeTools, msg.toolId],
          };

        case 'tool_deactivated':
          return {
            ...s,
            activeTools: s.activeTools.filter((id) => id !== msg.toolId),
          };

        case 'chat':
          return {
            ...s,
            chatMessages: [
              ...s.chatMessages,
              { text: msg.text, from: msg.from, fromRole: msg.fromRole, sentAt: msg.sentAt },
            ],
          };

        case 'timer':
          return { ...s, elapsedMs: msg.elapsedMs };

        case 'error':
          return { ...s, error: msg.message };

        case 'pong':
          return s;

        default:
          return s;
      }
    });
  }

  function connectWebSocket(url: string) {
    if (ws) {
      ws.onclose = null;
      ws.close();
    }

    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      update((s) => ({ ...s, connectionStatus: 'connected', error: null }));

      // Send join message
      if (currentUserId && currentUserRole && currentDisplayName) {
        sendClientMessage({
          type: 'join',
          userId: currentUserId,
          role: currentUserRole,
          displayName: currentDisplayName,
        });
      }

      // Start ping keepalive
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        sendClientMessage({ type: 'ping' });
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      handleDOMessage(typeof event.data === 'string' ? event.data : '');
    };

    ws.onclose = () => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }

      const current = get({ subscribe });
      // Don't reconnect if intentionally disconnected or session ended
      if (current.connectionStatus === 'disconnected' || current.state === 'ended') {
        return;
      }

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && currentDoUrl) {
        update((s) => ({ ...s, connectionStatus: 'reconnecting' }));
        const delay = getReconnectDelay(reconnectAttempts);
        reconnectAttempts++;
        reconnectTimer = setTimeout(() => {
          if (currentDoUrl) connectWebSocket(currentDoUrl);
        }, delay);
      } else {
        update((s) => ({
          ...s,
          connectionStatus: 'disconnected',
          error: 'Connection lost. Please refresh the page.',
        }));
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror, so reconnect logic is handled there
    };
  }

  function sendClientMessage(msg: ClientMessage) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  return {
    subscribe,

    async connect(
      livekitConfig: LiveKitConfig,
      doWebSocketUrl: string,
      userId: string,
      role: ParticipantRole,
      displayName: string,
    ) {
      currentDoUrl = doWebSocketUrl;
      currentUserId = userId;
      currentUserRole = role;
      currentDisplayName = displayName;

      update((s) => ({ ...s, connectionStatus: 'connecting' }));

      // Set up LiveKit room
      const callbacks: PhrenRoomCallbacks = {
        onDisconnected: () => {
          update((s) => ({ ...s, connectionStatus: 'disconnected' }));
        },
        onReconnecting: () => {
          update((s) => ({ ...s, connectionStatus: 'reconnecting' }));
        },
        onReconnected: () => {
          update((s) => ({ ...s, connectionStatus: 'connected' }));
        },
      };

      room = new PhrenRoom(livekitConfig, callbacks);

      try {
        await room.connect();
        await room.enableMedia();

        // Read initial media state
        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        update((s) => ({
          ...s,
          isMuted: micPub?.isMuted ?? false,
          isCameraOff: camPub?.isMuted ?? true,
        }));
      } catch (err) {
        update((s) => ({
          ...s,
          error: `Failed to connect to video: ${err instanceof Error ? err.message : String(err)}`,
        }));
      }

      // Connect DO WebSocket
      connectWebSocket(doWebSocketUrl);
    },

    async disconnect() {
      // Signal intentional disconnect
      update((s) => ({ ...s, connectionStatus: 'disconnected' }));

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }
      if (room) {
        await room.disconnect();
        room = null;
      }

      currentDoUrl = null;
      currentUserId = null;
      currentUserRole = null;
      currentDisplayName = null;
      reconnectAttempts = 0;

      set({ ...initialState });
    },

    async toggleMute() {
      if (!room) return;
      await room.toggleMicrophone();
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const isMuted = pub?.isMuted ?? false;
      update((s) => ({ ...s, isMuted }));
      sendClientMessage({
        type: 'media_state',
        audioEnabled: !isMuted,
        videoEnabled: !get({ subscribe }).isCameraOff,
      });
    },

    async toggleCamera() {
      if (!room) return;
      await room.toggleCamera();
      const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      const isCameraOff = pub?.isMuted ?? true;
      update((s) => ({ ...s, isCameraOff }));
      sendClientMessage({
        type: 'media_state',
        audioEnabled: !get({ subscribe }).isMuted,
        videoEnabled: !isCameraOff,
      });
    },

    sendChat(text: string) {
      sendClientMessage({ type: 'chat', text });
    },

    requestStateChange(targetState: SessionState) {
      sendClientMessage({ type: 'state_change', targetState });
    },

    changeEnvironment(environment: string) {
      sendClientMessage({ type: 'environment_change', environment });
    },

    activateTool(toolId: string) {
      sendClientMessage({ type: 'tool_activate', toolId });
    },

    deactivateTool(toolId: string) {
      sendClientMessage({ type: 'tool_deactivate', toolId });
    },

    getRoom(): PhrenRoom | null {
      return room;
    },
  };
}

export const sessionStore = createSessionStore();
