/** Get union of deep index paths for T, to be used with DeepIndex<T, P>.
 * This is a modified version of https://stackoverflow.com/a/71097605/4274918
 *
 * Note that the array index is written using dot notation while addressing a nested property.
 * The paths `"prop" | "nestedObj" | "nestedArray" | "nestedObj.nestedProp" | "nestedArray.0" | "nestedArray.1" | "nestedArray.2" | "nestedArray.2.nestedArrayItemProp"`
 * are valid for the object:
 * ```ts
 * {
 *   prop: string;
 *   nestedObj: { nestedProp: string };
 *   nestedArray: [
 *     1,
 *     "string",
 *     {
 *       nestedArrayItemProp: number;
 *     },
 *   ];
 * }
 * ```
 */
export type DeepIndexPath<T> = T extends object
  ? T extends readonly unknown[]
    ? { [K in keyof T]: `${Exclude<K, symbol>}${"" | `.${DeepIndexPath<T[K]>}`}` }[number]
    : { [K in keyof T]: `${Exclude<K, symbol>}${"" | `.${DeepIndexPath<T[K]>}`}` }[keyof T]
  : never;

/** Get paths to leaf out of all deep index paths for T. */
export type DeepIndexPathToLeaf<T> = {
  [P in DeepIndexPath<T>]: DeepIndex<T, P> extends string ? P : never;
}[DeepIndexPath<T>];

/** From T, get type of deep index path P.
 * This is a modified version of https://stackoverflow.com/a/71097605/4274918
 *
 * Note that the array index is written using dot notation while addressing a nested property.
 * The paths `"prop" | "nestedObj" | "nestedArray" | "nestedObj.nestedProp" | "nestedArray.0" | "nestedArray.1" | "nestedArray.2" | "nestedArray.2.nestedArrayItemProp"`
 * are valid for the object:
 * ```ts
 * {
 *   prop: string;
 *   nestedObj: { nestedProp: string };
 *   nestedArray: [
 *     1,
 *     "string",
 *     {
 *       nestedArrayItemProp: number;
 *     },
 *   ];
 * }
 * ```
 */
export type DeepIndex<T, P extends DeepIndexPath<T>> = T extends object
  ? P extends `${infer Head}.${infer Tail}`
    ? Tail extends DeepIndexPath<DeepIndexPickHead<T, Head>>
      ? DeepIndex<DeepIndexPickHead<T, Head>, Tail>
      : never
    : DeepIndexPickHead<T, P>
  : never;

export type DeepIndexPickHead<T, K extends string> = K extends keyof T
  ? T[K]
  : K extends `${number}`
    ? number extends keyof T
      ? T[number]
      : never
    : never;

/** From T, get value of deep index path P */
export const deepIndex: {
  <T extends object, P extends DeepIndexPath<T>>(object: T, path: P): DeepIndex<T, P>;
  <T extends object, P extends string>(object: T, path: P): P extends DeepIndexPath<T> ? DeepIndex<T, P> : undefined;
  <T extends object | undefined, P extends string>(
    object: T,
    path: P,
  ): P extends DeepIndexPath<T> ? DeepIndex<T, P> : undefined;
} = <T extends object | undefined, P extends string>(
  object: T,
  path: P,
): P extends DeepIndexPath<T> ? DeepIndex<T, P> : undefined => {
  let value = object as Record<string, unknown> | string | undefined;
  for (const key of path.split(".")) {
    if (typeof value === "object") {
      value = value?.[key] as Record<string, unknown> | string | undefined;
    } else {
      value = undefined;
      break;
    }
  }
  return value as P extends DeepIndexPath<T> ? DeepIndex<T, P> : undefined;
};
