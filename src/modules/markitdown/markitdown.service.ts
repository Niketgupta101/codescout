import { Injectable, Logger } from "@nestjs/common";
import * as path from "path";
import { MarkItDown } from "markitdown-ts";
import { MARKITDOWN_SUPPORTED_EXTENSIONS, MARKITDOWN_SUPPORTED_MIME_TYPES } from "./markitdown.constants";
import type { MarkitdownResult } from "./types/markitdown-result.type";

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

    const result = await this.markItDown.convertBuffer(buffer, { file_extension: fileExtension });

    // markitdown returns null/undefined for formats it can't handle - caller quarantines and logs
    if (!result) {
      throw new Error(`markitdown could not convert ${filename} (${fileExtension})`);
    }

    return { title: result.title, markdown: result.markdown };
  }
}
