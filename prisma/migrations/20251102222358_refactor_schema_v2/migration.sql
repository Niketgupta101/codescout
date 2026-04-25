-- Step 1: Create new enums (only new ones, others already exist)
CREATE TYPE "CodeFileLanguage" AS ENUM ('typescript', 'javascript', 'csv', 'markdown', 'pdf', 'json', 'yaml', 'plaintext', 'prisma');
CREATE TYPE "DocumentFormat" AS ENUM ('csv', 'markdown', 'pdf');
CREATE TYPE "DocumentType_new" AS ENUM ('technicalSpecification', 'userStories', 'meetingNotes', 'custom');
CREATE TYPE "RepositoryType_new" AS ENUM ('backendCodebase', 'webCodebase', 'appCodebase', 'custom');
CREATE TYPE "SymbolType_new" AS ENUM ('heading', 'term', 'function', 'class', 'variable', 'interface', 'type', 'enum', 'module');

-- Step 2: Add new columns to CodeFile (skip summary and summaryEmbedding - already exist)
ALTER TABLE "CodeFile" ADD COLUMN IF NOT EXISTS "fullPath" TEXT;
ALTER TABLE "CodeFile" ADD COLUMN IF NOT EXISTS "rawContent" TEXT;
ALTER TABLE "CodeFile" ADD COLUMN IF NOT EXISTS "language_new" "CodeFileLanguage";

-- Step 3: Migrate CodeFile data
UPDATE "CodeFile" SET "fullPath" = "path" WHERE "fullPath" IS NULL;
UPDATE "CodeFile" SET "rawContent" = "content" WHERE "rawContent" IS NULL;

-- Map language strings to enum values
UPDATE "CodeFile" SET "language_new" =
  CASE
    WHEN "language" = 'typescript' THEN 'typescript'::"CodeFileLanguage"
    WHEN "language" = 'javascript' THEN 'javascript'::"CodeFileLanguage"
    WHEN "language" = 'csv' THEN 'csv'::"CodeFileLanguage"
    WHEN "language" = 'markdown' THEN 'markdown'::"CodeFileLanguage"
    WHEN "language" = 'pdf' THEN 'pdf'::"CodeFileLanguage"
    WHEN "language" = 'json' THEN 'json'::"CodeFileLanguage"
    WHEN "language" = 'yaml' THEN 'yaml'::"CodeFileLanguage"
    WHEN "language" = 'plaintext' THEN 'plaintext'::"CodeFileLanguage"
    WHEN "language" = 'prisma' THEN 'prisma'::"CodeFileLanguage"
    ELSE 'plaintext'::"CodeFileLanguage"
  END
WHERE "language_new" IS NULL;

-- Step 4: Make new columns required and drop old ones
ALTER TABLE "CodeFile" ALTER COLUMN "fullPath" SET NOT NULL;
ALTER TABLE "CodeFile" ALTER COLUMN "rawContent" SET NOT NULL;
ALTER TABLE "CodeFile" ALTER COLUMN "language_new" SET NOT NULL;

-- Drop indexes that depend on old columns
DROP INDEX IF EXISTS "CodeFile_projectId_path_idx";
DROP INDEX IF EXISTS "CodeFile_projectId_documentType_idx";

ALTER TABLE "CodeFile" DROP CONSTRAINT IF EXISTS "CodeFile_projectId_path_key";
ALTER TABLE "CodeFile" DROP COLUMN IF EXISTS "path";
ALTER TABLE "CodeFile" DROP COLUMN IF EXISTS "relativePath";
ALTER TABLE "CodeFile" DROP COLUMN IF EXISTS "content";
ALTER TABLE "CodeFile" DROP COLUMN IF EXISTS "language";
ALTER TABLE "CodeFile" DROP COLUMN IF EXISTS "documentType";
ALTER TABLE "CodeFile" RENAME COLUMN "language_new" TO "language";

-- Step 5: Update CodeFile unique constraint
ALTER TABLE "CodeFile" ADD CONSTRAINT "CodeFile_projectId_fullPath_key" UNIQUE ("projectId", "fullPath");

-- Step 6: Add new columns to Symbol
ALTER TABLE "Symbol" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Symbol" ADD COLUMN IF NOT EXISTS "type_new" "SymbolType_new";
ALTER TABLE "Symbol" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Step 7: Migrate Symbol data
UPDATE "Symbol" SET "name" = "symbolName" WHERE "name" IS NULL;

-- Map symbolType to new enum
UPDATE "Symbol" SET "type_new" =
  CASE
    WHEN "symbolType" = 'heading' THEN 'heading'::"SymbolType_new"
    WHEN "symbolType" = 'term' THEN 'term'::"SymbolType_new"
    WHEN "symbolType" = 'function' THEN 'function'::"SymbolType_new"
    WHEN "symbolType" = 'class' THEN 'class'::"SymbolType_new"
    WHEN "symbolType" = 'variable' THEN 'variable'::"SymbolType_new"
    WHEN "symbolType" = 'interface' THEN 'interface'::"SymbolType_new"
    WHEN "symbolType" = 'type' THEN 'type'::"SymbolType_new"
    WHEN "symbolType" = 'enum' THEN 'enum'::"SymbolType_new"
    WHEN "symbolType" = 'module' THEN 'module'::"SymbolType_new"
    WHEN "symbolType" = 'epic' THEN 'heading'::"SymbolType_new"
    WHEN "symbolType" = 'story' THEN 'term'::"SymbolType_new"
    ELSE 'term'::"SymbolType_new"
  END
WHERE "type_new" IS NULL;

-- Step 8: Make new Symbol columns required and drop old ones
ALTER TABLE "Symbol" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "Symbol" ALTER COLUMN "type_new" SET NOT NULL;
ALTER TABLE "Symbol" ALTER COLUMN "updatedAt" SET NOT NULL;

DROP INDEX IF EXISTS "Symbol_symbolName_idx";
DROP INDEX IF EXISTS "Symbol_projectId_symbolName_idx";
DROP INDEX IF EXISTS "Symbol_projectId_symbolType_idx";

ALTER TABLE "Symbol" DROP COLUMN IF EXISTS "symbolName";
ALTER TABLE "Symbol" DROP COLUMN IF EXISTS "symbolType";
ALTER TABLE "Symbol" RENAME COLUMN "type_new" TO "type";

-- Step 9: Create Symbol indexes
CREATE INDEX IF NOT EXISTS "Symbol_name_idx" ON "Symbol"("name");
CREATE INDEX IF NOT EXISTS "Symbol_projectId_name_idx" ON "Symbol"("projectId", "name");
CREATE INDEX IF NOT EXISTS "Symbol_projectId_type_idx" ON "Symbol"("projectId", "type");

-- Step 10: Add new columns to Repository
ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "lastCommitHash" TEXT;
ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "type_new" "RepositoryType_new";

-- Step 11: Migrate Repository data
-- Extract repository name from URL
UPDATE "Repository" SET "name" =
  CASE
    WHEN "url" LIKE '%.git' THEN regexp_replace(substring("url" from '[^/]+\.git$'), '\.git$', '')
    ELSE regexp_replace(substring("url" from '[^/]+$'), '\.git$', '')
  END
WHERE "name" IS NULL;

UPDATE "Repository" SET "lastCommitHash" = "lastCommit" WHERE "lastCommitHash" IS NULL;

-- Map repositoryType to new enum
UPDATE "Repository" SET "type_new" =
  CASE
    WHEN "repositoryType" = 'backend_codebase' THEN 'backendCodebase'::"RepositoryType_new"
    WHEN "repositoryType" = 'web_codebase' THEN 'webCodebase'::"RepositoryType_new"
    WHEN "repositoryType" = 'app_codebase' THEN 'appCodebase'::"RepositoryType_new"
    ELSE 'custom'::"RepositoryType_new"
  END
WHERE "type_new" IS NULL;

-- Step 12: Make new Repository columns required and drop old ones
ALTER TABLE "Repository" ALTER COLUMN "name" SET NOT NULL;

ALTER TABLE "Repository" DROP COLUMN IF EXISTS "lastCommit";
ALTER TABLE "Repository" DROP COLUMN IF EXISTS "repositoryType";
ALTER TABLE "Repository" RENAME COLUMN "type_new" TO "type";

-- Step 13: Handle Document columns
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "format_new" "DocumentFormat";
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "documentType_new" "DocumentType_new";

-- Step 14: Migrate Document data
UPDATE "Document" SET "format_new" =
  CASE
    WHEN "format" = 'csv' THEN 'csv'::"DocumentFormat"
    WHEN "format" = 'markdown' THEN 'markdown'::"DocumentFormat"
    WHEN "format" = 'pdf' THEN 'pdf'::"DocumentFormat"
    ELSE 'pdf'::"DocumentFormat"
  END
WHERE "format_new" IS NULL;

-- Map documentType values
UPDATE "Document" SET "documentType_new" =
  CASE
    WHEN "documentType" = 'tech_spec' THEN 'technicalSpecification'::"DocumentType_new"
    WHEN "documentType" = 'user_stories' THEN 'userStories'::"DocumentType_new"
    WHEN "documentType" = 'meeting_notes' THEN 'meetingNotes'::"DocumentType_new"
    WHEN "documentType" = 'requirements' THEN 'custom'::"DocumentType_new"
    WHEN "documentType" = 'design_doc' THEN 'custom'::"DocumentType_new"
    ELSE 'custom'::"DocumentType_new"
  END
WHERE "documentType_new" IS NULL;

-- Step 15: Make new Document columns required and drop old ones
ALTER TABLE "Document" ALTER COLUMN "format_new" SET NOT NULL;
ALTER TABLE "Document" ALTER COLUMN "documentType_new" SET NOT NULL;

ALTER TABLE "Document" DROP COLUMN IF EXISTS "format";
ALTER TABLE "Document" DROP COLUMN IF EXISTS "documentType";
ALTER TABLE "Document" RENAME COLUMN "format_new" TO "format";
ALTER TABLE "Document" RENAME COLUMN "documentType_new" TO "documentType";

-- Step 16: Handle Message columns (already have embedding and role, need to migrate)
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "contentEmbedding" vector(1536);
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "assitant" BOOLEAN DEFAULT false;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Step 17: Migrate Message data
UPDATE "Message" SET "contentEmbedding" = "embedding" WHERE "contentEmbedding" IS NULL AND "embedding" IS NOT NULL;
UPDATE "Message" SET "assitant" = CASE WHEN "role" = 'assistant' THEN true ELSE false END WHERE "role" IS NOT NULL;
UPDATE "Message" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;

-- Step 18: Make Message columns required and drop old ones
ALTER TABLE "Message" ALTER COLUMN "assitant" SET NOT NULL;
ALTER TABLE "Message" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Message" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "Message" DROP COLUMN IF EXISTS "role";

-- Step 19: Handle Conversation columns
UPDATE "Conversation" SET "title" = 'Untitled Conversation' WHERE "title" IS NULL;
ALTER TABLE "Conversation" ALTER COLUMN "title" SET NOT NULL;

-- Step 20: Drop unused Project column
ALTER TABLE "Project" DROP COLUMN IF EXISTS "config";

-- Step 21: Drop old enum types
DROP TYPE IF EXISTS "RepositoryType";
DROP TYPE IF EXISTS "SymbolType";
DROP TYPE IF EXISTS "DocumentType";

-- Step 22: Rename new enum types to original names
ALTER TYPE "RepositoryType_new" RENAME TO "RepositoryType";
ALTER TYPE "SymbolType_new" RENAME TO "SymbolType";
ALTER TYPE "DocumentType_new" RENAME TO "DocumentType";

-- Step 23: Ensure indexes exist
CREATE INDEX IF NOT EXISTS "CodeFile_projectId_language_idx" ON "CodeFile"("projectId", "language");
