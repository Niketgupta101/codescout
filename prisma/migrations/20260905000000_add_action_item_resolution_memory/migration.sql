-- AlterTable
ALTER TABLE "ProjectActionItem" ADD COLUMN     "resolutionEvidenceDigest" TEXT,
ADD COLUMN     "resolutionAttemptedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedByRepositoryFilePath" TEXT,
ADD COLUMN     "resolutionEvidence" JSONB;
