import { type ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';

/** Reports unhandled errors to Sentry (when configured), then delegates to Nest's
 *  default formatting so clients still get a clean response. */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    if (process.env.SENTRY_DSN) Sentry.captureException(exception);
    super.catch(exception, host);
  }
}
