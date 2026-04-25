import { MaxDate, MinDate } from "class-validator";
import { createLocaleValidationOptions } from "../nest/locale-validation-options";
import { MaxDateLc, MinDateLc } from "./date-lc.decorator";

jest.mock("class-validator");
jest.mock("src/plugins/locale/locale");
jest.mock("src/plugins/locale/nest/locale-validation-options");

describe("date-lc.decorator", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (createLocaleValidationOptions as jest.Mock).mockReturnValue({ options: "blah" });
  });

  it("MaxDateLc() must create validation options and call the decorator", () => {
    const date = new Date();
    MaxDateLc(date, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [date],
      defaultMessage: "validation.maxDate",
      validationOptions: { each: true },
    });
    expect(MaxDate).toHaveBeenCalledWith(date, { options: "blah" });
  });

  it("MinDateLc() must create validation options and call the decorator", () => {
    const date = new Date();
    MinDateLc(date, { each: true });
    expect(createLocaleValidationOptions).toHaveBeenCalledWith({
      constraints: [date],
      defaultMessage: "validation.minDate",
      validationOptions: { each: true },
    });
    expect(MinDate).toHaveBeenCalledWith(date, { options: "blah" });
  });
});
