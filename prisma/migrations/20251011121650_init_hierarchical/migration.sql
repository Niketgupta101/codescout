-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "NodeLevel" AS ENUM ('project', 'folder', 'file', 'section', 'chunk');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('document', 'code', 'config');

-- CreateEnum
CREATE TYPE "SymbolType" AS ENUM ('heading', 'term', 'function', 'class', 'variable', 'epic', 'story');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('references', 'implements', 'extends', 'depends_on', 'part_of');

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Node" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "parentId" UUID,
    "level" "NodeLevel" NOT NULL,
    "nodeType" "NodeType" NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rawContent" TEXT,
    "summary" TEXT,
    "summaryEmbedding" vector(1536),
    "metadata" JSONB,
    "checksum" TEXT,
    "contentUpdatedAt" TIMESTAMP(3),
    "summaryUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Symbol" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "nodeId" UUID NOT NULL,
    "symbolType" "SymbolType" NOT NULL,
    "symbolName" TEXT NOT NULL,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Symbol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "sourceNodeId" UUID NOT NULL,
    "targetNodeId" UUID NOT NULL,
    "relationType" "RelationType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Relation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");

-- CreateIndex
CREATE INDEX "Project_name_idx" ON "Project"("name");

-- CreateIndex
CREATE INDEX "Node_projectId_level_idx" ON "Node"("projectId", "level");

-- CreateIndex
CREATE INDEX "Node_projectId_nodeType_idx" ON "Node"("projectId", "nodeType");

-- CreateIndex
CREATE INDEX "Node_projectId_parentId_idx" ON "Node"("projectId", "parentId");

-- CreateIndex
CREATE INDEX "Node_path_idx" ON "Node"("path");

-- CreateIndex
CREATE INDEX "Node_checksum_idx" ON "Node"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "Node_projectId_path_key" ON "Node"("projectId", "path");

-- CreateIndex
CREATE INDEX "Symbol_projectId_symbolType_idx" ON "Symbol"("projectId", "symbolType");

-- CreateIndex
CREATE INDEX "Symbol_projectId_symbolName_idx" ON "Symbol"("projectId", "symbolName");

-- CreateIndex
CREATE INDEX "Symbol_symbolName_idx" ON "Symbol"("symbolName");

-- CreateIndex
CREATE INDEX "Relation_projectId_relationType_idx" ON "Relation"("projectId", "relationType");

-- CreateIndex
CREATE INDEX "Relation_sourceNodeId_idx" ON "Relation"("sourceNodeId");

-- CreateIndex
CREATE INDEX "Relation_targetNodeId_idx" ON "Relation"("targetNodeId");

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Symbol" ADD CONSTRAINT "Symbol_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Symbol" ADD CONSTRAINT "Symbol_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
