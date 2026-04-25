import { Request } from "express";

export type AccessUserFromRequestFunction<TUser extends { id: string }> = (request: Request) => TUser | undefined;
