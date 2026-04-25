// base metadata value types
export type MetadataValue = string | number | boolean | string[] | undefined;

// base metadata that any node can have
export type BaseNodeMetadata = {
  [key: string]: MetadataValue;
};

// user story metadata (for CSV/Jira imports)
export type StoryMetadata = BaseNodeMetadata & {
  storyId?: string;
  epicName?: string;
  userRole?: string; // "As a..."
  action?: string; // "I want to..."
  benefit?: string; // "So that..."
  acceptanceCriteria?: string[];
  priority?: "high" | "medium" | "low";
  estimatedPoints?: number;
};

// code-specific metadata
export type CodeMetadata = BaseNodeMetadata & {
  language: string;
  chunkType?: string; // function, method, class, interface, type, enum
  name?: string;
  functionName?: string;
  className?: string;
  methodName?: string;
  parameters?: string[]; // simplified as string array
  returnType?: string;
  isAsync?: boolean;
  isExported?: boolean;
  decorators?: string[];
  complexity?: string; // low, medium, high
  imports?: string[];
  jsDoc?: string;
  parentClass?: string;
  commitHash?: string;
  repoUrl?: string;
  githubLink?: string;
  startLine?: number;
  endLine?: number;
};

// union type for all metadata types
export type NodeMetadata = StoryMetadata | CodeMetadata | BaseNodeMetadata;
