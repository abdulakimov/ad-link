import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AdAccountsModule } from './ad-accounts/ad-accounts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { ConversionsModule } from './conversions/conversions.module.js';
import { CrmModule } from './crm/crm.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { MatchingModule } from './matching/matching.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { AuthContextMiddleware } from './common/auth/auth-context.middleware.js';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { SentryExceptionFilter } from './common/observability/sentry.filter.js';
import { RolesGuard } from './common/rbac/roles.guard.js';
import { RedisModule } from './common/redis/redis.module.js';
import { validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env'],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        // never log credentials
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        autoLogging: true,
      },
    }),
    // basic abuse protection (e.g. the public /capture beacon, auth endpoints)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    CryptoModule,
    IdentityModule,
    AuthModule,
    JobsModule,
    ClientsModule,
    AdAccountsModule,
    CrmModule,
    MatchingModule,
    MetricsModule,
    ConversionsModule,
    HealthModule,
  ],
  providers: [
    AuthContextMiddleware,
    // rate-limit first, then authenticate, then authorize
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthContextMiddleware).forRoutes('*');
  }
}
