import { Injectable, Logger } from "@nestjs/common";
import * as path from "path";
import { MarkItDown } from "markitdown-ts";
import * as XLSX from "xlsx";
import { MARKITDOWN_SUPPORTED_EXTENSIONS, MARKITDOWN_SUPPORTED_MIME_TYPES } from "./markitdown.constants";
import type { MarkitdownResult } from "./types/markitdown-result.type";

const WORKBOOK_EXTENSION = ".xlsx";
// a spreadsheet date cell stores an offset, not an ordering, and a default workbook renders 1 June as "6/1/26".
// date inference is told to read an ambiguous numeric date day-first, which turns that into 6 January, so the
// ordering the cell actually carries is formatted iso here rather than left for a prompt to guess
const WORKBOOK_DATE_FORMAT = "yyyy-mm-dd";

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
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, dateNF: WORKBOOK_DATE_FORMAT });
    const sections: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];

      // an empty sheet has no range, and markitdown skips those rather than emitting a bare heading
      if (!sheet["!ref"]) {
        continue;
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
