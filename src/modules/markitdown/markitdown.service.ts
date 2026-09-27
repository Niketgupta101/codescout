import { Injectable, Logger } from "@nestjs/common";
import * as path from "path";
import { MarkItDown } from "markitdown-ts";
import * as XLSX from "xlsx";
import { MARKITDOWN_SUPPORTED_EXTENSIONS, MARKITDOWN_SUPPORTED_MIME_TYPES } from "./markitdown.constants";
import type { MarkitdownResult } from "./types/markitdown-result.type";

const WORKBOOK_EXTENSION = ".xlsx";
const WORKBOOK_DATE_FORMAT = "yyyy-mm-dd";

// xlsx exports its format library untyped, so it is narrowed once here to keep the conversion path typed
type WorkbookNumberFormatter = {
  format: (format: string, value: number) => string;
  is_date: (format: string) => boolean;
};

const workbookNumberFormatter = XLSX.SSF as WorkbookNumberFormatter;

@Injectable()
export class MarkitdownService {
  readonly logger = new Logger(MarkitdownService.name);
  readonly markItDown = new MarkItDown();

  /**
   * Whether markitdown can convert this file into markdown; everything else is skipped upstream.
   */
  isSupportedExtension(filename: string): boolean {
    const extension = path.extname(filename).toLowerCase();
    return MARKITDOWN_SUPPORTED_EXTENSIONS.includes(extension);
  }

  isSupportedMimeType(mimeType: string): boolean {
    const normalizedMimeType = mimeType.split(";", 1)[0].trim().toLowerCase();
    return MARKITDOWN_SUPPORTED_MIME_TYPES.includes(normalizedMimeType);
  }

  /**
   * Normalizes a source file into markdown; the extension routes the converter.
   * @param convertInput - the file buffer and its original filename
   * @returns The extracted title and markdown.
   */
  async convert(convertInput: { buffer: Buffer; filename: string }): Promise<MarkitdownResult> {
    const { buffer, filename } = convertInput;
    const fileExtension = path.extname(filename).toLowerCase();

    if (fileExtension === WORKBOOK_EXTENSION) {
      return this._convertWorkbook({ buffer, filename });
    }

    const result = await this.markItDown.convertBuffer(buffer, { file_extension: fileExtension });

    // markitdown returns null/undefined for formats it can't handle - caller quarantines and logs
    if (!result) {
      throw new Error(`markitdown could not convert ${filename} (${fileExtension})`);
    }

    return { title: result.title, markdown: result.markdown };
  }

  // mirrors markitdown's own workbook handling - one "## sheet name" section per populated sheet, so every tab
  // survives - but reads the cells as dates first so their ordering is not lost to the rendered locale
  async _convertWorkbook(convertWorkbookInput: { buffer: Buffer; filename: string }): Promise<MarkitdownResult> {
    const { buffer, filename } = convertWorkbookInput;
    // read serials rather than dates: cellDates rounds a serial to a moment ten seconds shy of midnight, which puts
    // the calendar day one behind in every timezone, and cellNF is what exposes each cell's own format string
    const workbook = XLSX.read(buffer, { type: "buffer", cellNF: true });
    const sections: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];

      // an empty sheet has no range, and markitdown skips those rather than emitting a bare heading
      if (!sheet["!ref"]) {
        continue;
      }

      // xlsx types a worksheet's cell lookup as any, so it is read through a typed view of the same object
      const cellsByAddress: Record<string, XLSX.CellObject | undefined> = sheet;

      for (const address of Object.keys(sheet)) {
        const cell = cellsByAddress[address];

        if (address.startsWith("!") || !cell) {
          continue;
        }

        const cellFormat = typeof cell.z === "string" ? cell.z : null;

        // a date cell carries an unambiguous serial plus a display format that may render it either way round, and
        // sheet_to_html prints the display text - so the text is replaced with iso rather than left to be guessed
        if (cell.t === "n" && typeof cell.v === "number" && cellFormat && workbookNumberFormatter.is_date(cellFormat)) {
          cell.w = workbookNumberFormatter.format(WORKBOOK_DATE_FORMAT, cell.v);
        }
      }

      const sheetHtml = XLSX.utils.sheet_to_html(sheet);
      const converted = await this.markItDown.convertBuffer(Buffer.from(sheetHtml, "utf8"), {
        file_extension: ".html",
      });

      if (!converted) {
        throw new Error(`markitdown could not convert sheet "${sheetName}" of ${filename}`);
      }

      sections.push(`## ${sheetName}\n${converted.markdown.trim()}`);
    }

    if (sections.length === 0) {
      throw new Error(`${filename} contains no populated sheet`);
    }

    return { title: workbook.Props?.Title ?? null, markdown: sections.join("\n\n") };
  }
}
