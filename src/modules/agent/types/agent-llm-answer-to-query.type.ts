export type AgentLLMAnswerToQuery = {
  answer: string;
  details: string[];
  codeSnippets: {
    filePath: string;
    code: string;
  }[];
  showDetails: boolean;
  showCode: boolean;
};
