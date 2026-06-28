import { Injectable, Logger } from "@nestjs/common";
import { google, drive_v3 } from "googleapis";
import { EnvService } from "../env/env.service";
import type { GoogleDriveFile } from "./types/google-drive-file.type";
import type { GoogleServiceAccountCredentials } from "./types/google-service-account-credentials.type";

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
// drive file/folder ids are url-safe; reject anything else so an id can't break out of the search query
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

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
    return this._listFolderRecursive({ drive, folderId: listFolderFilesInput.folderId, parentPath: "" });
  }

  /**
   * Downloads a drive file's raw bytes.
   * @param downloadFileInput - the file id to download
   * @returns The file content as a buffer.
   */
  async downloadFile(downloadFileInput: { fileId: string }): Promise<Buffer> {
    this._assertValidDriveId(downloadFileInput.fileId);
    const drive = this._getDriveClient();
    const response = await drive.files.get(
      { fileId: downloadFileInput.fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );

    return Buffer.from(response.data as ArrayBuffer);
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

  // builds a read-only drive client authenticated as the global service account
  _getDriveClient(): drive_v3.Drive {
    const serviceAccountKey = this.envService.get("GOOGLE_SERVICE_ACCOUNT_KEY");

    if (!serviceAccountKey) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not configured");
    }

    const credentials = JSON.parse(serviceAccountKey) as GoogleServiceAccountCredentials;
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [DRIVE_READONLY_SCOPE],
    });

    return google.drive({ version: "v3", auth });
  }

  async _listFolderRecursive(listFolderRecursiveInput: {
    drive: drive_v3.Drive;
    folderId: string;
    parentPath: string;
  }): Promise<GoogleDriveFile[]> {
    const { drive, folderId, parentPath } = listFolderRecursiveInput;
    const files: GoogleDriveFile[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const { data }: { data: drive_v3.Schema$FileList } = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
        pageSize: 1000,
        pageToken,
      });

      const entries = data.files ?? [];

      for (const entry of entries) {
        // drive guarantees these on real entries; skip anything malformed rather than emit a partial file
        if (!entry.id || !entry.name) {
          continue;
        }

        const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

        if (entry.mimeType === DRIVE_FOLDER_MIME_TYPE) {
          const nestedFiles = await this._listFolderRecursive({ drive, folderId: entry.id, parentPath: entryPath });
          files.push(...nestedFiles);
        } else {
          files.push({
            id: entry.id,
            name: entry.name,
            mimeType: entry.mimeType ?? "",
            path: entryPath,
            parentId: folderId,
            modifiedAt: entry.modifiedTime ? new Date(entry.modifiedTime) : null,
            sizeBytes: entry.size ? Number(entry.size) : null,
          });
        }
      }

      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);

    return files;
  }
}
