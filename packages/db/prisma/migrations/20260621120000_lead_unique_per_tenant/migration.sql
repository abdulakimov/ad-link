-- Make Lead external ids unique per tenant (was global, which collided across tenants).
DROP INDEX "Lead_source_externalId_key";

CREATE UNIQUE INDEX "Lead_tenantId_source_externalId_key" ON "Lead"("tenantId", "source", "externalId");
