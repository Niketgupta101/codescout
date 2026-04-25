import { HttpException, HttpServer, Inject, InternalServerErrorException, Logger, Optional } from "@nestjs/common";
import { errWithCause } from "pino-std-serializers";
import { Catch, ArgumentsHost } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { EnvService } from "src/modules/env/env.service";

export const EXCEPTION_FACTORY = "EXCEPTION_FACTORY";

export type HttpExceptionFactory = {
  createHttpException(exception: unknown, host: ArgumentsHost): HttpException;
};

export class DefaultHttpExceptionFactory implements HttpExceptionFactory {
  createHttpException(exception: unknown): HttpException {
    return exception instanceof HttpException
      ? exception
      : new InternalServerErrorException("Internal Server Error", { cause: exception });
  }
}

@Catch()
export class AppExceptionFilter extends BaseExceptionFilter {
  readonly logger = new Logger(AppExceptionFilter.name);

  @Inject()
  readonly envService: EnvService;

  constructor(
    @Optional()
    @Inject(EXCEPTION_FACTORY)
    readonly exceptionFactory: HttpExceptionFactory = new DefaultHttpExceptionFactory(),
    @Optional()
    readonly applicationRef?: HttpServer,
  ) {
    super(applicationRef);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    try {
      // create http exception
      const httpException = this.exceptionFactory.createHttpException(exception, host);

      // log exception
      const serializedException = errWithCause(httpException);
      const json = this.envService.get("PRETTY_PRINT_ERRORS")
        ? JSON.stringify(serializedException, null, 2)
        : JSON.stringify(serializedException);

      this.logger.error(json);

      // handle exception
      super.catch(httpException, host);
    } catch (error) {
      this.logger.error("Error handling exception", error, exception);
      super.catch(exception, host);
    }
  }
}
