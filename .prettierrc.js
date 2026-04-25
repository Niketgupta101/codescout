/** @type import("prettier").Config */
module.exports = {
  printWidth: 120,
  trailingComma: "all",
  endOfLine: "lf",
  overrides: [
    // allow lines to be longer in strings files
    {
      files: "src/**/*{.s,S}trings.ts",
      options: {
        printWidth: 1000,
      },
    },
  ],
};
