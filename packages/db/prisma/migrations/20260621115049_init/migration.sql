-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'BUYER', 'CLIENT');

-- CreateEnum
CREATE TYPE "AdProvider" AS ENUM ('META', 'GOOGLE', 'TIKTOK');

-- CreateEnum
CREATE TYPE "CrmProvider" AS ENUM ('BITRIX24', 'AMOCRM', 'HUBSPOT', 'SALESFORCE');

-- CreateEnum
CREATE TYPE "CanonicalStatus" AS ENUM ('LEAD', 'QUALIFIED', 'WON', 'LOST', 'IGNORE');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('META_LEAD_AD', 'WEBSITE', 'DM', 'CRM');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "TouchType" AS ENUM ('IMPRESSION', 'CLICK', 'LEAD');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('LEADGEN_ID', 'FBCLID', 'PHONE', 'EMAIL', 'UTM', 'FUZZY', 'MANUAL');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttributionModel" AS ENUM ('FIRST_TOUCH', 'LAST_TOUCH', 'LINEAR', 'TIME_DECAY', 'POSITION');

-- CreateEnum
CREATE TYPE "ConversionType" AS ENUM ('LEAD', 'QUALIFIED_LEAD', 'PURCHASE');

-- CreateEnum
CREATE TYPE "ConversionState" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SyncState" AS ENUM ('OK', 'RUNNING', 'FAILED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportCurrency" TEXT NOT NULL DEFAULT 'USD',
    "defaultModel" "AttributionModel" NOT NULL DEFAULT 'LAST_TOUCH',
    "lookbackDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'BUYER',
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "provider" "AdProvider" NOT NULL DEFAULT 'META',
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "tokenRef" TEXT NOT NULL,
    "feedbackOptIn" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "syncState" "SyncState" NOT NULL DEFAULT 'OK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "provider" "CrmProvider" NOT NULL,
    "externalRef" TEXT NOT NULL,
    "authRef" TEXT NOT NULL,
    "revenueField" TEXT,
    "revenueCurrencyField" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "syncState" "SyncState" NOT NULL DEFAULT 'OK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "crmConnectionId" TEXT NOT NULL,
    "externalStageId" TEXT NOT NULL,
    "externalStageName" TEXT NOT NULL,
    "canonical" "CanonicalStatus" NOT NULL,

    CONSTRAINT "StageMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,

    CONSTRAINT "AdSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "creativeId" TEXT,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creative" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT,
    "video" TEXT,
    "hook" TEXT,
    "concept" TEXT,
    "angle" TEXT,
    "format" TEXT,
    "audience" TEXT,
    "tags" TEXT[],

    CONSTRAINT "Creative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdInsightDaily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "reach" INTEGER,
    "frequency" DECIMAL(10,4),

    CONSTRAINT "AdInsightDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactIdentifier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "normalized" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "ContactIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "source" "LeadSource" NOT NULL,
    "externalId" TEXT,
    "leadgenId" TEXT,
    "fbclid" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "adId" TEXT,
    "matchMethod" "MatchMethod",
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "leadId" TEXT,
    "externalId" TEXT NOT NULL,
    "stageExternalId" TEXT NOT NULL,
    "canonical" "CanonicalStatus" NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "wonAt" TIMESTAMP(3),

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TouchPoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "leadId" TEXT,
    "adId" TEXT,
    "type" "TouchType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "isFirst" BOOLEAN NOT NULL DEFAULT false,
    "isLast" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TouchPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "type" "ConversionType" NOT NULL,
    "eventId" TEXT NOT NULL,
    "leadgenId" TEXT,
    "value" DECIMAL(18,2),
    "currency" TEXT,
    "state" "ConversionState" NOT NULL DEFAULT 'PENDING',
    "response" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "method" "MatchMethod" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "resolvedBy" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" "SyncState" NOT NULL,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "Client_tenantId_idx" ON "Client"("tenantId");

-- CreateIndex
CREATE INDEX "AdAccount_tenantId_idx" ON "AdAccount"("tenantId");

-- CreateIndex
CREATE INDEX "AdAccount_clientId_idx" ON "AdAccount"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_provider_externalId_key" ON "AdAccount"("provider", "externalId");

-- CreateIndex
CREATE INDEX "CrmConnection_tenantId_idx" ON "CrmConnection"("tenantId");

-- CreateIndex
CREATE INDEX "CrmConnection_clientId_idx" ON "CrmConnection"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmConnection_provider_externalRef_key" ON "CrmConnection"("provider", "externalRef");

-- CreateIndex
CREATE INDEX "StageMapping_tenantId_idx" ON "StageMapping"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StageMapping_crmConnectionId_externalStageId_key" ON "StageMapping"("crmConnectionId", "externalStageId");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_idx" ON "Campaign"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_adAccountId_externalId_key" ON "Campaign"("adAccountId", "externalId");

-- CreateIndex
CREATE INDEX "AdSet_tenantId_idx" ON "AdSet"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSet_campaignId_externalId_key" ON "AdSet"("campaignId", "externalId");

-- CreateIndex
CREATE INDEX "Ad_tenantId_idx" ON "Ad"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Ad_adSetId_externalId_key" ON "Ad"("adSetId", "externalId");

-- CreateIndex
CREATE INDEX "Creative_tenantId_idx" ON "Creative"("tenantId");

-- CreateIndex
CREATE INDEX "AdInsightDaily_tenantId_idx" ON "AdInsightDaily"("tenantId");

-- CreateIndex
CREATE INDEX "AdInsightDaily_date_idx" ON "AdInsightDaily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AdInsightDaily_adId_date_key" ON "AdInsightDaily"("adId", "date");

-- CreateIndex
CREATE INDEX "Contact_tenantId_idx" ON "Contact"("tenantId");

-- CreateIndex
CREATE INDEX "ContactIdentifier_normalized_idx" ON "ContactIdentifier"("normalized");

-- CreateIndex
CREATE INDEX "ContactIdentifier_tenantId_idx" ON "ContactIdentifier"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactIdentifier_tenantId_type_normalized_key" ON "ContactIdentifier"("tenantId", "type", "normalized");

-- CreateIndex
CREATE INDEX "Lead_tenantId_idx" ON "Lead"("tenantId");

-- CreateIndex
CREATE INDEX "Lead_leadgenId_idx" ON "Lead"("leadgenId");

-- CreateIndex
CREATE INDEX "Lead_fbclid_idx" ON "Lead"("fbclid");

-- CreateIndex
CREATE INDEX "Lead_matchStatus_idx" ON "Lead"("matchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_source_externalId_key" ON "Lead"("source", "externalId");

-- CreateIndex
CREATE INDEX "Deal_tenantId_idx" ON "Deal"("tenantId");

-- CreateIndex
CREATE INDEX "Deal_canonical_idx" ON "Deal"("canonical");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_tenantId_externalId_key" ON "Deal"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "TouchPoint_tenantId_idx" ON "TouchPoint"("tenantId");

-- CreateIndex
CREATE INDEX "TouchPoint_contactId_idx" ON "TouchPoint"("contactId");

-- CreateIndex
CREATE INDEX "TouchPoint_occurredAt_idx" ON "TouchPoint"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionEvent_eventId_key" ON "ConversionEvent"("eventId");

-- CreateIndex
CREATE INDEX "ConversionEvent_tenantId_idx" ON "ConversionEvent"("tenantId");

-- CreateIndex
CREATE INDEX "ConversionEvent_state_idx" ON "ConversionEvent"("state");

-- CreateIndex
CREATE INDEX "MatchAudit_tenantId_idx" ON "MatchAudit"("tenantId");

-- CreateIndex
CREATE INDEX "MatchAudit_leadId_idx" ON "MatchAudit"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_base_quote_date_key" ON "FxRate"("base", "quote", "date");

-- CreateIndex
CREATE INDEX "SyncRun_tenantId_idx" ON "SyncRun"("tenantId");

-- CreateIndex
CREATE INDEX "SyncRun_kind_idx" ON "SyncRun"("kind");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmConnection" ADD CONSTRAINT "CrmConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageMapping" ADD CONSTRAINT "StageMapping_crmConnectionId_fkey" FOREIGN KEY ("crmConnectionId") REFERENCES "CrmConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSet" ADD CONSTRAINT "AdSet_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "AdSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdInsightDaily" ADD CONSTRAINT "AdInsightDaily_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactIdentifier" ADD CONSTRAINT "ContactIdentifier_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TouchPoint" ADD CONSTRAINT "TouchPoint_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TouchPoint" ADD CONSTRAINT "TouchPoint_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
