import {
  Contains,
  IsAlpha,
  IsAlphanumeric,
  IsBase64,
  IsBooleanString,
  IsDataURI,
  IsDateString,
  IsEmail,
  IsFQDN,
  IsLowercase,
  IsNumberString,
  IsUUID,
  IsUppercase,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  MinLength,
  NotContains,
} from "class-validator";
import { createLocaleValidationOptions } from "../nest/locale-validation-options";
import {
  ContainsLc,
  IsAlphaLc,
  IsAlphanumericLc,
  IsBase64Lc,
  IsBooleanStringLc,
  IsDataURILc,
  IsDateStringLc,
  IsEmailLc,
  IsFQDNLc,
  IsLowercaseLc,
  IsNumberStringLc,
  IsUUIDLc,
  IsUppercaseLc,
  IsUrlLc,
  LengthLc,
  MatchesLc,
  MaxLengthLc,
  MinLengthLc,
  NotContainsLc,
} from "./string-lc.decorator";

jest.mock("class-validator");
jest.mock("src/plugins/locale/locale");
jest.mock("src/plugins/locale/nest/locale-validation-options");

describe("string-lc.decorator", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (createLocaleValidationOptions as jest.Mock).mockReturnValue({ options: "blah" });
  });

  it("IsEmailLc() must create validation options and call the decorator", () => {
    IsEmailLc({ blacklisted_chars: "+:" }, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [{ blacklisted_chars: "+:" }],
      defaultMessage: "validation.isEmail",
      validationOptions: { each: true },
    });
    expect(IsEmail).toHaveBeenCalledWith({ blacklisted_chars: "+:" }, { options: "blah" });
  });

  it("ContainsLc() must create validation options and call the decorator", () => {
    ContainsLc("seed", { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: ["seed"],
      defaultMessage: "validation.contains",
      validationOptions: { each: true },
    });
    expect(Contains).toHaveBeenCalledWith("seed", { options: "blah" });
  });

  it("IsAlphaLc() must create validation options and call the decorator", () => {
    IsAlphaLc("en-US", { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: ["en-US"],
      defaultMessage: "validation.isAlpha",
      validationOptions: { each: true },
    });
    expect(IsAlpha).toHaveBeenCalledWith("en-US", { options: "blah" });
  });

  it("IsAlphanumericLc() must create validation options and call the decorator", () => {
    IsAlphanumericLc("en-US", { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: ["en-US"],
      defaultMessage: "validation.isAlphanumeric",
      validationOptions: { each: true },
    });
    expect(IsAlphanumeric).toHaveBeenCalledWith("en-US", { options: "blah" });
  });

  it("IsBase64() must create validation options and call the decorator", () => {
    IsBase64Lc({ urlSafe: true }, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isBase64",
      validationOptions: { each: true },
    });
    expect(IsBase64).toHaveBeenCalledWith({ urlSafe: true }, { options: "blah" });
  });

  it("IsBooleanStringLc() must create validation options and call the decorator", () => {
    IsBooleanStringLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isBooleanString",
      validationOptions: { each: true },
    });
    expect(IsBooleanString).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsDataURILc() must create validation options and call the decorator", () => {
    IsDataURILc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isDataURI",
      validationOptions: { each: true },
    });
    expect(IsDataURI).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsDateStringLc() must create validation options and call the decorator", () => {
    IsDateStringLc({ strict: true }, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isDateString",
      validationOptions: { each: true },
    });
    expect(IsDateString).toHaveBeenCalledWith({ strict: true }, { options: "blah" });
  });

  it("IsFQDNLc() must create validation options and call the decorator", () => {
    IsFQDNLc({ require_tld: true }, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [{ require_tld: true }],
      defaultMessage: "validation.isFQDN",
      validationOptions: { each: true },
    });
    expect(IsFQDN).toHaveBeenCalledWith({ require_tld: true }, { options: "blah" });
  });

  it("IsLowercaseLc() must create validation options and call the decorator", () => {
    IsLowercaseLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isLowercase",
      validationOptions: { each: true },
    });
    expect(IsLowercase).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsUppercaseLc() must create validation options and call the decorator", () => {
    IsUppercaseLc({ each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      defaultMessage: "validation.isUppercase",
      validationOptions: { each: true },
    });
    expect(IsUppercase).toHaveBeenCalledWith({ options: "blah" });
  });

  it("IsNumberStringLc() must create validation options and call the decorator", () => {
    IsNumberStringLc({ no_symbols: true }, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [{ no_symbols: true }],
      defaultMessage: "validation.isNumberString",
      validationOptions: { each: true },
    });
    expect(IsNumberString).toHaveBeenCalledWith({ no_symbols: true }, { options: "blah" });
  });

  it("IsUUIDLc() must create validation options and call the decorator", () => {
    IsUUIDLc(4, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [4],
      defaultMessage: "validation.isUUID",
      validationOptions: { each: true },
    });
    expect(IsUUID).toHaveBeenCalledWith(4, { options: "blah" });
  });

  it("IsUrlLc() must create validation options and call the decorator", () => {
    IsUrlLc({ require_tld: true }, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [{ require_tld: true }],
      defaultMessage: "validation.isUrl",
      validationOptions: { each: true },
    });
    expect(IsUrl).toHaveBeenCalledWith({ require_tld: true }, { options: "blah" });
  });

  it("LengthLc() must create validation options and call the decorator", () => {
    LengthLc(1, 2, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [1, 2],
      defaultMessage: "validation.length",
      validationOptions: { each: true },
    });
    expect(Length).toHaveBeenCalledWith(1, 2, { options: "blah" });
  });

  it("MatchesLc() must create validation options with regex pattern and call the decorator", () => {
    MatchesLc(/abc/, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [/abc/],
      defaultMessage: "validation.matches",
      validationOptions: { each: true },
    });
    expect(Matches).toHaveBeenCalledWith(/abc/, { options: "blah" });
  });

  it("MatchesLc() must create validation options with string pattern and call the decorator", () => {
    MatchesLc("string", "", { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: ["string", ""],
      defaultMessage: "validation.matches",
      validationOptions: { each: true },
    });
    expect(Matches).toHaveBeenCalledWith("string", "", { options: "blah" });
  });

  it("MaxLengthLc() must create validation options and call the decorator", () => {
    MaxLengthLc(3, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [3],
      defaultMessage: "validation.maxLength",
      validationOptions: { each: true },
    });
    expect(MaxLength).toHaveBeenCalledWith(3, { options: "blah" });
  });

  it("MinLengthLc() must create validation options and call the decorator", () => {
    MinLengthLc(6, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [6],
      defaultMessage: "validation.minLength",
      validationOptions: { each: true },
    });
    expect(MinLength).toHaveBeenCalledWith(6, { options: "blah" });
  });

  it("NotContainsLc() must create validation options and call the decorator", () => {
    NotContainsLc("seed", { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: ["seed"],
      defaultMessage: "validation.notContains",
      validationOptions: { each: true },
    });
    expect(NotContains).toHaveBeenCalledWith("seed", { options: "blah" });
  });
});
