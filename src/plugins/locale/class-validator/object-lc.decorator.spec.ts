import { IsInstance, IsNotEmptyObject } from "class-validator";
import { createLocaleValidationOptions } from "../nest/locale-validation-options";
import { IsInstanceLc, IsNotEmptyObjectLc } from "./object-lc.decorator";

jest.mock("class-validator");
jest.mock("src/plugins/locale/locale");
jest.mock("src/plugins/locale/nest/locale-validation-options");
describe("object-lc.decorator", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (createLocaleValidationOptions as jest.Mock).mockReturnValue({ options: "blah" });
  });

  it("IsInstanceLc() must create validation options and call the decorator", () => {
    IsInstanceLc(Date, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [Date],
      defaultMessage: "validation.isInstance",
      validationOptions: { each: true },
    });
    expect(IsInstance).toHaveBeenCalledWith(Date, { options: "blah" });
  });

  it("IsNotEmptyObjectLc() must create validation options and call the decorator", () => {
    IsNotEmptyObjectLc({ nullable: true }, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [{ nullable: true }],
      defaultMessage: "validation.isNotEmptyObject",
      validationOptions: { each: true },
    });
    expect(IsNotEmptyObject).toHaveBeenCalledWith({ nullable: true }, { options: "blah" });
  });
});
