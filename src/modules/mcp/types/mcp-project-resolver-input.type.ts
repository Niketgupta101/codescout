import { Actor } from "src/modules/actor/types/actor.type";

export type McpProjectResolverInput = {
  projectId?: string;
  gitRemoteUrl?: string;
  actor: Actor;
};
