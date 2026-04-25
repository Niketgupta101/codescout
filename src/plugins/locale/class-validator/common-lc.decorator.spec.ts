import {
  Allow,
  Equals,
  IsDefined,
  IsEmpty,
  IsIn,
  IsNotEmpty,
  IsNotIn,
  IsOptional,
  NotEquals,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { createLocaleValidationOptions } from "../nest/locale-validation-options";
import {
  AllowLc,
  EqualsLc,
  IsDefinedLc,
  IsEmptyLc,
  IsInLc,
  IsNotEmptyLc,
  IsNotInLc,
  IsOptionalLc,
  NotEqualsLc,
  ValidateIfLc,
  ValidateNestedLc,
} from "./common-lc.decorator";

jest.mock("class-validator");
jest.mock("src/plugins/locale/locale");
jest.mock("src/plugins/locale/nest/locale-validation-options");

describe("common-lc.decorator", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (createLocaleValidationOptions as jest.Mock).mockReturnValue({ options: "blah" });
  });

  it("AllowLc() must create validation options and call the decorator", () => {
    AllowLc({ each: true });
    expect(Allow).toHaveBeenCalledWith({ each: true });
  });

  it("EqualsLc() must create validation options and call the decorator", () => {
    EqualsLc("test", { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: ["test"],
      defaultMessage: "validation.equals",
      validationOptions: { each: true },
    });
    expect(Equals).toHaveBeenCalledWith("test", { options: "blah" });
  });

  it("IsDefinedLc() must create validation options and call the decorator", () => {
    IsDefinedLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isDefined",
      validationOptions: { each: true },
    });
    expect(IsDefined).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsEmptyLc() must create validation options and call the decorator", () => {
    IsEmptyLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isEmpty",
      validationOptions: { each: true },
    });
    expect(IsEmpty).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsInLc() must create validation options and call the decorator", () => {
    IsInLc(["test"], { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [["test"]],
      defaultMessage: "validation.isIn",
      validationOptions: { each: true },
    });
    expect(IsIn).toHaveBeenCalledWith(["test"], { options: "blah" });
  });

  it("IsNotEmptyLc() must create validation options and call the decorator", () => {
    IsNotEmptyLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isNotEmpty",
      validationOptions: { each: true },
    });
    expect(IsNotEmpty).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsNotInLc() must create validation options and call the decorator", () => {
    IsNotInLc(["test"], { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [["test"]],
      defaultMessage: "validation.isNotIn",
      validationOptions: { each: true },
    });
    expect(IsNotIn).toHaveBeenCalledWith(["test"], { options: "blah" });
  });

  it("IsOptionalLc() must create validation options and call the decorator", () => {
    IsOptionalLc({ each: true });
    expect(IsOptional).toHaveBeenCalledWith({ each: true });
  });

  it("NotEqualsLc() must create validation options and call the decorator", () => {
    NotEqualsLc("test", { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: ["test"],
      defaultMessage: "validation.notEquals",
      validationOptions: { each: true },
    });
    expect(NotEquals).toHaveBeenCalledWith("test", { options: "blah" });
  });

  it("ValidateIfLc() must create validation options and call the decorator", () => {
    const pass = () => true;
    ValidateIfLc(pass, { each: true });
    expect(ValidateIf).toHaveBeenCalledWith(pass, { each: true });
  });

  it("ValidateNestedLc() must create validation options and call the decorator", () => {
    ValidateNestedLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.validateNested",
      validationOptions: { each: true },
    });
    expect(ValidateNested).toHaveBeenCalledWith({ options: "blah" });
  });
});
