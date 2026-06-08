import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { VersioningType } from "@nestjs/common";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import expressBasicAuth from "express-basic-auth";
import { AppLogger } from "./providers/app-logger.service";

export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // for webhook signature verification
    bufferLogs: true,
  });

  app.useLogger(app.get(AppLogger));
  app.set("trust proxy", 1); // trust first proxy

  // use extended query parser to parse arrays correctly
  // see https://docs.nestjs.com/migration-guide#query-parameters-parsing
  app.set("query parser", "extended");

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  const allowedOrigins = (process.env.CORS_ORIGINS_ALLOWED ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // no-origin requests (MCP clients, server-to-server, curl) bypass the allowlist
      if (!origin) {
        return callback(null, true);
      }

      // browser requests must match a configured origin; reject otherwise to avoid CSRF + credential theft
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    // browser-based mcp clients must read the oauth challenge header to begin discovery
    exposedHeaders: ["WWW-Authenticate"],
  });

  app.enableShutdownHooks();

  app.use(cookieParser());
  app.use(compression());
  app.use(helmet());

  // openapi docs
  if (process.env.OPENAPI_ENABLED === "true") {
    // basic auth for openapi docs
    if (process.env.OPENAPI_USERNAME || process.env.OPENAPI_PASSWORD) {
      if (!process.env.OPENAPI_USERNAME || !process.env.OPENAPI_PASSWORD) {
        throw new Error("Both env variables OPENAPI_USERNAME and OPENAPI_PASSWORD must be set");
      }

      app.use(
        ["/openapi", "/openapi-json"],
        expressBasicAuth({
          challenge: true,
          users: {
            [process.env.OPENAPI_USERNAME]: process.env.OPENAPI_PASSWORD,
          },
        }),
      );
    }

    // setup openapi docs
    const config = new DocumentBuilder()
      .setTitle("Code Chat API")
      .setDescription("Code Chat API endpoints")
      .setVersion("1.0")
      .addBearerAuth()
      .addSecurityRequirements("bearer")
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("openapi", app, document);
  }

  // render injects PORT; local dev falls back to 4000 per CLAUDE.md
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
