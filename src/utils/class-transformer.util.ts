import { Expose, TransformFnParams } from "class-transformer";

// NOTE: Class transformer may cause node to crash if you attempt to serialize
// an object which contains internal classes such as http.ClientRequest, even if deeply nested.
// For e.g. an axios error object which contains the key value `request: http.ClientRequest`.

export const transformTrim =
  () =>
  ({ value }: Pick<TransformFnParams, "value">) =>
    typeof value === "string" ? value.trim() : (value as unknown);

// class-transformer enableImplicitConversion=true converts string "false" to boolean true
// see https://github.com/typestack/class-transformer/issues/626
export const transformBooleanString =
  () =>
  ({ obj, key }: Pick<TransformFnParams, "obj" | "key">) => {
    return (obj as Record<string, unknown>)[key] === "true"
      ? true
      : (obj as Record<string, unknown>)[key] === "false"
        ? false
        : // return untransformed value to allow class validator to fail the validation
          (obj as Record<string, unknown>)[key];
  };

export const transformNullString =
  () =>
  ({ value }: Pick<TransformFnParams, "value">) => {
    return value === "null" ? null : (value as unknown);
  };

// this is required because when a type is `Date | null`
// @Type(() => Date) is always applied first before `@Transform(transformNullString())`
// so `"null"` gets transformed into Invalid Date then gets passed to `transformNullString()`
export const transformDateOrNullString =
  () =>
  ({ value }: Pick<TransformFnParams, "value">) => {
    return value === "null" ? null : new Date(value as string);
  };

/**
 * Exposes all nested objects when strategy is set to `excludeAll`
 *
 * WARNING: This could cause node to crash if you attempt to serialize internal classes such as http.ClientRequest
 **/
export const transformExposeAllNested = () => {
  @Expose()
  class ExposeAllNested {}

  @Expose()
  class ExposeAllNestedMap extends Map<unknown, unknown> {}

  @Expose()
  class ExposeAllNestedSet extends Set<unknown> {}

  const transform = (source: unknown, visited: Set<unknown>): unknown => {
    // handle circular references
    if (typeof source === "object" && source !== null) {
      if (visited.has(source)) {
        return undefined;
      } else {
        visited.add(source);
      }
    }
    if (Array.isArray(source)) {
      return source.map((it) => transform(it, visited));
    } else if (source instanceof Set) {
      return new ExposeAllNestedSet([...source].map((it) => transform(it, visited)));
    } else if (source instanceof Map) {
      return new ExposeAllNestedMap([...source.entries()].map(([key, value]) => [key, transform(value, visited)]));
    } else if (typeof source === "object" && source !== null) {
      return Object.assign(
        new ExposeAllNested(),
        Object.fromEntries(Object.entries(source).map(([key, value]) => [key, transform(value, visited)])),
      );
    } else {
      return source;
    }
  };

  return ({ key, obj }: Pick<TransformFnParams, "key" | "obj">) =>
    transform((obj as Record<string, unknown>)[key], new Set());
};
