import { PrismaClient } from '@prisma/client';

// Phase 0: prove the pipeline with an idempotent demo tenant + client.
// Phase 1 extends this with a seeded owner user (needs password hashing).
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: 'demo-tenant' },
    update: {},
    create: { id: 'demo-tenant', name: 'Demo Agency', reportCurrency: 'USD' },
  });

  await prisma.client.upsert({
    where: { id: 'demo-client' },
    update: {},
    create: { id: 'demo-client', tenantId: tenant.id, name: 'Demo Client' },
  });

  console.log('Seeded demo tenant + client.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
