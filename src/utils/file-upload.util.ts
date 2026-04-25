import { BadRequestException } from "@nestjs/common";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { promises as fs } from "fs";
import { v4 as uuidv4 } from "uuid";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";

export type UploadedFileInfo = {
  path: string;
  originalName: string;
  destination: string;
  extension: string;
};

export type FileUploadConfig = {
  maxFiles?: number;
  allowedExtensions: string[];
  maxFileSize?: number;
};

export function createFileUploadOptions(config: FileUploadConfig): MulterOptions {
  return {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const tempDir = join(process.cwd(), "temp", uuidv4());
        fs.mkdir(tempDir, { recursive: true })
          .then(() => cb(null, tempDir))
          .catch((error: unknown) => cb(error as Error, ""));
      },
      filename: (_req, file, cb) => {
        const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
        cb(null, uniqueName);
      },
    }),
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      if (config.allowedExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new BadRequestException(`Invalid file type. Allowed: ${config.allowedExtensions.join(", ")}`), false);
      }
    },
    limits: {
      fileSize: config.maxFileSize ?? 10 * 1024 * 1024, // 10MB
      files: config.maxFiles ?? 10,
    },
  };
}

export function getTempDirectories(files: Express.Multer.File[]): Set<string> {
  const tempDirs = new Set<string>();
  for (const file of files) {
    tempDirs.add(file.destination);
  }
  return tempDirs;
}

export async function cleanupTempDirectories(tempDirs: Set<string>): Promise<void> {
  const cleanupPromises = Array.from(tempDirs).map(async (dir) => {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to clean up temp directory ${dir}:`, error);
    }
  });

  await Promise.all(cleanupPromises);
}

export function mapUploadedFiles(files: Express.Multer.File[]): UploadedFileInfo[] {
  return files.map((file) => ({
    path: file.path,
    originalName: file.originalname,
    destination: file.destination,
    extension: extname(file.originalname).toLowerCase(),
  }));
}
