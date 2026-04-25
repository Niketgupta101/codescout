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

  app.enableCors({
    origin: true,
    credentials: true,
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
      .setTitle("Knowhub API")
      .setDescription("Knowhub API endpoints")
      .setVersion("1.0")
      .addBearerAuth()
      .addSecurityRequirements("bearer")
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("openapi", app, document);
  }

  await app.listen(4000);
}

void bootstrap();
