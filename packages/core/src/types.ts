export const USER_ROLES = ['patient', 'provider', 'admin'] as const;
export type UserRole = typeof USER_ROLES[number];

export const APPOINTMENT_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export type AppointmentStatus = typeof APPOINTMENT_STATUSES[number];

export const SESSION_STATES = ['waiting', 'active', 'paused', 'ended'] as const;
export type SessionState = typeof SESSION_STATES[number];

export const PROVIDER_STATUSES = ['pending_review', 'active', 'inactive'] as const;
export type ProviderStatus = typeof PROVIDER_STATUSES[number];

export const AUDIT_ACTIONS = [
  'record.read', 'record.create', 'record.update', 'record.delete',
  'session_note.create', 'session_note.read',
  'recording.access', 'recording.download',
  'login', 'logout', 'session.create',
  'matching.access', 'audit.read', 'audit.export',
] as const;
export type AuditAction = typeof AUDIT_ACTIONS[number];
