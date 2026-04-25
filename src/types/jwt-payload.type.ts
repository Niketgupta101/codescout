export type JwtPayload =
  | { type: "authChallenge"; userId: string }
  | { type: "userPasswordResetLinkChallenge"; userId: string };
