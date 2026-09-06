-- an action item's qualifying condition is a tracked deliverable, not an attribution. a task list or tracker
-- row records real work without naming anyone, so owner becomes optional rather than a gate.
ALTER TABLE "ProjectDocumentActionItem" ALTER COLUMN "owner" DROP NOT NULL;
