#!/usr/bin/env -S TS_NODE_PROJECT=./scripts/plugins/ts-node-tsconfig.json TS_NODE_FILES=true node -r ts-node/register -r tsconfig-paths/register

import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { IndexingService } from "../src/modules/indexing/indexing.service";
import { ParsersService } from "../src/modules/parsers/parsers.service";

// usage:
//   yarn ts-node scripts/backfill-symbol-line-numbers.ts                 # backfill every project
//   yarn ts-node scripts/backfill-symbol-line-numbers.ts --project=<id>  # backfill a single project
//
// idempotent: per code file, deletes existing symbols then re-runs the parser + extractor so new rows carry startLine/endLine

const projectIdFromArgv = process.argv.find((arg) => arg.startsWith("--project="))?.slice("--project=".length);

void (async () => {
  const logger = new Logger("BackfillSymbolLineNumbers");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "warn", "error"] });

  try {
    const prisma = app.get(PrismaService);
    const indexingService = app.get(IndexingService);
    const parsersService = app.get(ParsersService);

    const projects = projectIdFromArgv
      ? await prisma.project.findMany({ where: { id: projectIdFromArgv }, select: { id: true, name: true } })
      : await prisma.project.findMany({ select: { id: true, name: true } });

    if (projects.length === 0) {
      logger.warn(`No projects found${projectIdFromArgv ? ` matching id ${projectIdFromArgv}` : ""}`);
      return;
    }

    logger.log(`Backfilling ${projects.length} project(s)`);

    for (const project of projects) {
      const codeFiles = await prisma.codeFile.findMany({
        where: { projectId: project.id },
        select: { id: true, fullPath: true, rawContent: true, language: true },
      });

      logger.log(`[${project.name}] ${codeFiles.length} files`);

      let reprocessedFiles = 0;
      let skippedFiles = 0;
      let symbolsBefore = 0;
      let symbolsAfter = 0;

      for (const codeFile of codeFiles) {
        if (!codeFile.rawContent) {
          skippedFiles++;
          continue;
        }

        const existingCount = await prisma.symbol.count({ where: { codeFileId: codeFile.id } });
        symbolsBefore += existingCount;

        let parsed;
        try {
          parsed = await parsersService.parseDocument(codeFile.fullPath, codeFile.language ?? undefined, codeFile.rawContent);
        } catch (error) {
          // parsers throw for unsupported formats and malformed content; leaving existing symbols intact is safer than wiping them with no replacement
          logger.warn(`[${project.name}] ${codeFile.fullPath}: parse failed (${error instanceof Error ? error.message : String(error)}); leaving existing symbols intact`);
          skippedFiles++;
          continue;
        }

        await prisma.symbol.deleteMany({ where: { codeFileId: codeFile.id } });

        const inserted = await indexingService._extractSymbols(project.id, codeFile.id, parsed);
        symbolsAfter += inserted;
        reprocessedFiles++;
      }

      logger.log(`[${project.name}] reprocessed=${reprocessedFiles} skipped=${skippedFiles} symbols ${symbolsBefore} -> ${symbolsAfter}`);
    }

    logger.log("Done");
  } finally {
    await app.close();
  }
})();
