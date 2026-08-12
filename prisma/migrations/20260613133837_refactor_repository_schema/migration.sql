-- rename to clean schema names, preserving all data (pure rename: tables, enum, column, constraints, indexes)

-- enum
ALTER TYPE "CodeFileLanguage" RENAME TO "RepositoryFileLanguage";

-- tables
ALTER TABLE "Directory" RENAME TO "RepositoryDirectory";
ALTER TABLE "CodeFile" RENAME TO "RepositoryFile";
ALTER TABLE "Symbol" RENAME TO "RepositoryFileSymbol";
ALTER TABLE "Document" RENAME TO "ProjectDocument";

-- column
ALTER TABLE "RepositoryFileSymbol" RENAME COLUMN "codeFileId" TO "repositoryFileId";

-- primary keys
ALTER TABLE "RepositoryDirectory" RENAME CONSTRAINT "Directory_pkey" TO "RepositoryDirectory_pkey";
ALTER TABLE "RepositoryFile" RENAME CONSTRAINT "CodeFile_pkey" TO "RepositoryFile_pkey";
ALTER TABLE "RepositoryFileSymbol" RENAME CONSTRAINT "Symbol_pkey" TO "RepositoryFileSymbol_pkey";
ALTER TABLE "ProjectDocument" RENAME CONSTRAINT "Document_pkey" TO "ProjectDocument_pkey";

-- foreign keys
ALTER TABLE "RepositoryDirectory" RENAME CONSTRAINT "Directory_projectId_fkey" TO "RepositoryDirectory_projectId_fkey";
ALTER TABLE "RepositoryDirectory" RENAME CONSTRAINT "Directory_parentId_fkey" TO "RepositoryDirectory_parentId_fkey";
ALTER TABLE "RepositoryFile" RENAME CONSTRAINT "CodeFile_projectId_fkey" TO "RepositoryFile_projectId_fkey";
ALTER TABLE "RepositoryFile" RENAME CONSTRAINT "CodeFile_repositoryId_fkey" TO "RepositoryFile_repositoryId_fkey";
ALTER TABLE "RepositoryFile" RENAME CONSTRAINT "CodeFile_documentId_fkey" TO "RepositoryFile_documentId_fkey";
ALTER TABLE "RepositoryFile" RENAME CONSTRAINT "CodeFile_directoryId_fkey" TO "RepositoryFile_directoryId_fkey";
ALTER TABLE "RepositoryFileSymbol" RENAME CONSTRAINT "Symbol_projectId_fkey" TO "RepositoryFileSymbol_projectId_fkey";
ALTER TABLE "RepositoryFileSymbol" RENAME CONSTRAINT "Symbol_codeFileId_fkey" TO "RepositoryFileSymbol_repositoryFileId_fkey";
ALTER TABLE "ProjectDocument" RENAME CONSTRAINT "Document_projectId_fkey" TO "ProjectDocument_projectId_fkey";

-- indexes
ALTER INDEX "Directory_projectId_fullPath_key" RENAME TO "RepositoryDirectory_projectId_fullPath_key";
ALTER INDEX "Directory_projectId_parentId_idx" RENAME TO "RepositoryDirectory_projectId_parentId_idx";
ALTER INDEX "Directory_projectId_depth_idx" RENAME TO "RepositoryDirectory_projectId_depth_idx";

ALTER INDEX "CodeFile_projectId_fullPath_key" RENAME TO "RepositoryFile_projectId_fullPath_key";
ALTER INDEX "CodeFile_projectId_language_idx" RENAME TO "RepositoryFile_projectId_language_idx";
ALTER INDEX "CodeFile_repositoryId_idx" RENAME TO "RepositoryFile_repositoryId_idx";
ALTER INDEX "CodeFile_documentId_idx" RENAME TO "RepositoryFile_documentId_idx";
ALTER INDEX "CodeFile_directoryId_idx" RENAME TO "RepositoryFile_directoryId_idx";
ALTER INDEX "CodeFile_checksum_idx" RENAME TO "RepositoryFile_checksum_idx";

ALTER INDEX "Symbol_projectId_type_idx" RENAME TO "RepositoryFileSymbol_projectId_type_idx";
ALTER INDEX "Symbol_projectId_name_idx" RENAME TO "RepositoryFileSymbol_projectId_name_idx";
ALTER INDEX "Symbol_name_idx" RENAME TO "RepositoryFileSymbol_name_idx";
ALTER INDEX "Symbol_codeFileId_idx" RENAME TO "RepositoryFileSymbol_repositoryFileId_idx";

-- hnsw vector indexes (managed outside prisma - summaryEmbedding/contentEmbedding are Unsupported types)
CREATE INDEX "RepositoryFile_summaryEmbedding_hnsw_idx" ON "RepositoryFile" USING hnsw ("summaryEmbedding" halfvec_cosine_ops);
CREATE INDEX "Message_contentEmbedding_hnsw_idx" ON "Message" USING hnsw ("contentEmbedding" halfvec_cosine_ops);
