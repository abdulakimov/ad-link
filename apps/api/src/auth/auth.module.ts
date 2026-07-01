import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { QrLoginService } from './qr/qr-login.service.js';
import { TelegramBotService } from './qr/telegram-bot.service.js';

@Module({
  imports: [
    // registerAsync (not register): the factory runs during DI init — AFTER ConfigModule has
    // loaded .env into process.env — so APP_SECRET is defined. With the sync register(), the
    // secret was read at import time (before env load) and ended up undefined, breaking every
    // JWT sign/verify (login, register, Google, Telegram).
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.APP_SECRET,
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, QrLoginService, TelegramBotService],
  exports: [JwtModule],
})
export class AuthModule {}
