import type { SessionState, ParticipantRole } from './types.js';

// ---- Valid state transitions ----

export const VALID_TRANSITIONS: Record<SessionState, SessionState[]> = {
  waiting: ['active'],
  active: ['paused', 'ended'],
  paused: ['active', 'ended'],
  ended: [],
};

// ---- Role-based transition permissions ----
// Maps "fromState:toState" → roles that are permitted to make the transition.
// If a pair is absent, no role is permitted.

export const TRANSITION_PERMISSIONS: Record<string, ParticipantRole[]> = {
  'waiting:active': ['provider'],
  'active:paused': ['provider'],
  'active:ended': ['provider', 'patient'],
  'paused:active': ['provider'],
  'paused:ended': ['provider'],
};

// ---- Transition result ----

export type TransitionResult =
  | { success: true }
  | { success: false; reason: string };

/**
 * Validate whether a role may move a session from `currentState` to
 * `targetState`.  Returns a discriminated union so callers can inspect the
 * failure reason without throwing.
 */
export function tryTransition(
  currentState: SessionState,
  targetState: SessionState,
  role: ParticipantRole,
): TransitionResult {
  const allowed = VALID_TRANSITIONS[currentState];

  if (!allowed.includes(targetState)) {
    if (currentState === 'ended') {
      return { success: false, reason: `Session is in terminal state 'ended' and cannot be transitioned` };
    }
    return {
      success: false,
      reason: `Transition from '${currentState}' to '${targetState}' is not valid`,
    };
  }

  const key = `${currentState}:${targetState}`;
  const permittedRoles = TRANSITION_PERMISSIONS[key] ?? [];

  if (!permittedRoles.includes(role)) {
    return {
      success: false,
      reason: `Role '${role}' is not permitted to transition from '${currentState}' to '${targetState}'`,
    };
  }

  return { success: true };
}

/**
 * Returns true when the session should automatically move to 'paused':
 * the session is active and no clients are connected.
 */
export function shouldAutoPause(state: SessionState, connectedCount: number): boolean {
  return state === 'active' && connectedCount === 0;
}

/**
 * Returns true when an auto-paused session should automatically end:
 * the session is paused, no clients are connected, and the pause has lasted
 * longer than `maxPauseDurationMs` (default 5 minutes).
 */
export function shouldAutoEnd(
  state: SessionState,
  connectedCount: number,
  pausedDurationMs: number,
  maxPauseDurationMs: number = 5 * 60 * 1000,
): boolean {
  return state === 'paused' && connectedCount === 0 && pausedDurationMs >= maxPauseDurationMs;
}
