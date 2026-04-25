import { createHash, verifyHash } from "./hash.util";

describe("hash.util", () => {
  describe("createHash", () => {
    it("must return a hashed value", async () => {
      expect((await createHash("some text")).length).not.toStrictEqual(0);
    });
  });

  describe("verifyHash", () => {
    it("must return true if values match", async () => {
      const hash = await createHash("some text");
      expect(await verifyHash(hash, "some text")).toStrictEqual(true);
    });

    it("must return false if values do not match", async () => {
      const hash = await createHash("some text");
      expect(await verifyHash(hash, "other text")).toStrictEqual(false);
    });
  });
});
