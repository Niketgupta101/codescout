import { Request } from "express";
import ms from "ms";

export const getBearerToken = (request: Request) => request.headers.authorization?.match(/^Bearer\s+(.*)$/i)?.[1];

export const getPasswordAttemptsTimeoutMs = ({ attempts }: { attempts: number }) =>
  attempts > 4 ? ms("1h") : attempts === 4 ? ms("15m") : attempts === 3 ? ms("5m") : 0; // no wait if less than 3 attempts
