import { createDb, telehealthSessions } from '@phren/db';
import { eq } from 'drizzle-orm';
import type { Env } from './env.js';
import { tryTransition, shouldAutoPause } from './state-machine.js';
import type {
  SessionState,
  ParticipantRole,
  Participant,
  SessionData,
  ClientMessage,
  ServerMessage,
  MediaState,
} from './types.js';

// ---- Storage keys ----

const STORAGE_KEY_SESSION = 'sessionData';
const STORAGE_KEY_ELAPSED = 'elapsedSeconds';

// ---- Timer constants ----

const TIMER_INTERVAL_MS = 1_000;
const TIMER_BROADCAST_INTERVAL_S = 30;
const TIMER_SAVE_INTERVAL_S = 10;
const AUTO_END_DELAY_MS = 5 * 60 * 1000; // 5 minutes

// ---- SessionCoordinator Durable Object ----

export class SessionCoordinator {
  private state: DurableObjectState;
  private env: Env;

  // In-memory session data (backed by DO storage)
  private sessionData: SessionData | null = null;
  private elapsedSeconds: number = 0;

  // Timer handle (setInterval id)
  private timerHandle: ReturnType<typeof setInterval> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Restore timer if session was active when DO hibernated
    this.state.blockConcurrencyWhile(async () => {
      await this.loadSessionData();
      this.elapsedSeconds = (await this.state.storage.get<number>(STORAGE_KEY_ELAPSED)) ?? 0;

      if (this.sessionData?.state === 'active') {
        this.startTimer();
      }
    });
  }

  // ---- fetch handler ----

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/init':
        return this.handleInit(request);
      case '/ws':
        return this.handleWebSocketUpgrade(request, url);
      case '/status':
        return this.handleStatus();
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  // ---- HTTP route handlers ----

  private async handleInit(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    let body: { sessionId: string; appointmentId: string; livekitRoomName: string };
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const { sessionId, appointmentId, livekitRoomName } = body;
    if (!sessionId || !appointmentId) {
      return new Response('Missing sessionId or appointmentId', { status: 400 });
    }

    // Only initialize once (idempotent)
    if (!this.sessionData) {
      this.sessionData = {
        sessionId,
        state: 'waiting',
        environment: 'default',
        participants: [],
        startedAt: null,
        pausedAt: null,
        endedAt: null,
        activeTools: [],
      };
      await this.saveSessionData();
      await this.state.storage.put('appointmentId', appointmentId);
      await this.state.storage.put('livekitRoomName', livekitRoomName ?? null);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleWebSocketUpgrade(request: Request, url: URL): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const userId = url.searchParams.get('userId');
    const role = url.searchParams.get('role') as ParticipantRole | null;
    const name = url.searchParams.get('name');

    if (!userId || !role || !name) {
      return new Response('Missing userId, role, or name', { status: 400 });
    }
    if (role !== 'provider' && role !== 'patient') {
      return new Response('Invalid role', { status: 400 });
    }

    if (!this.sessionData) {
      return new Response('Session not initialized', { status: 409 });
    }

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];

    const tags = [
      `userId:${userId}`,
      `role:${role}`,
      `name:${encodeURIComponent(name)}`,
    ];
    this.state.acceptWebSocket(server, tags);

    // Send current state to the new connection
    const currentState: ServerMessage = {
      type: 'state_changed',
      state: this.sessionData.state,
      changedBy: 'system',
    };
    this.safeSend(server, currentState);

    const participants = this.getConnectedParticipants();
    const participantsMsg: ServerMessage = {
      type: 'participants',
      participants,
    };
    this.safeSend(server, participantsMsg);

    // Build participant entry for the new connection
    const newParticipant: Participant = {
      userId,
      role,
      displayName: name,
      joinedAt: Date.now(),
      mediaState: { audioEnabled: true, videoEnabled: true },
      activeTools: [],
    };

    // Broadcast participant_joined to all OTHER sockets
    const joinedMsg: ServerMessage = {
      type: 'participant_joined',
      participant: newParticipant,
    };
    this.broadcast(joinedMsg, server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private handleStatus(): Response {
    if (!this.sessionData) {
      return new Response(JSON.stringify({ state: 'uninitialized' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const participants = this.getConnectedParticipants();
    return new Response(
      JSON.stringify({
        state: this.sessionData.state,
        participants,
        elapsedSeconds: this.elapsedSeconds,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ---- WebSocket hibernation handlers ----

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      this.safeSend(ws, { type: 'error', code: 'PARSE_ERROR', message: 'Invalid JSON' });
      return;
    }

    if (!this.sessionData) {
      this.safeSend(ws, { type: 'error', code: 'NOT_INITIALIZED', message: 'Session not initialized' });
      return;
    }

    const userId = this.getTag(ws, 'userId');
    const role = this.getTag(ws, 'role') as ParticipantRole | null;

    switch (msg.type) {
      case 'ping':
        this.safeSend(ws, { type: 'pong' });
        break;

      case 'state_change': {
        if (!role || !userId) break;
        const result = tryTransition(this.sessionData.state, msg.targetState, role);
        if (!result.success) {
          this.safeSend(ws, { type: 'error', code: 'INVALID_TRANSITION', message: result.reason });
          return;
        }
        await this.applyStateChange(msg.targetState, userId);
        break;
      }

      case 'environment_change': {
        if (role !== 'provider') {
          this.safeSend(ws, { type: 'error', code: 'FORBIDDEN', message: 'Only providers can change environment' });
          return;
        }
        this.sessionData.environment = msg.environment;
        await this.saveSessionData();
        const envMsg: ServerMessage = {
          type: 'environment_changed',
          environment: msg.environment,
          changedBy: userId ?? 'unknown',
        };
        this.broadcast(envMsg);
        break;
      }

      case 'tool_activate': {
        if (role !== 'provider') {
          this.safeSend(ws, { type: 'error', code: 'FORBIDDEN', message: 'Only providers can activate tools' });
          return;
        }
        if (!this.sessionData.activeTools.includes(msg.toolId)) {
          this.sessionData.activeTools.push(msg.toolId);
          await this.saveSessionData();
        }
        const activateMsg: ServerMessage = {
          type: 'tool_activated',
          toolId: msg.toolId,
          activatedBy: userId ?? 'unknown',
        };
        this.broadcast(activateMsg);
        break;
      }

      case 'tool_deactivate': {
        if (role !== 'provider') {
          this.safeSend(ws, { type: 'error', code: 'FORBIDDEN', message: 'Only providers can deactivate tools' });
          return;
        }
        this.sessionData.activeTools = this.sessionData.activeTools.filter((t) => t !== msg.toolId);
        await this.saveSessionData();
        const deactivateMsg: ServerMessage = {
          type: 'tool_deactivated',
          toolId: msg.toolId,
          deactivatedBy: userId ?? 'unknown',
        };
        this.broadcast(deactivateMsg);
        break;
      }

      case 'chat': {
        const name = this.getTag(ws, 'name');
        const chatMsg: ServerMessage = {
          type: 'chat',
          text: msg.text,
          from: name ? decodeURIComponent(name) : userId ?? 'unknown',
          fromRole: role ?? 'patient',
          sentAt: Date.now(),
        };
        this.broadcast(chatMsg);
        break;
      }

      case 'media_state': {
        // Re-broadcast participant list (media state is implicit from WebSocket tags / latest msg)
        // Since we don't persist media state per-participant in storage for hibernation,
        // we just re-broadcast the current participant list as a signal.
        const participants = this.getConnectedParticipants();
        const participantsMsg: ServerMessage = {
          type: 'participants',
          participants,
        };
        this.broadcast(participantsMsg);
        break;
      }

      default:
        this.safeSend(ws, { type: 'error', code: 'UNKNOWN_MESSAGE', message: 'Unknown message type' });
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    const userId = this.getTag(ws, 'userId');
    const role = this.getTag(ws, 'role') as ParticipantRole | null;

    if (userId && role && this.sessionData) {
      const leftMsg: ServerMessage = {
        type: 'participant_left',
        userId,
        role,
      };
      this.broadcast(leftMsg, ws);
    }

    // Check if we should auto-pause
    if (this.sessionData) {
      const remaining = this.state.getWebSockets().filter((s) => s !== ws).length;
      if (shouldAutoPause(this.sessionData.state, remaining)) {
        await this.applyStateChange('paused', 'system');

        // Schedule alarm for auto-end after 5 minutes
        await this.state.storage.setAlarm(Date.now() + AUTO_END_DELAY_MS);
      }
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('[SessionCoordinator] WebSocket error:', error);
    try {
      ws.close(1011, 'Internal error');
    } catch {
      // Already closed
    }
  }

  // ---- Alarm handler (auto-end after extended pause with 0 connections) ----

  async alarm(): Promise<void> {
    if (!this.sessionData) return;

    const connectedSockets = this.state.getWebSockets();
    if (this.sessionData.state === 'paused' && connectedSockets.length === 0) {
      await this.applyStateChange('ended', 'system');
    }
  }

  // ---- State machine application ----

  private async applyStateChange(targetState: SessionState, changedBy: string): Promise<void> {
    if (!this.sessionData) return;

    const previousState = this.sessionData.state;
    this.sessionData.state = targetState;

    const now = Date.now();

    if (previousState === 'waiting' && targetState === 'active') {
      this.sessionData.startedAt = now;
      this.startTimer();
    } else if (previousState === 'active' && targetState === 'paused') {
      this.sessionData.pausedAt = now;
      this.stopTimer();
    } else if (previousState === 'paused' && targetState === 'active') {
      this.sessionData.pausedAt = null;
      this.startTimer();
    } else if (targetState === 'ended') {
      this.sessionData.endedAt = now;
      this.stopTimer();
      await this.persistEndedAt(now);
    }

    await this.saveSessionData();

    const stateMsg: ServerMessage = {
      type: 'state_changed',
      state: targetState,
      changedBy,
    };
    this.broadcast(stateMsg);

    if (targetState === 'ended') {
      // Close all sockets
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.close(1000, 'Session ended');
        } catch {
          // Already closed
        }
      }
    }
  }

  // ---- D1 persistence ----

  private async persistEndedAt(endedAt: number): Promise<void> {
    if (!this.sessionData) return;
    try {
      const db = createDb(this.env.DB);
      await db
        .update(telehealthSessions)
        .set({ endedAt: new Date(endedAt).toISOString() })
        .where(eq(telehealthSessions.id, this.sessionData.sessionId));
    } catch (err) {
      console.error('[SessionCoordinator] Failed to persist endedAt to D1:', err);
    }
  }

  // ---- Timer ----

  private startTimer(): void {
    if (this.timerHandle !== null) return;

    this.timerHandle = setInterval(async () => {
      this.elapsedSeconds += 1;

      // Broadcast timer update every 30 seconds
      if (this.elapsedSeconds % TIMER_BROADCAST_INTERVAL_S === 0) {
        const timerMsg: ServerMessage = {
          type: 'timer',
          elapsedMs: this.elapsedSeconds * 1000,
        };
        this.broadcast(timerMsg);
      }

      // Save to storage every 10 seconds
      if (this.elapsedSeconds % TIMER_SAVE_INTERVAL_S === 0) {
        await this.state.storage.put(STORAGE_KEY_ELAPSED, this.elapsedSeconds);
      }
    }, TIMER_INTERVAL_MS);
  }

  private stopTimer(): void {
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
      // Persist latest elapsed time
      void this.state.storage.put(STORAGE_KEY_ELAPSED, this.elapsedSeconds);
    }
  }

  // ---- Helpers ----

  /** Extract a tagged value from a WebSocket's tags. */
  private getTag(ws: WebSocket, prefix: string): string | null {
    const tags = this.state.getTags(ws);
    const tag = tags.find((t) => t.startsWith(`${prefix}:`));
    return tag ? tag.slice(prefix.length + 1) : null;
  }

  /** Build participant list from currently connected sockets. */
  private getConnectedParticipants(): Participant[] {
    return this.state.getWebSockets().map((ws) => {
      const userId = this.getTag(ws, 'userId') ?? 'unknown';
      const role = (this.getTag(ws, 'role') ?? 'patient') as ParticipantRole;
      const rawName = this.getTag(ws, 'name') ?? userId;
      return {
        userId,
        role,
        displayName: decodeURIComponent(rawName),
        joinedAt: Date.now(),
        mediaState: { audioEnabled: true, videoEnabled: true } satisfies MediaState,
        activeTools: this.sessionData?.activeTools ?? [],
      };
    });
  }

  /** Send a message to all connected sockets, optionally excluding one. */
  private broadcast(message: ServerMessage, exclude?: WebSocket): void {
    const payload = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      this.safeSendRaw(ws, payload);
    }
  }

  private safeSend(ws: WebSocket, message: ServerMessage): void {
    this.safeSendRaw(ws, JSON.stringify(message));
  }

  private safeSendRaw(ws: WebSocket, payload: string): void {
    try {
      ws.send(payload);
    } catch {
      // Socket already closed — ignore
    }
  }

  // ---- DO storage ----

  private async loadSessionData(): Promise<void> {
    this.sessionData = (await this.state.storage.get<SessionData>(STORAGE_KEY_SESSION)) ?? null;
  }

  private async saveSessionData(): Promise<void> {
    if (this.sessionData) {
      await this.state.storage.put(STORAGE_KEY_SESSION, this.sessionData);
    }
  }
}
