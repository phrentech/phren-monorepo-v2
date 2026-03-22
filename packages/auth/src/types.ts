import type { UserRole } from '@phren/core';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}
