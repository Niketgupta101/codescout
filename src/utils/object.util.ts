import { isDeepStrictEqual } from "util";

export const pickModifiedKeys = <TNewValues extends object, TOldValues extends TNewValues>(
  newValues: TNewValues,
  oldValues: TOldValues,
): Partial<TNewValues> | undefined => {
  const result: Record<string, unknown> = {};

  // copy defined and modified keys into result
  for (const key of Object.keys(newValues)) {
    const newValue = (newValues as Record<string, unknown>)[key];
    const oldValue = (oldValues as Record<string, unknown>)[key];

    if (newValue !== undefined && !isDeepStrictEqual(newValue, oldValue)) {
      result[key] = newValue as Partial<TNewValues>[keyof TNewValues];
    }
  }

  // return undefined if result has no keys
  if (!Object.keys(result).length) {
    return;
  }

  return result as Partial<TNewValues>;
};
