import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaClientOptions } from "@prisma/client/runtime/library";

const PRISMA_CLIENT_OPTIONS = {
  // // uncomment to enable logging
  // log: [
  //   { emit: "event", level: "query" },
  //   { emit: "stdout", level: "error" },
  //   { emit: "stdout", level: "info" },
  //   { emit: "stdout", level: "warn" },
  // ],
} satisfies PrismaClientOptions;

@Injectable()
export class PrismaService extends PrismaClient<typeof PRISMA_CLIENT_OPTIONS> implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super(PRISMA_CLIENT_OPTIONS);

    // // uncomment to enable logging
    // this.$on("query", (e) => {
    //   console.log("Query: ", e.query);
    //   console.log("Params: ", e.params);
    //   console.log("Duration: ", `${e.duration}ms`);
    // });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
