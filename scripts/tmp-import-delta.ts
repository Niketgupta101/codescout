import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PROJECT_ID = "80648fc0-2318-4791-8141-7875443d9be3";
const IMPORT_STARTED_AT = new Date("2026-09-27T09:03:16.493Z");

const main = async () => {
  const total = await prisma.projectDocument.count({ where: { projectId: PROJECT_ID } });
  const createdThisRun = await prisma.projectDocument.count({
    where: { projectId: PROJECT_ID, createdAt: { gte: IMPORT_STARTED_AT } },
  });
  const updatedThisRun = await prisma.projectDocument.count({
    where: { projectId: PROJECT_ID, createdAt: { lt: IMPORT_STARTED_AT }, updatedAt: { gte: IMPORT_STARTED_AT } },
  });

  console.log({ total, createdThisRun, reextractedThisRun: updatedThisRun });

  const sample = await prisma.projectDocument.findMany({
    where: { projectId: PROJECT_ID, createdAt: { gte: IMPORT_STARTED_AT } },
    select: { path: true },
    take: 12,
    orderBy: { path: "asc" },
  });
  console.log("new paths:", sample.map((document) => document.path));
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
