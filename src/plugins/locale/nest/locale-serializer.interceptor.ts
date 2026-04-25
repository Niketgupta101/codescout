import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map } from "rxjs";
import { localeParamFactory } from "./use-locale.decorator";
import { LocaleString } from "../locale-string";
import traverse from "traverse";
import { LocaleSerializable } from "./locale-serializable";

@Injectable()
export class LocaleSerializerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const locale = localeParamFactory(null, context);
    return next.handle().pipe(
      map((result: unknown) => {
        // localize locale serializables
        if (result instanceof LocaleSerializable) {
          traverse(result).forEach(function (value: unknown) {
            if (value instanceof LocaleString) {
              this.update(value.toString(locale));
            }
          });
        }
        return result;
      }),
    );
  }
}
