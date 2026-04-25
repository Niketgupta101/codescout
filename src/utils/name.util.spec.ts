import { formatName } from "./name.util";

describe("name.util", () => {
  describe("formatName", () => {
    it("must return full name", async () => {
      expect(formatName({ firstName: "User", lastName: "Name" })).toBe("User Name");
      expect(formatName({ firstName: "User", lastName: "" })).toBe("User");
      expect(formatName({ firstName: "", lastName: "Name" })).toBe("Name");
    });
  });
});
