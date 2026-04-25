import { ThrottlerGuard } from "@nestjs/throttler";
import { Injectable } from "@nestjs/common";
import { Request } from "express";
import assert from "assert";

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  async getTracker(req: Request): Promise<string> {
    // value may be undefined if the socket is destroyed, e.g. if the client disconnected
    // see https://nodejs.org/api/net.html#socketremoteaddress
    assert(req.ip);
    return req.ips.length ? req.ips[0] : req.ip; // individualize IP extraction to meet your own needs
  }
}
