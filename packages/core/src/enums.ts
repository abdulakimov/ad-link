/**
 * Canonical enums — the single source of truth shared by api (Prisma) and web.
 * Kept as const objects + string-literal unions so the web app never imports the
 * Prisma client just to know a status name. These MUST stay in sync with
 * `packages/db/prisma/schema.prisma`.
 */

export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  BUYER: 'BUYER',
  CLIENT: 'CLIENT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const AdProvider = {
  META: 'META',
  GOOGLE: 'GOOGLE',
  TIKTOK: 'TIKTOK',
} as const;
export type AdProvider = (typeof AdProvider)[keyof typeof AdProvider];

export const CrmProvider = {
  BITRIX24: 'BITRIX24',
  AMOCRM: 'AMOCRM',
  HUBSPOT: 'HUBSPOT',
  SALESFORCE: 'SALESFORCE',
} as const;
export type CrmProvider = (typeof CrmProvider)[keyof typeof CrmProvider];

/** Lead / Qualified / Won / Lost / Ignore — what every CRM stage maps to. */
export const CanonicalStatus = {
  LEAD: 'LEAD',
  QUALIFIED: 'QUALIFIED',
  WON: 'WON',
  LOST: 'LOST',
  IGNORE: 'IGNORE',
} as const;
export type CanonicalStatus = (typeof CanonicalStatus)[keyof typeof CanonicalStatus];

export const LeadSource = {
  META_LEAD_AD: 'META_LEAD_AD',
  WEBSITE: 'WEBSITE',
  DM: 'DM',
  CRM: 'CRM',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export const IdentifierType = {
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
} as const;
export type IdentifierType = (typeof IdentifierType)[keyof typeof IdentifierType];

export const TouchType = {
  IMPRESSION: 'IMPRESSION',
  CLICK: 'CLICK',
  LEAD: 'LEAD',
} as const;
export type TouchType = (typeof TouchType)[keyof typeof TouchType];

/** Ordered most → least reliable. The matching engine tries them in this order. */
export const MatchMethod = {
  LEADGEN_ID: 'LEADGEN_ID',
  FBCLID: 'FBCLID',
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  UTM: 'UTM',
  FUZZY: 'FUZZY',
  MANUAL: 'MANUAL',
} as const;
export type MatchMethod = (typeof MatchMethod)[keyof typeof MatchMethod];

/** Default confidence per method (0..1). UTM/FUZZY land in the review queue. */
export const MATCH_CONFIDENCE: Record<MatchMethod, number> = {
  LEADGEN_ID: 1,
  FBCLID: 1,
  PHONE: 0.95,
  EMAIL: 0.9,
  UTM: 0.5,
  FUZZY: 0.35,
  MANUAL: 1,
};

/** Below this, a match is parked in the review queue, never counted as revenue. */
export const REVIEW_THRESHOLD = 0.7;

export const MatchStatus = {
  MATCHED: 'MATCHED',
  UNMATCHED: 'UNMATCHED',
  REVIEW: 'REVIEW',
  REJECTED: 'REJECTED',
} as const;
export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

export const AttributionModel = {
  FIRST_TOUCH: 'FIRST_TOUCH',
  LAST_TOUCH: 'LAST_TOUCH',
  LINEAR: 'LINEAR',
  TIME_DECAY: 'TIME_DECAY',
  POSITION: 'POSITION',
} as const;
export type AttributionModel = (typeof AttributionModel)[keyof typeof AttributionModel];

export const ConversionType = {
  LEAD: 'LEAD',
  QUALIFIED_LEAD: 'QUALIFIED_LEAD',
  PURCHASE: 'PURCHASE',
} as const;
export type ConversionType = (typeof ConversionType)[keyof typeof ConversionType];

export const ConversionState = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
} as const;
export type ConversionState = (typeof ConversionState)[keyof typeof ConversionState];

export const SyncState = {
  OK: 'OK',
  RUNNING: 'RUNNING',
  FAILED: 'FAILED',
} as const;
export type SyncState = (typeof SyncState)[keyof typeof SyncState];
