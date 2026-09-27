import { PrismaClient, ProjectDataOrigin } from "@prisma/client";
import { encode } from "gpt-tokenizer/cjs/encoding/o200k_base";

const prisma = new PrismaClient();
const PROJECT_ID = "80648fc0-2318-4791-8141-7875443d9be3";

// mirrors project-reconcile.service.ts
const TOPIC_GROUPING_BATCH_SIZE = 10;
const TOPIC_GROUPING_BATCH_TOKENS = 3000;
const ACTION_ITEM_GROUPING_BATCH_SIZE = 20;
const ACTION_ITEM_GROUPING_BATCH_TOKENS = 6000;

// measured on the 6 sep extraction run: 997,098 input tokens cost ~$1.00
const USD_PER_INPUT_TOKEN = 1.0 / 997098;

const buildBatches = (itemTokens: number[], maxCount: number, maxTokens: number): number[] => {
  const batchTokens: number[] = [];
  let currentCount = 0;
  let currentTokens = 0;

  for (const tokens of itemTokens) {
    const exceedsCount = currentCount >= maxCount;
    const exceedsTokens = currentCount > 0 && currentTokens + tokens > maxTokens;

    if (exceedsCount || exceedsTokens) {
      batchTokens.push(currentTokens);
      currentCount = 0;
      currentTokens = 0;
    }

    currentCount += 1;
    currentTokens += tokens;
  }

  if (currentCount > 0) {
    batchTokens.push(currentTokens);
  }

  return batchTokens;
};

const main = async () => {
  const documentTopics = await prisma.projectDocumentTopic.findMany({
    where: { projectId: PROJECT_ID, projectTopicId: null, suppressed: false, origin: { not: ProjectDataOrigin.human } },
    select: { name: true, statements: { select: { textDerived: true } } },
  });

  // topic grouping batches on distinct names, sized by the name plus its statements
  const statementsByName = new Map<string, string[]>();

  for (const documentTopic of documentTopics) {
    const existing = statementsByName.get(documentTopic.name) ?? [];
    statementsByName.set(documentTopic.name, [
      ...existing,
      ...documentTopic.statements.map((statement) => statement.textDerived),
    ]);
  }

  const topicTokens = [...statementsByName.entries()].map(
    ([name, statements]) => encode([name, ...statements].join("\n")).length,
  );

  const actionItems = await prisma.projectDocumentActionItem.findMany({
    where: {
      projectId: PROJECT_ID,
      projectActionItemId: null,
      suppressed: false,
      origin: { not: ProjectDataOrigin.human },
    },
    select: { description: true, owner: true },
  });
  const actionItemTokens = actionItems.map((item) => encode(`${item.owner ?? ""}\n${item.description}`).length);

  const statementCount = await prisma.projectDocumentStatement.count({
    where: { projectId: PROJECT_ID, suppressed: false, origin: { not: ProjectDataOrigin.human } },
  });
  const documentCount = await prisma.projectDocument.count({ where: { projectId: PROJECT_ID } });
  const canonicalTopicCount = await prisma.projectTopic.count({ where: { projectId: PROJECT_ID } });
  const canonicalActionItemCount = await prisma.projectActionItem.count({ where: { projectId: PROJECT_ID } });

  const topicBatches = buildBatches(topicTokens, TOPIC_GROUPING_BATCH_SIZE, TOPIC_GROUPING_BATCH_TOKENS);
  const actionItemBatches = buildBatches(
    actionItemTokens,
    ACTION_ITEM_GROUPING_BATCH_SIZE,
    ACTION_ITEM_GROUPING_BATCH_TOKENS,
  );

  // each batch also carries a system prompt and, for action items, the candidate anchors it judges against
  const SYSTEM_PROMPT_TOKENS = 500;
  const ANCHOR_TOKENS_PER_BATCH = Math.round(canonicalActionItemCount * 0.45) * 12;

  const topicInputTokens = topicBatches.reduce((sum, tokens) => sum + tokens + SYSTEM_PROMPT_TOKENS, 0);
  const actionItemInputTokens = actionItemBatches.reduce(
    (sum, tokens) => sum + tokens + SYSTEM_PROMPT_TOKENS + ANCHOR_TOKENS_PER_BATCH,
    0,
  );
  const totalInputTokens = topicInputTokens + actionItemInputTokens;

  console.log("corpus");
  console.log(`  documents                 ${documentCount}`);
  console.log(`  statements                ${statementCount}`);
  console.log(`  canonical topics          ${canonicalTopicCount}`);
  console.log(`  canonical action items    ${canonicalActionItemCount}`);
  console.log("unlinked work for reconcile");
  console.log(`  doc-topics                ${documentTopics.length} (${statementsByName.size} distinct names)`);
  console.log(`  doc action items          ${actionItems.length}`);
  console.log("projected llm batches");
  console.log(`  topic grouping            ${topicBatches.length}`);
  console.log(`  action item grouping      ${actionItemBatches.length}`);
  console.log(`  total                     ${topicBatches.length + actionItemBatches.length} (6 sep run: 95)`);
  console.log("projected input tokens");
  console.log(`  topic grouping            ${topicInputTokens.toLocaleString()}`);
  console.log(`  action item grouping      ${actionItemInputTokens.toLocaleString()}`);
  console.log(`  total                     ${totalInputTokens.toLocaleString()}`);
  console.log(`projected cost              $${(totalInputTokens * USD_PER_INPUT_TOKEN).toFixed(2)} (input only)`);
};

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
