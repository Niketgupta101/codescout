#!/usr/bin/env -S NODE_PATH=. TS_NODE_PROJECT=./tsconfig.json TS_NODE_FILES=true node -r ts-node/register -r tsconfig-paths/register

import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
// imported to force the indexing<->repositories forwardRef cycle to load early; importing project-reconcile before
// indexing in a standalone ts-node context otherwise triggers a module-not-found during app bootstrap
import { IndexingService } from "../src/modules/indexing/indexing.service";
import { ProjectReconcileService } from "../src/modules/project-reconcile/project-reconcile.service";

// usage (run via the shebang so tsconfig-paths resolves the src/* imports):
//   ./scripts/reconcile-project.ts --project=<name|id>
//
// runs the same canonicalization the projectReconcile tool runs - topics and action items are folded into their
// canonical rows - but locally, so batch-level logs and any truncated or fallback grouping response are visible.
// skips statement threading (scripts/thread-statements.ts) and action-item resolution.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectFromArgv = process.argv.find((argument) => argument.startsWith("--project="))?.slice("--project=".length);

void (async () => {
  const logger = new Logger("ReconcileProject");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "warn", "error"] });

  try {
    const prisma = app.get(PrismaService);
    // resolve IndexingService too so its forwardRef cycle is realized (keeps the import above from being elided)
    app.get(IndexingService);
    const projectReconcileService = app.get(ProjectReconcileService);

    let project: { id: string; name: string } | null;

    if (projectFromArgv) {
      const where = UUID_PATTERN.test(projectFromArgv) ? { id: projectFromArgv } : { name: projectFromArgv };
      project = await prisma.project.findFirst({ where, select: { id: true, name: true } });
    } else {
      project = await prisma.project.findFirst({ select: { id: true, name: true } });
    }

    if (!project) {
      logger.error(`No project matched ${projectFromArgv ?? "(only project)"}`);
      process.exit(1);
    }

    const startedAt = Date.now();
    logger.log(`Canonicalizing project ${project.name}`);

    const result = await projectReconcileService.canonicalize(project.id);

    logger.log(`Done in ${((Date.now() - startedAt) / 60000).toFixed(1)} min: ${JSON.stringify(result)}`);
  } finally {
    await app.close();
  }
})();
