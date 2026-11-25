/** Google Drive API v3: liệt kê và tải ảnh chụp thật trong thư mục chủ quán chia sẻ. */
import type { FetchLike } from "../ai/providers";
import { GoogleApiError, googleFetch, googleJson, type GoogleAuth } from "./oauth";

export interface DriveImageFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: number;
  thumbnailLink?: string;
  webViewLink?: string;
  folderName?: string;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

/** Lấy ID thư mục từ mọi dạng link chủ quán hay dán. Trả null nếu không nhận ra. */
export function parseDriveFolderId(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.trim();
  const folderMatch = value.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (folderMatch) return folderMatch[1];
  const idParam = value.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (idParam) return idParam[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(value)) return value;
  return null;
}

interface ListResponse {
  files?: Array<{ id: string; name: string; mimeType: string; modifiedTime: string; size?: string; thumbnailLink?: string; webViewLink?: string }>;
  nextPageToken?: string;
}

async function listChildren(
  auth: GoogleAuth,
  folderId: string,
  extraQuery: string,
  fetchImpl?: FetchLike,
  maxItems = 200,
): Promise<NonNullable<ListResponse["files"]>> {
  const out: NonNullable<ListResponse["files"]> = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false${extraQuery}`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size, thumbnailLink, webViewLink)",
      orderBy: "modifiedTime desc",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const json = await googleJson<ListResponse>(
      auth,
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { allowApiKey: true },
      fetchImpl,
    );
    out.push(...(json.files ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken && out.length < maxItems);
  return out.slice(0, maxItems);
}

/** Ảnh trong thư mục và các thư mục con cấp 1 (vd. "Món ăn", "Không gian"). */
export async function listDriveImages(auth: GoogleAuth, folderId: string, fetchImpl?: FetchLike): Promise<DriveImageFile[]> {
  const toFile = (f: NonNullable<ListResponse["files"]>[number], folderName?: string): DriveImageFile => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    size: f.size ? Number(f.size) : undefined,
    thumbnailLink: f.thumbnailLink,
    webViewLink: f.webViewLink,
    folderName,
  });
  const images = (await listChildren(auth, folderId, " and mimeType contains 'image/'", fetchImpl)).map((f) => toFile(f));
  const subfolders = await listChildren(auth, folderId, ` and mimeType = '${FOLDER_MIME}'`, fetchImpl, 20);
  for (const folder of subfolders) {
    const inner = await listChildren(auth, folder.id, " and mimeType contains 'image/'", fetchImpl);
    images.push(...inner.map((f) => toFile(f, folder.name)));
  }
  return images;
}

export async function downloadDriveFile(auth: GoogleAuth, fileId: string, fetchImpl?: FetchLike): Promise<Buffer> {
  const res = await googleFetch(
    auth,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { allowApiKey: true },
    fetchImpl,
  );
  if (!res.ok) throw new GoogleApiError(res.status, `Drive download HTTP ${res.status}`, (await res.text()).slice(0, 300));
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new GoogleApiError(413, `Ảnh quá lớn (${declared} bytes)`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new GoogleApiError(413, `Ảnh quá lớn (${buffer.length} bytes)`);
  return buffer;
}

/** Link ảnh công khai để Facebook/Instagram/Google tải về khi đăng (thư mục phải chia sẻ "Bất kỳ ai có link"). */
export function drivePublicImageUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}
