import {
  ArrayContains,
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotContains,
  ArrayNotEmpty,
  ArrayUnique,
} from "class-validator";
import { createLocaleValidationOptions } from "../nest/locale-validation-options";
import {
  ArrayContainsLc,
  ArrayMaxSizeLc,
  ArrayMinSizeLc,
  ArrayNotContainsLc,
  ArrayNotEmptyLc,
  ArrayUniqueLc,
} from "./array-lc.decorator";

jest.mock("class-validator");
jest.mock("src/plugins/locale/locale");
jest.mock("src/plugins/locale/nest/locale-validation-options");

describe("array-lc.decorator", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (createLocaleValidationOptions as jest.Mock).mockReturnValue({ options: "blah" });
  });

  it("ArrayContainsLc() must create validation options and call the decorator", () => {
    ArrayContainsLc([1, 2, "hello"], { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [[1, 2, "hello"]],
      defaultMessage: "validation.arrayContains",
      validationOptions: { each: true },
    });
    expect(ArrayContains).toHaveBeenCalledWith([1, 2, "hello"], { options: "blah" });
  });

  it("ArrayMaxSizeLc() must create validation options and call the decorator", () => {
    ArrayMaxSizeLc(4, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [4],
      defaultMessage: "validation.arrayMaxSize",
      validationOptions: { each: true },
    });
    expect(ArrayMaxSize).toHaveBeenCalledWith(4, { options: "blah" });
  });

  it("ArrayMinSizeLc() must create validation options and call the decorator", () => {
    ArrayMinSizeLc(2, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [2],
      defaultMessage: "validation.arrayMinSize",
      validationOptions: { each: true },
    });
    expect(ArrayMinSize).toHaveBeenCalledWith(2, { options: "blah" });
  });

  it("ArrayNotContainsLc() must create validation options and call the decorator", () => {
    ArrayNotContainsLc([1, 2, "hello"], { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [[1, 2, "hello"]],
      defaultMessage: "validation.arrayNotContains",
      validationOptions: { each: true },
    });
    expect(ArrayNotContains).toHaveBeenCalledWith([1, 2, "hello"], { options: "blah" });
  });

  it("ArrayNotEmptyLc() must create validation options and call the decorator", () => {
    ArrayNotEmptyLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.arrayNotEmpty",
      validationOptions: { each: true },
    });
    expect(ArrayNotEmpty).toHaveBeenCalledWith({ options: "blah" });
  });

  it("ArrayUniqueLc() must create validation options and call the decorator", () => {
    ArrayUniqueLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.arrayUnique",
      validationOptions: { each: true },
    });
    expect(ArrayUnique).toHaveBeenCalledWith({ options: "blah" });
  });

  it("ArrayUniqueLc() must create validation options and call the decorator with identifier", () => {
    const identifier = () => undefined;
    ArrayUniqueLc(identifier, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.arrayUnique",
      validationOptions: { each: true },
    });
    expect(ArrayUnique).toHaveBeenCalledWith(identifier, { options: "blah" });
  });
});
