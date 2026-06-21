import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createPrismaClient, type Db } from './prisma.client.js';
import { DB } from './prisma.tokens.js';

@Global()
@Module({
  providers: [{ provide: DB, useFactory: createPrismaClient }],
  exports: [DB],
})
export class PrismaModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onApplicationShutdown() {
    await this.db.$base.$disconnect();
  }
}
