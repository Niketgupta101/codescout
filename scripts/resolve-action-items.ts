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
//   ./scripts/resolve-action-items.ts --project=<name|id>            # dry run, writes nothing
//   ./scripts/resolve-action-items.ts --project=<name|id> --apply
//   ./scripts/resolve-action-items.ts --project=<name|id> --apply --force
//
// resolves canonical action-item statuses from decisive later-document evidence. only ever sets done, and only on a
// mechanically verified verbatim quote. debug logging is on so each item's candidate distances are visible - that is
// what the distance threshold and candidate limit should be re-set from.
// defaults to a dry run; pass --apply to write.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectFromArgv = process.argv.find((argument) => argument.startsWith("--project="))?.slice("--project=".length);
const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");

void (async () => {
  const logger = new Logger("ResolveActionItems");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error", "debug"],
  });

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

    logger.log(`${apply ? "Resolving" : "Dry-running resolution for"} project ${project.name}${force ? " (force)" : ""}`);

    const result = await projectReconcileService.resolveActionItemStatuses(project.id, { force, dryRun: !apply });

    logger.log(`Result: ${JSON.stringify(result)}`);
  } finally {
    await app.close();
  }
})();
