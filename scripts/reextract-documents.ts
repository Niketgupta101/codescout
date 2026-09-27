#!/usr/bin/env -S NODE_PATH=. TS_NODE_PROJECT=./tsconfig.json TS_NODE_FILES=true node -r ts-node/register -r tsconfig-paths/register

import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
// imported to force the indexing<->repositories forwardRef cycle to load early; importing project-document before
// indexing in a standalone ts-node context otherwise triggers a module-not-found during app bootstrap
import { IndexingService } from "../src/modules/indexing/indexing.service";
import { ProjectDocumentService } from "../src/modules/project-document/project-document.service";

// usage (run via the shebang so tsconfig-paths resolves the src/* imports):
//   ./scripts/reextract-documents.ts --project=<name|id> --type=xlsx
//   ./scripts/reextract-documents.ts --project=<name|id> --path=14jun --apply
//   ./scripts/reextract-documents.ts --project=<name|id> --document=<uuid> --apply
//
// re-imports each selected document: re-downloads it, re-converts it, and re-extracts only when the converted
// content actually changed. a document whose markdown is byte-identical costs nothing but a metadata refresh,
// so a broad selection is safe - the conversion result decides what gets paid for.
//
// --extract-only re-runs extraction against the content already stored, skipping the download and the checksum gate.
// that is the mode to use when the extraction itself changed (a prompt or reasoning-effort change) rather than the
// conversion, since unchanged content would otherwise be skipped.
//
// defaults to a dry run; pass --apply to write.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const argumentValue = (name: string): string | undefined =>
  process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(`--${name}=`.length);

const projectArgument = argumentValue("project");
const pathArgument = argumentValue("path");
const typeArgument = argumentValue("type");
const documentArgument = argumentValue("document");
const limitArgument = Number(argumentValue("limit") ?? "0");
const concurrency = Math.max(1, Number(argumentValue("concurrency") ?? "1"));
const apply = process.argv.includes("--apply");
const extractOnly = process.argv.includes("--extract-only");

const mapWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  limit: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> => {
  const results: TResult[] = [];
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);

  return results;
};

void (async () => {
  const logger = new Logger("ReextractDocuments");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "warn", "error"] });

  try {
    const prisma = app.get(PrismaService);
    // resolving IndexingService also realizes its forwardRef cycle (keeps the import above from being elided)
    const indexingService = app.get(IndexingService);
    const projectDocumentService = app.get(ProjectDocumentService);

    let project: { id: string; name: string } | null;

    if (projectArgument) {
      const where = UUID_PATTERN.test(projectArgument) ? { id: projectArgument } : { name: projectArgument };
      project = await prisma.project.findFirst({ where, select: { id: true, name: true } });
    } else {
      project = await prisma.project.findFirst({ select: { id: true, name: true } });
    }

    if (!project) {
      logger.error(`No project matched ${projectArgument ?? "(only project)"}`);
      process.exit(1);
    }

    const documents = await prisma.projectDocument.findMany({
      where: {
        projectId: project.id,
        ...(documentArgument ? { id: documentArgument } : {}),
        ...(pathArgument ? { path: { contains: pathArgument, mode: "insensitive" as const } } : {}),
        ...(typeArgument ? { contentType: typeArgument } : {}),
      },
      orderBy: { path: "asc" },
      ...(limitArgument > 0 ? { take: limitArgument } : {}),
    });

    logger.log(`Project ${project.name}: ${documents.length} document(s) selected`);

    for (const document of documents) {
      logger.log(`  ${document.contentType}\t${document.path}`);
    }

    if (!apply) {
      logger.log(
        `dry run - pass --apply to ${extractOnly ? "re-extract" : "re-import"} these documents`,
      );

      return;
    }

    let reextracted = 0;
    let unchanged = 0;
    let failed = 0;

    await mapWithConcurrency(documents, concurrency, async (document) => {
      const checksumBefore = document.checksum;

      try {
        // extract-only re-runs the pipeline over stored content, so there is no checksum to compare against
        if (extractOnly) {
          const processed = await indexingService.projectDocumentProcess(document.id);

          if (processed) {
            reextracted += 1;
          } else {
            failed += 1;
          }

          return;
        }

        const updated = await projectDocumentService.importProjectDocument(document);

        if (updated.checksum === checksumBefore) {
          unchanged += 1;
        } else {
          reextracted += 1;
        }
      } catch (error) {
        failed += 1;
        logger.error(`Failed to re-import ${document.path}`, error);
      }
    });

    logger.log(`Re-extracted ${reextracted}, unchanged ${unchanged}, failed ${failed}`);
  } finally {
    await app.close();
  }
})();
