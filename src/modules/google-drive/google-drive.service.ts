import { Injectable, Logger } from "@nestjs/common";
import { google, drive_v3 } from "googleapis";
import * as path from "path";
import { EnvService } from "../env/env.service";
import type { GoogleDriveFile } from "./types/google-drive-file.type";
import type { GoogleServiceAccountCredentials } from "./types/google-service-account-credentials.type";

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
// a shortcut carries the target's name but none of its bytes, so it is resolved to the target before anything reads it
const DRIVE_SHORTCUT_MIME_TYPE = "application/vnd.google-apps.shortcut";
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
// drive file/folder ids are url-safe; reject anything else so an id can't break out of the search query
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

type DriveContentFormat = {
  extension: string;
  exportMimeType?: string;
};

const DRIVE_CONTENT_FORMATS: Record<string, DriveContentFormat> = {
  "text/markdown": { extension: ".md" },
  "text/plain": { extension: ".txt" },
  "text/csv": { extension: ".csv" },
  "text/html": { extension: ".html" },
  "application/xhtml+xml": { extension: ".html" },
  "application/pdf": { extension: ".pdf" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extension: ".docx" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { extension: ".xlsx" },
  "application/vnd.google-apps.document": {
    extension: ".docx",
    exportMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  "application/vnd.google-apps.spreadsheet": {
    extension: ".xlsx",
    exportMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  "application/vnd.google-apps.presentation": {
    extension: ".pdf",
    exportMimeType: "application/pdf",
  },
  "application/vnd.google-apps.drawing": {
    extension: ".pdf",
    exportMimeType: "application/pdf",
  },
};

export type DownloadedGoogleDriveFile = {
  buffer: Buffer;
  filename: string;
  contentType: string;
};

@Injectable()
export class GoogleDriveService {
  readonly logger = new Logger(GoogleDriveService.name);

  constructor(readonly envService: EnvService) {}

  /**
   * Recursively lists every file under a drive folder; folders are traversed, not emitted.
   * @param listFolderFilesInput - the root folder id to crawl
   * @returns A flat list of files, each carrying its path relative to the crawl root.
   */
  async listFolderFiles(listFolderFilesInput: { folderId: string }): Promise<GoogleDriveFile[]> {
    this._assertValidDriveId(listFolderFilesInput.folderId);
    const drive = this._getDriveClient();
    await this._assertFolderAccessible({ drive, folderId: listFolderFilesInput.folderId });

    return this._listFolderRecursive({ drive, folderId: listFolderFilesInput.folderId, parentPath: "" });
  }

  // a folder the service account cannot read lists as empty rather than failing, which an import would report as
  // "nothing changed". reading the folder itself does fail, so the caller learns it has to be shared
  async _assertFolderAccessible(assertFolderAccessibleInput: { drive: drive_v3.Drive; folderId: string }) {
    const { drive, folderId } = assertFolderAccessibleInput;

    try {
      await drive.files.get({ fileId: folderId, fields: "id, mimeType", supportsAllDrives: true });
    } catch (error) {
      this.logger.error(`Cannot access google drive folder ${folderId}`, error);

      throw new Error(
        `Google Drive folder ${folderId} is not accessible. Share it with ${this.getServiceAccountEmail()} and try again.`,
      );
    }
  }

  /** Downloads stored files directly and exports native Google Workspace files. */
  async downloadFile(downloadFileInput: {
    file: Pick<GoogleDriveFile, "id" | "name" | "mimeType">;
  }): Promise<DownloadedGoogleDriveFile> {
    const { file } = downloadFileInput;
    this._assertValidDriveId(file.id);
    const drive = this._getDriveClient();
    const normalizedMimeType = file.mimeType.split(";", 1)[0].trim().toLowerCase();
    const format = DRIVE_CONTENT_FORMATS[normalizedMimeType];
    const extension = format?.extension ?? path.extname(file.name).toLowerCase();

    if (!extension) {
      throw new Error(`cannot determine conversion extension for ${file.name} (${file.mimeType})`);
    }

    const response = format?.exportMimeType
      ? await drive.files.export({ fileId: file.id, mimeType: format.exportMimeType }, { responseType: "arraybuffer" })
      : await drive.files.get(
          { fileId: file.id, alt: "media", supportsAllDrives: true },
          { responseType: "arraybuffer" },
        );

    const filename = file.name.toLowerCase().endsWith(extension) ? file.name : `${file.name}${extension}`;

    return {
      buffer: Buffer.from(response.data as ArrayBuffer),
      filename,
      contentType: extension.slice(1),
    };
  }

  /**
   * Fetches a single file's metadata by id.
   * @param getFileInput - the file id to look up
   * @returns The file metadata; path falls back to the name since a single lookup has no crawl-relative path.
   */
  async getFile(getFileInput: { fileId: string }): Promise<GoogleDriveFile> {
    this._assertValidDriveId(getFileInput.fileId);
    const drive = this._getDriveClient();
    const { data }: { data: drive_v3.Schema$File } = await drive.files.get({
      fileId: getFileInput.fileId,
      fields: "id, name, mimeType, modifiedTime, size, parents",
      supportsAllDrives: true,
    });

    if (!data.id || !data.name) {
      throw new Error(`google drive file not found or malformed: ${getFileInput.fileId}`);
    }

    return {
      id: data.id,
      name: data.name,
      mimeType: data.mimeType ?? "",
      path: data.name,
      parentId: data.parents?.[0] ?? "",
      modifiedAt: data.modifiedTime ? new Date(data.modifiedTime) : null,
      sizeBytes: data.size ? Number(data.size) : null,
    };
  }

  // rejects ids that aren't url-safe so they can't break out of the drive search query
  _assertValidDriveId(id: string): void {
    if (!DRIVE_ID_PATTERN.test(id)) {
      throw new Error(`invalid google drive id: ${id}`);
    }
  }

  getServiceAccountEmail(): string {
    const serviceAccountKey = this.envService.get("GOOGLE_SERVICE_ACCOUNT_KEY_BASE64");
    if (!serviceAccountKey) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 is not configured");
    }
    const credentials = JSON.parse(
      Buffer.from(serviceAccountKey, "base64").toString("utf-8"),
    ) as GoogleServiceAccountCredentials;
    return credentials.client_email;
  }

  // builds a read-only drive client authenticated as the global service account
  _getDriveClient(): drive_v3.Drive {
    const serviceAccountKey = this.envService.get("GOOGLE_SERVICE_ACCOUNT_KEY_BASE64");

    if (!serviceAccountKey) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 is not configured");
    }

    // the key is stored base64-encoded to avoid newline/quoting issues with the private key in env
    let credentials: GoogleServiceAccountCredentials;
    try {
      credentials = JSON.parse(
        Buffer.from(serviceAccountKey, "base64").toString("utf-8"),
      ) as GoogleServiceAccountCredentials;
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 must be base64-encoded service account json");
    }

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [DRIVE_READONLY_SCOPE],
    });

    return google.drive({ version: "v3", auth });
  }

  // only what change detection needs; a target that cannot be read is reported as unknown rather than failing the listing
  async _fileMetadataGet(fileMetadataGetInput: {
    drive: drive_v3.Drive;
    fileId: string;
  }): Promise<{ modifiedAt: Date | null; sizeBytes: number | null }> {
    const { drive, fileId } = fileMetadataGetInput;

    try {
      const { data } = await drive.files.get({ fileId, fields: "modifiedTime, size", supportsAllDrives: true });

      return {
        modifiedAt: data.modifiedTime ? new Date(data.modifiedTime) : null,
        sizeBytes: data.size ? Number(data.size) : null,
      };
    } catch (error) {
      this.logger.warn(`Could not read Google Drive file ${fileId} metadata, treating it as changed`, error);

      return { modifiedAt: null, sizeBytes: null };
    }
  }

  async _listFolderRecursive(listFolderRecursiveInput: {
    drive: drive_v3.Drive;
    folderId: string;
    parentPath: string;
    visitedFolderIds?: Set<string>;
  }): Promise<GoogleDriveFile[]> {
    const { drive, folderId, parentPath } = listFolderRecursiveInput;
    // real folders form a tree, but a shortcut can point back at an ancestor - without this a cycle lists forever
    const visitedFolderIds = listFolderRecursiveInput.visitedFolderIds ?? new Set<string>();

    if (visitedFolderIds.has(folderId)) {
      this.logger.warn(`Google Drive folder ${folderId} is reachable from itself via a shortcut, so it is listed once`);
      return [];
    }

    visitedFolderIds.add(folderId);

    const files: GoogleDriveFile[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const { data }: { data: drive_v3.Schema$FileList } = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size, shortcutDetails(targetId, targetMimeType))",
        pageSize: 1000,
        pageToken,
        // without these a folder on a shared drive lists as empty instead of erroring, which reads as "nothing to import"
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const entries = data.files ?? [];

      for (const entry of entries) {
        // drive guarantees these on real entries; skip anything malformed rather than emit a partial file
        if (!entry.id || !entry.name) {
          continue;
        }

        const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        const isShortcut = entry.mimeType === DRIVE_SHORTCUT_MIME_TYPE;

        // a shortcut serves no bytes of its own, so everything downstream addresses the target instead: the target's id
        // is what the document stores, which is what makes the same file resolve to one document whether it is reached
        // through a shortcut, through its own folder, or through both
        const targetId = isShortcut ? entry.shortcutDetails?.targetId : entry.id;
        const targetMimeType = isShortcut ? entry.shortcutDetails?.targetMimeType : entry.mimeType;

        // a shortcut whose target was deleted keeps existing and resolves to nothing
        if (!targetId) {
          this.logger.warn(`Google Drive shortcut ${entryPath} has no target, so it is skipped`);
          continue;
        }

        if (targetMimeType === DRIVE_FOLDER_MIME_TYPE) {
          const nestedFiles = await this._listFolderRecursive({
            drive,
            folderId: targetId,
            parentPath: entryPath,
            visitedFolderIds,
          });
          files.push(...nestedFiles);
        } else {
          // a shortcut's own modifiedTime tracks the shortcut, not the file, so reusing it would leave an edited target
          // looking unchanged forever - the target's metadata is fetched instead, one call per shortcut
          const target = isShortcut ? await this._fileMetadataGet({ drive, fileId: targetId }) : null;

          files.push({
            id: targetId,
            // the name stays the shortcut's, since that is what a person sees and names the document in the folder
            name: entry.name,
            mimeType: targetMimeType ?? "",
            path: entryPath,
            parentId: folderId,
            modifiedAt: target ? target.modifiedAt : entry.modifiedTime ? new Date(entry.modifiedTime) : null,
            sizeBytes: target ? target.sizeBytes : entry.size ? Number(entry.size) : null,
          });
        }
      }

      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);

    return files;
  }
}
