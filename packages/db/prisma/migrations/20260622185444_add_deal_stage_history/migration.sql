-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "stageHistory" TEXT[] DEFAULT ARRAY[]::TEXT[];
