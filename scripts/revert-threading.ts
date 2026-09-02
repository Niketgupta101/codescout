#!/usr/bin/env -S NODE_PATH=. TS_NODE_PROJECT=./tsconfig.json TS_NODE_FILES=true node -r ts-node/register -r tsconfig-paths/register

import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { IndexingService } from "../src/modules/indexing/indexing.service";

// usage:
//   ./scripts/revert-threading.ts --project=<name|id>
//   ./scripts/revert-threading.ts                       # if there is exactly one project

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectFromArgv = process.argv.find((arg) => arg.startsWith("--project="))?.slice("--project=".length);

void (async () => {
  const logger = new Logger("RevertThreading");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "warn", "error"] });

  try {
    const prisma = app.get(PrismaService);
    app.get(IndexingService);

    let project: { id: string; name: string } | null;

    if (projectFromArgv) {
      const where = UUID_PATTERN.test(projectFromArgv) ? { id: projectFromArgv } : { name: projectFromArgv };
      project = await prisma.project.findFirst({ where, select: { id: true, name: true } });
    } else {
      const onlyProject = await prisma.project.findFirst({ select: { id: true, name: true } });
      if (onlyProject === null) {
        logger.error("No projects found");
        process.exit(1);
      }
      project = onlyProject;
    }

    if (!project) {
      logger.error("Project not found");
      process.exit(1);
    }

    logger.log(`Reverting threading for project ${project.name} (${project.id})`);

    const count = await prisma.projectDocumentStatement.count({
      where: { projectId: project.id, OR: [{ replacesPriorStatementId: { not: null } }, { replacedByStatementId: { not: null } }] },
    });

    await prisma.$executeRaw`
      UPDATE "ProjectDocumentStatement"
      SET "replacesPriorStatementId" = NULL,
          "replacedByStatementId" = NULL,
          "validUntil" = NULL,
          "decisionStatus" = NULL,
          "implementationStatus" = NULL
      WHERE "projectId" = ${project.id}::uuid
      AND ("replacesPriorStatementId" IS NOT NULL OR "replacedByStatementId" IS NOT NULL)
    `;

    logger.log(`Reverted ${count} statements with threading links`);
  } catch (error) {
    logger.error("Revert failed", error);
  } finally {
    await app.close();
  }
})();
