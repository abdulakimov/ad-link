import { Injectable, type NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { tenantStore } from '../tenant/tenant-context.js';
import type { AuthUser } from './auth.types.js';

/**
 * Verifies the Bearer token, attaches `req.user`, and runs the rest of the
 * request inside the tenant AsyncLocalStorage context so the Prisma extension
 * auto-scopes every query. No/invalid token → request proceeds unauthenticated
 * (protected routes are then rejected by JwtAuthGuard).
 */
@Injectable()
export class AuthContextMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request & { user?: AuthUser }, _res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = this.jwt.verify<AuthUser>(header.slice(7));
        req.user = payload;
        return tenantStore.run(
          {
            tenantId: payload.tenantId,
            userId: payload.sub,
            role: payload.role,
            clientId: payload.clientId,
          },
          () => next(),
        );
      } catch {
        // invalid/expired token → leave unauthenticated
      }
    }
    next();
  }
}
