import { PrismaClient } from '@prisma/client';

// Re-export all generated types/enums so consumers import from `@adlink/db`,
// never from `@prisma/client` directly.
export * from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Singleton client — avoids exhausting connections during dev hot-reload. */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
