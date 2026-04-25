import { Injectable, ValidationPipe } from "@nestjs/common";
import { localeValidationExceptionFactory } from "./plugins/locale/nest/locale-validation.exception";

@Injectable()
export class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      skipUndefinedProperties: false,
      skipNullProperties: false,
      skipMissingProperties: false,
      whitelist: true,
      exceptionFactory: localeValidationExceptionFactory,
    });
  }
}
