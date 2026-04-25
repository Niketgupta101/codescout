import { pickModifiedKeys } from "./object.util";

describe("object.util", () => {
  describe("pickModifiedKeys", () => {
    it("must return only defined and modified keys", async () => {
      expect(
        pickModifiedKeys<object, object>(
          {
            undefined1: undefined,
            undefined2: null,
            null1: null,
            null2: undefined,
            boolean1: true,
            boolean2: true,
            number1: 1,
            number2: 3,
            string1: "1",
            string2: "3",
            object1: {
              key: "1",
              array: [{ nestedKey: "value1" }],
            },
            object2: {
              key: "3",
              array: [{ nestedKey: "value2" }],
            },
            object3: {
              key: "3",
              array: [{ nestedKey: "value4" }],
            },
            array1: [1, { nestedKey: "value1" }],
            array2: [3, { nestedKey: "value2" }],
            array3: [3, { nestedKey: "value4" }],
          },
          {
            undefined1: undefined,
            undefined2: undefined,
            null1: null,
            null2: null,
            boolean1: true,
            boolean2: false,
            number1: 1,
            number2: 2,
            string1: "1",
            string2: "2",
            object1: {
              key: "1",
              array: [{ nestedKey: "value1" }],
            },
            object2: {
              key: "2",
              array: [{ nestedKey: "value2" }],
            },
            object3: {
              key: "3",
              array: [{ nestedKey: "value3" }],
            },
            array1: [1, { nestedKey: "value1" }],
            array2: [2, { nestedKey: "value2" }],
            array3: [3, { nestedKey: "value3" }],
          },
        ),
      ).toStrictEqual({
        undefined2: null,
        boolean2: true,
        number2: 3,
        string2: "3",
        object2: {
          key: "3",
          array: [{ nestedKey: "value2" }],
        },
        object3: {
          key: "3",
          array: [{ nestedKey: "value4" }],
        },
        array2: [3, { nestedKey: "value2" }],
        array3: [3, { nestedKey: "value4" }],
      });
    });

    it("must return undefined if no keys are modified", async () => {
      expect(
        pickModifiedKeys(
          {
            undefined1: undefined,
            undefined2: undefined,
            null1: null,
            null2: null,
            boolean1: true,
            boolean2: false,
            number1: 1,
            number2: 2,
            string1: "1",
            string2: "2",
            object1: {
              key: "1",
              array: [{ nestedKey: "value1" }],
            },
            object2: {
              key: "2",
              array: [{ nestedKey: "value2" }],
            },
            object3: {
              key: "3",
              array: [{ nestedKey: "value3" }],
            },
            array1: [1, { nestedKey: "value1" }],
            array2: [2, { nestedKey: "value2" }],
            array3: [3, { nestedKey: "value3" }],
          },
          {
            undefined1: undefined,
            undefined2: undefined,
            null1: null,
            null2: null,
            boolean1: true,
            boolean2: false,
            number1: 1,
            number2: 2,
            string1: "1",
            string2: "2",
            object1: {
              key: "1",
              array: [{ nestedKey: "value1" }],
            },
            object2: {
              key: "2",
              array: [{ nestedKey: "value2" }],
            },
            object3: {
              key: "3",
              array: [{ nestedKey: "value3" }],
            },
            array1: [1, { nestedKey: "value1" }],
            array2: [2, { nestedKey: "value2" }],
            array3: [3, { nestedKey: "value3" }],
          },
        ),
      ).toStrictEqual(undefined);
    });
  });
});
