import { AgentResponseToolCall } from "./agent-response-tool-call.type";

export type AgentResponse = {
  answer: string;
  toolCalls: AgentResponseToolCall[];
  iterations: number;
  durationMs: number;
};
