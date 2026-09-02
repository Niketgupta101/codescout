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
//   ./scripts/thread-statements.ts --project=<name|id>
//   ./scripts/thread-statements.ts                       # if there is exactly one project
//
// runs only statement threading (supersession detection + graph resolution).
// skips canonicalization, action-item resolution, and reference resolution.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectFromArgv = process.argv.find((arg) => arg.startsWith("--project="))?.slice("--project=".length);

void (async () => {
  const logger = new Logger("ThreadStatements");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "warn", "error"] });

  try {
    const prisma = app.get(PrismaService);
    // resolve IndexingService too so its forwardRef cycle is realized (keeps the import above from being elided)
    app.get(IndexingService);
    const projectReconcileService = app.get(ProjectReconcileService);

    // resolve the project by id, by name, or fall back to the only project
    let project: { id: string; name: string } | null;

    if (projectFromArgv) {
      const where = UUID_PATTERN.test(projectFromArgv) ? { id: projectFromArgv } : { name: projectFromArgv };
      project = await prisma.project.findFirst({ where, select: { id: true, name: true } });
    } else {
      const onlyProject = await prisma.project.findFirst({ select: { id: true, name: true } });
      if (onlyProject === null) {
        const all = await prisma.project.findMany({ select: { id: true, name: true } });
        logger.error(`No --project=<id|name> provided and found ${all.length} projects. Available: ${all.map((p: { name: string }) => p.name).join(", ")}`);
        process.exit(1);
      }
      project = onlyProject;
    }

    if (!project) {
      logger.error("Project not found");
      process.exit(1);
    }

    logger.log(`Threading statements for project ${project.name} (${project.id})`);

    const startedAt = Date.now();
    const result = await projectReconcileService.threadStatements(project.id);
    const durationMs = Date.now() - startedAt;

    logger.log(`Result: ${JSON.stringify(result)}`);
    logger.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`);

    // show threading results - threading updates ProjectDocumentStatement directly
    const threadedStatements = await prisma.projectDocumentStatement.findMany({
      where: { projectId: project.id, replacesPriorStatementId: { not: null } },
      select: {
        id: true,
        replacesPriorStatementId: true,
        textDerived: true,
        replacedByStatement: {
          select: { id: true, textDerived: true, occurredAt: true },
        },
      },
      orderBy: { occurredAt: "desc" },
      take: 20,
    });

    logger.log(`\n=== Top ${Math.min(threadedStatements.length, 20)} supersession statements ===`);
    for (const stmt of threadedStatements) {
      const stmtText = stmt.textDerived?.slice(0, 60) ?? "(no text)";
      const replacedText = stmt.replacedByStatement?.textDerived?.slice(0, 60) ?? "(unknown)";
      logger.log(`"${stmtText}..." replaces "${replacedText}..."`);
    }

    const totalReplaced = await prisma.projectDocumentStatement.count({
      where: { projectId: project.id, replacesPriorStatementId: { not: null } },
    });
    logger.log(`\nTotal statements with supersession links: ${totalReplaced}`);
    logger.log(`Statements reconciled: ${result.statementsReconciled}`);
    logger.log(`Supersessions linked: ${result.supersessionsLinked}`);
  } catch (error) {
    logger.error("Threading failed", error);
  } finally {
    await app.close();
  }
})();
