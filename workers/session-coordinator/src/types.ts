// ---- Session state ----

export type SessionState = 'waiting' | 'active' | 'paused' | 'ended';

export type ParticipantRole = 'provider' | 'patient';

export type MediaState = {
  audioEnabled: boolean;
  videoEnabled: boolean;
};

// ---- Participant ----

export interface Participant {
  userId: string;
  role: ParticipantRole;
  displayName: string;
  joinedAt: number; // unix ms
  mediaState: MediaState;
  activeTools: string[];
}

// ---- Client → Server messages ----

export type ClientMessage =
  | { type: 'join'; userId: string; role: ParticipantRole; displayName: string }
  | { type: 'state_change'; targetState: SessionState }
  | { type: 'environment_change'; environment: string }
  | { type: 'tool_activate'; toolId: string }
  | { type: 'tool_deactivate'; toolId: string }
  | { type: 'chat'; text: string }
  | { type: 'media_state'; audioEnabled: boolean; videoEnabled: boolean }
  | { type: 'ping' };

// ---- Server → Client messages ----

export type ServerMessage =
  | { type: 'state_changed'; state: SessionState; changedBy: string }
  | { type: 'participants'; participants: Participant[] }
  | { type: 'participant_joined'; participant: Participant }
  | { type: 'participant_left'; userId: string; role: ParticipantRole }
  | { type: 'environment_changed'; environment: string; changedBy: string }
  | { type: 'tool_activated'; toolId: string; activatedBy: string }
  | { type: 'tool_deactivated'; toolId: string; deactivatedBy: string }
  | { type: 'chat'; text: string; from: string; fromRole: ParticipantRole; sentAt: number }
  | { type: 'timer'; elapsedMs: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

// ---- Persisted session data ----

export interface SessionData {
  sessionId: string;
  state: SessionState;
  environment: string;
  participants: Participant[];
  startedAt: number | null; // unix ms — set when first active
  pausedAt: number | null;  // unix ms — set when paused
  endedAt: number | null;   // unix ms — set when ended
  activeTools: string[];
}
