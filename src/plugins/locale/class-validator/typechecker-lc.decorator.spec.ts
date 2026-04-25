import { IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsNumber, IsObject, IsString } from "class-validator";
import { createLocaleValidationOptions } from "../nest/locale-validation-options";
import {
  IsArrayLc,
  IsBooleanLc,
  IsDateLc,
  IsEnumLc,
  IsIntLc,
  IsNumberLc,
  IsObjectLc,
  IsStringLc,
} from "./typechecker-lc.decorator";

jest.mock("class-validator");
jest.mock("src/plugins/locale/locale");
jest.mock("src/plugins/locale/nest/locale-validation-options");

describe("typechecker-lc.decorator", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (createLocaleValidationOptions as jest.Mock).mockReturnValue({ options: "blah" });
  });

  it("IsArrayLc() must create validation options and call the decorator", () => {
    IsArrayLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isArray",
      validationOptions: { each: true },
    });
    expect(IsArray).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsBooleanLc() must create validation options and call the decorator", () => {
    IsBooleanLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isBoolean",
      validationOptions: { each: true },
    });
    expect(IsBoolean).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsDateLc() must create validation options and call the decorator", () => {
    IsDateLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isDate",
      validationOptions: { each: true },
    });
    expect(IsDate).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsEnumLc() must create validation options and call the decorator", () => {
    enum Test {
      hello,
      world,
      bye = "bye",
    }
    IsEnumLc(Test, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [Test, [0, 1, "bye"]],
      defaultMessage: "validation.isEnum",
      validationOptions: { each: true },
    });
    expect(IsEnum).toHaveBeenCalledWith(Test, { options: "blah" });
  });

  it("IsIntLc() must create validation options and call the decorator", () => {
    IsIntLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isInt",
      validationOptions: { each: true },
    });
    expect(IsInt).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsNumberLc() must create validation options and call the decorator", () => {
    IsNumberLc({ allowInfinity: true }, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [{ allowInfinity: true }],
      defaultMessage: "validation.isNumber",
      validationOptions: { each: true },
    });
    expect(IsNumber).toHaveBeenCalledWith({ allowInfinity: true }, { options: "blah" });
  });

  it("IsObjectLc() must create validation options and call the decorator", () => {
    IsObjectLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isObject",
      validationOptions: { each: true },
    });
    expect(IsObject).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsStringLc() must create validation options and call the decorator", () => {
    IsStringLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isString",
      validationOptions: { each: true },
    });
    expect(IsString).toHaveBeenCalledWith({ options: "blah" });
  });
});
