import { randomBytes, randomInt } from "crypto";

export const randomLargeId = () => randomBytes(64).toString("base64url");

export const randomToken = () => randomBytes(128).toString("base64url");

export const randomOtp = () => randomInt(1e5, 1e6).toString();
