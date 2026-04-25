import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { Request, Response } from "express";
import morgan from "morgan";
import { PassThrough } from "stream";

@Injectable()
export class MorganMiddleware implements NestMiddleware {
  readonly logger = new Logger(MorganMiddleware.name);
  readonly stream = new PassThrough();
  readonly handler = morgan("tiny", { stream: this.stream });

  constructor() {
    this.stream.on("data", (chunk: Buffer) => {
      this.logger.log(chunk.toString("utf-8").trimEnd());
    });
  }

  use(req: Request, res: Response, next: () => void) {
    return this.handler(req, res, next);
  }
}
