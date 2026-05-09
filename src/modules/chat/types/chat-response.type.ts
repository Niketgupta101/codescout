import { AgentResponse } from "src/modules/agent/types/agent-response.type";

// chat layer wraps the raw agent response with the persisted message id from conversations
// extending AgentResponse keeps the token-usage + tool-call shapes in lockstep without duplication
export type ChatResponse = AgentResponse & {
  messageId?: string;
};
