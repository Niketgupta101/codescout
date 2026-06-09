#!/usr/bin/env -S TS_NODE_COMPILER=ts-patch/compiler TS_NODE_PROJECT=./scripts/plugins/swagger-tsconfig.json TS_NODE_FILES=true node -r ts-node/register -r tsconfig-paths/register

// NOTE:
// to allow ts-node to read custom type definitions in src/definitions
// 1. `"include": ["../../src"]` has been added to ./scripts/plugins/swagger-tsconfig.json
// 2. `TS_NODE_FILES=true` has been added to the shebang line at the top of the file
// see: https://github.com/TypeStrong/ts-node/issues/1132
// see: https://stackoverflow.com/questions/51610583/ts-node-ignores-d-ts-files-while-tsc-successfully-compiles-the-project

import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "src/app.module";
import { NestFactory } from "@nestjs/core";
import { writeFile } from "fs/promises";
import { VersioningType } from "@nestjs/common";

const output = process.argv.find((it) => it.startsWith("--output="))?.slice("--output=".length);

if (!output) {
  throw new Error("--output= option required");
}

void (async () => {
  const app = await NestFactory.create(AppModule);

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  const config = new DocumentBuilder()
    .setTitle("Codescout API")
    .setDescription("Codescout REST API - projects, indexing, repositories, documents, conversations, messages")
    .setVersion("1.0")
    .addServer("http://localhost:4000", "Local dev")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT", in: "header" }, "bearer")
    .addSecurityRequirements("bearer")
    .build();

  const document = SwaggerModule.createDocument(app, config);

  await writeFile(output, JSON.stringify(document, null, 2), "utf-8");

  console.log(`OpenAPI spec written to ${output}`);

  await app.close();
})();
