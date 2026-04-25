import { IsDivisibleBy, IsNegative, IsPositive, Max, Min } from "class-validator";
import { createLocaleValidationOptions } from "../nest/locale-validation-options";
import { IsNegativeLc, IsPositiveLc, MaxLc, MinLc, isDivisibleByLc } from "./number-lc.decorator";

jest.mock("class-validator");
jest.mock("src/plugins/locale/locale");
jest.mock("src/plugins/locale/nest/locale-validation-options");

describe("number-lc.decorator", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (createLocaleValidationOptions as jest.Mock).mockReturnValue({ options: "blah" });
  });

  it("isDivisibleByLc() must create validation options and call the decorator", () => {
    isDivisibleByLc(2, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [2],
      defaultMessage: "validation.isDivisibleBy",
      validationOptions: { each: true },
    });
    expect(IsDivisibleBy).toHaveBeenCalledWith(2, { options: "blah" });
  });

  it("IsNegativeLc() must create validation options and call the decorator", () => {
    IsNegativeLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isNegative",
      validationOptions: { each: true },
    });
    expect(IsNegative).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsPositiveLc() must create validation options and call the decorator", () => {
    IsPositiveLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isPositive",
      validationOptions: { each: true },
    });
    expect(IsPositive).toHaveBeenCalledWith({ options: "blah" });
  });

  it("MaxLc() must create validation options and call the decorator", () => {
    MaxLc(2, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [2],
      defaultMessage: "validation.max",
      validationOptions: { each: true },
    });
    expect(Max).toHaveBeenCalledWith(2, { options: "blah" });
  });

  it("MinLc() must create validation options and call the decorator", () => {
    MinLc(2, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [2],
      defaultMessage: "validation.min",
      validationOptions: { each: true },
    });
    expect(Min).toHaveBeenCalledWith(2, { options: "blah" });
  });
});
