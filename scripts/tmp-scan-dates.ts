import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PROJECT_ID = "80648fc0-2318-4791-8141-7875443d9be3";

// both components <= 12, so day-first and month-first give different real dates
const AMBIGUOUS = /\b(0?[1-9]|1[0-2])[/.](0?[1-9]|1[0-2])[/.](\d{2}|\d{4})\b/g;
// day > 12 proves the writer's convention
const DAY_FIRST_PROOF = /\b(1[3-9]|2\d|3[01])[/.](0?[1-9]|1[0-2])[/.](\d{2}|\d{4})\b/g;
const MONTH_FIRST_PROOF = /\b(0?[1-9]|1[0-2])[/.](1[3-9]|2\d|3[01])[/.](\d{2}|\d{4})\b/g;

const main = async () => {
  const documents = await prisma.projectDocument.findMany({
    where: { projectId: PROJECT_ID },
    select: { id: true, path: true, contentRaw: true },
  });

  let documentsWithAmbiguous = 0;
  let ambiguousTotal = 0;
  let dayFirstTotal = 0;
  let monthFirstTotal = 0;
  const affected: string[] = [];

  for (const document of documents) {
    const text = document.contentRaw ?? "";
    const ambiguous = (text.match(AMBIGUOUS) ?? []).length;
    dayFirstTotal += (text.match(DAY_FIRST_PROOF) ?? []).length;
    monthFirstTotal += (text.match(MONTH_FIRST_PROOF) ?? []).length;

    if (ambiguous > 0) {
      documentsWithAmbiguous += 1;
      ambiguousTotal += ambiguous;
      affected.push(`${ambiguous}\t${document.path}`);
    }
  }

  console.log(`documents                      ${documents.length}`);
  console.log(`documents with ambiguous date  ${documentsWithAmbiguous}`);
  console.log(`ambiguous date instances       ${ambiguousTotal}`);
  console.log(`day-first proofs (day>12)      ${dayFirstTotal}`);
  console.log(`month-first proofs (day>12)    ${monthFirstTotal}`);
  console.log("\ntop affected documents:");
  console.log(affected.sort((a, b) => Number(b.split("\t")[0]) - Number(a.split("\t")[0])).slice(0, 15).join("\n"));
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
