import { ClassSerializerContextOptions, SerializeOptions, applyDecorators } from "@nestjs/common";
import { ApiResponse, ApiResponseMetadata, ApiResponseOptions } from "@nestjs/swagger";

/**
 * decorator combines:
 * @SerializeOptions({ type: MyEntity })
 * @ApiResponse({ type: MyEntity })
 */
export const Entity = (serializeOptions: ClassSerializerContextOptions, apiResponseOptions?: ApiResponseOptions) =>
  applyDecorators(
    SerializeOptions(serializeOptions),
    ApiResponse({
      ...apiResponseOptions,
      type: (apiResponseOptions as ApiResponseMetadata | undefined)?.type ?? serializeOptions.type,
    }),
  );
