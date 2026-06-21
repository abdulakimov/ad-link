import type { Role } from '@adlink/core';

/** JWT payload shape, also what `@CurrentUser()` returns. */
export interface AuthUser {
  sub: string; // user id
  tenantId: string;
  role: Role;
  clientId?: string | null;
}
