import pool from '../../lib/db';
import { MultiLLMAdapterService } from '../ai/llmAdapter';

export interface DriveAsset {
  id: string;
  workspace_id: string;
  file_name: string;
  file_url: string;
  drive_file_id?: string;
  folder_name?: string;
  asset_type: 'destination_photo' | 'experience_activity' | 'accommodation_space' | 'service_menu';
  vision_tags: string[];
  dish_name?: string; // Tên điểm đến / Hoạt động trải nghiệm
  flavor_notes?: string; // Cảm xúc & Nét đặc sắc du lịch
  generated_caption?: string;
  suggested_channels: string[];
  status: 'staged' | 'published' | 'archived';
  created_at: string;
}

export interface DiscoveredDriveFile {
  fileId: string;
  fileName: string;
  folderName?: string;
  thumbUrl?: string;
}

const memoryDrive = new Map<string, DriveAsset[]>();

export function normalizeGoogleDriveImageUrl(rawUrl: string): { fileUrl: string; driveFileId?: string } {
  const trimmed = (rawUrl || '').trim();
  const fileMatch =
    trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/) ||
    trimmed.match(/[?&]id=([a-zA-Z0-9_-]{15,})/) ||
    trimmed.match(/\/d\/([a-zA-Z0-9_-]{15,})/);
  if (fileMatch && (trimmed.includes('drive.google.com') || trimmed.includes('googleusercontent.com'))) {
    const fileId = fileMatch[1];
    return {
      fileUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`,
      driveFileId: fileId,
    };
  }
  return { fileUrl: trimmed };
}

export function extractGoogleDriveTarget(rawUrl?: string): {
  kind: 'folder' | 'file' | 'none';
  id?: string;
} {
  if (!rawUrl) return { kind: 'none' };
  const url = rawUrl.trim();
  if (!url || url.includes('tripc-vietnam-playbook-assets')) {
    return { kind: 'none' };
  }
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]{15,})/);
  if (folderMatch) {
    return { kind: 'folder', id: folderMatch[1] };
  }
  const fileMatch =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/) ||
    url.match(/\/d\/([a-zA-Z0-9_-]{15,})/);
  if (fileMatch) {
    return { kind: 'file', id: fileMatch[1] };
  }
  const openIdMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (openIdMatch) {
    return { kind: 'folder', id: openIdMatch[1] };
  }
  if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) {
    return { kind: 'folder', id: url };
  }
  return { kind: 'none' };
}

const KNOWN_VIETNAMESE_SPOT_NAMES: Array<{ pattern: RegExp; title: string; notes: string; tags: string[] }> = [
  {
    pattern: /alpine[_\s-]*coaster/i,
    title: 'Tàu Lượn Siêu Tốc Alpine Coaster Bà Nà Hills',
    notes: 'Trò chơi máng trượt tốc độ cao uốn lượn giữa rừng thông và sườn núi Bà Nà Hills.',
    tags: ['Bà Nà Hills', 'Alpine Coaster', 'Trò chơi cảm giác mạnh', 'Du lịch Đà Nẵng'],
  },
  {
    pattern: /cable[_\s-]*car/i,
    title: 'Hệ Thống Cáp Treo Bà Nà Hills Đạt Kỷ Lục Thế Giới',
    notes: 'Tuyến cáp treo xuyên mây ngắm trọn rừng nguyên sinh, thác Tóc Tiên và đỉnh Núi Chúa.',
    tags: ['Bà Nà Hills', 'Cáp treo Bà Nà', 'Săn mây Đà Nẵng', 'Cảnh quan núi rừng'],
  },
  {
    pattern: /golden[_\s-]*bridge|cau[_\s-]*vang/i,
    title: 'Cầu Vàng (Golden Bridge) — Biểu Tượng Kỳ Quan Bà Nà Hills',
    notes: 'Cây cầu được nâng đỡ bởi đôi bàn tay rêu phong khổng lồ giữa lưng chừng mây trời Đà Nẵng.',
    tags: ['Cầu Vàng', 'Golden Bridge', 'Bà Nà Hills', 'Biểu tượng Đà Nẵng'],
  },
  {
    pattern: /french[_\s-]*village|lang[_\s-]*phap/i,
    title: 'Làng Pháp Cổ Điển (French Village) Trên Đỉnh Bà Nà Hills',
    notes: 'Quần thể kiến trúc lâu đài châu Âu cổ kính, quảng trường và lễ hội đường phố sôi động.',
    tags: ['Làng Pháp', 'French Village', 'Bà Nà Hills', 'Check-in kiến trúc Âu'],
  },
  {
    pattern: /fantasy[_\s-]*park/i,
    title: 'Khu Vui Chơi Trong Nhà Fantasy Park Bà Nà Hills',
    notes: 'Tổ hợp giải trí trong nhà quy mô lớn với hàng trăm trò chơi gia đình và tháp rơi tự do.',
    tags: ['Fantasy Park', 'Bà Nà Hills', 'Giải trí gia đình', 'Du lịch Đà Nẵng'],
  },
  {
    pattern: /le[_\s-]*jardin|flower[_\s-]*garden|vuon[_\s-]*hoa/i,
    title: 'Vườn Hoa Le Jardin D’Amour Bà Nà Hills',
    notes: '9 khu vườn hoa rực rỡ sắc màu theo phong cách lãng mạn Pháp trên đỉnh Bà Nà.',
    tags: ['Vườn hoa Le Jardin', 'Bà Nà Hills', 'Check-in sống ảo', 'Du lịch Đà Nẵng'],
  },
  {
    pattern: /linh[_\s-]*ung/i,
    title: 'Chùa Linh Ứng — Tượng Phật Linh Thiêng & Cảnh Quan Thanh Tịnh',
    notes: 'Không gian tâm linh thanh tịnh giữa mây trời và núi biển, điểm dừng chân bình yên.',
    tags: ['Chùa Linh Ứng', 'Du lịch tâm linh', 'Đà Nẵng', 'Cảnh đẹp thanh tịnh'],
  },
  {
    pattern: /wax[_\s-]*museum|bao[_\s-]*tang[_\s-]*tuong[_\s-]*sap/i,
    title: 'Bảo Tàng Tượng Sáp Bà Nà Hills',
    notes: 'Khu trưng bày tượng sáp tinh xảo của các nhân vật nổi tiếng thế giới tại Bà Nà Hills.',
    tags: ['Bảo tàng tượng sáp', 'Bà Nà Hills', 'Tham quan chụp ảnh'],
  },
  {
    pattern: /wine[_\s-]*cellar|ham[_\s-]*ruou[_\s-]*debay/i,
    title: 'Hầm Rượu Cổ Debay 100 Năm Tuổi Trên Đỉnh Bà Nà',
    notes: 'Công trình hầm rượu cổ của người Pháp xuyên sâu trong lòng núi Bà Nà từ năm 1923.',
    tags: ['Hầm rượu Debay', 'Bà Nà Hills', 'Di tích lịch sử Pháp'],
  },
  {
    pattern: /ba[_\s-]*mu[_\s-]*temple/i,
    title: 'Cổng Chùa Bà Mụ Hội An — Điểm Check-in Kiến Trúc Cổ Kính',
    notes: 'Công trình cổng tam quan chạm khắc tinh xảo soi bóng xuống hồ nước giữa trung tâm phố cổ Hội An.',
    tags: ['Chùa Bà Mụ', 'Phố cổ Hội An', 'Kiến trúc di sản', 'Check-in Hội An'],
  },
  {
    pattern: /bay[_\s-]*mau|coconut|rung[_\s-]*dua/i,
    title: 'Rừng Dừa Bảy Mẫu Hội An & Trải Nghiệm Thuyền Thúng',
    notes: 'Trải nghiệm chèo thuyền thúng len lỏi qua rừng dừa nước xanh mát và xem múa thúng đặc sắc.',
    tags: ['Rừng dừa Bảy Mẫu', 'Hội An', 'Thuyền thúng', 'Trải nghiệm sinh thái'],
  },
  {
    pattern: /japanese[_\s-]*bridge|chua[_\s-]*cau/i,
    title: 'Chùa Cầu Hội An — Biểu Tượng Di Sản Phố Cổ',
    notes: 'Biểu tượng giao thoa văn hóa hơn 400 năm tuổi bắc qua dòng kênh cổ kính tại Hội An.',
    tags: ['Chùa Cầu', 'Phố cổ Hội An', 'Di sản UNESCO'],
  },
  {
    pattern: /ancient[_\s-]*town|old[_\s-]*town|pho[_\s-]*co/i,
    title: 'Phố Cổ Hội An Rực Rỡ Đèn Lồng & Kiến Trúc Di Sản',
    notes: 'Những dãy nhà tường vàng mái ngói rêu phong và phố đèn lồng lung linh bên sông Hoài.',
    tags: ['Phố cổ Hội An', 'Đèn lồng Hội An', 'Di sản văn hóa'],
  },
  {
    pattern: /an[_\s-]*bang|cua[_\s-]*dai/i,
    title: 'Biển An Bàng & Cửa Đại Hội An — Không Gian Biển Xanh Bình Yên',
    notes: 'Bãi biển hoang sơ với làn nước trong xanh, quán cà phê ven biển thư giãn tại Hội An.',
    tags: ['Biển An Bàng', 'Hội An', 'Nghỉ dưỡng biển'],
  },
  {
    pattern: /lantern|den[_\s-]*long|hoai[_\s-]*river|tha[_\s-]*hoa[_\s-]*dang/i,
    title: 'Đêm Đèn Lồng & Thả Hoa Đăng Trên Sông Hoài Hội An',
    notes: 'Trải nghiệm đi thuyền gỗ thả hoa đăng lung linh trên dòng sông Hoài giữa lòng phố cổ.',
    tags: ['Sông Hoài', 'Hoa đăng Hội An', 'Phố đèn lồng'],
  },
  {
    pattern: /tra[_\s-]*que/i,
    title: 'Làng Rau Trà Quế Hội An — Trải Nghiệm Nông Nghiệp Bản Địa',
    notes: 'Làng nghề trồng rau hữu cơ truyền thống lâu đời với không gian xanh mát yên bình.',
    tags: ['Làng rau Trà Quế', 'Hội An', 'Du lịch xanh'],
  },
  {
    pattern: /thanh[_\s-]*ha|pottery|lang[_\s-]*gom/i,
    title: 'Làng Gốm Thanh Hà Hội An — Tinh Hoa Nghề Gốm 500 Năm',
    notes: 'Khám phá nghệ thuật chuốt gốm thủ công và công viên đất nung độc đáo ven sông Thu Bồn.',
    tags: ['Làng gốm Thanh Hà', 'Hội An', 'Làng nghề truyền thống'],
  },
];

export class DriveAssetIngestionService {
  private readonly db: typeof pool;
  private readonly llm: MultiLLMAdapterService;

  constructor(dbOrDeps: any = pool) {
    this.db = dbOrDeps && typeof dbOrDeps.query === 'function' ? dbOrDeps : dbOrDeps?.db || pool;
    this.llm = new MultiLLMAdapterService(this.db);
  }

  async connection(workspaceId: string) {
    const folderUrl = await this.getConfiguredDriveUrl(workspaceId);
    const target = extractGoogleDriveTarget(folderUrl);
    return {
      connected: Boolean(folderUrl),
      folder_id: target.kind === 'folder' ? target.id : null,
      folder_url: folderUrl || null,
      auth_mode: 'public_link',
    };
  }

  async scanDrive(workspaceId: string) {
    const res = await this.syncDriveFolder(workspaceId);
    return {
      status: 'ok' as const,
      scanned: res.assets_scanned,
      staged: res.truly_new_assets ?? res.assets_scanned,
      rejected: 0,
      archived: 0,
    };
  }

  async getConfiguredDriveUrl(workspaceId: string): Promise<string> {
    try {
      const res = await this.db.query(
        `SELECT gdrive_url FROM merchant_onboarding WHERE workspace_id = $1::uuid LIMIT 1`,
        [workspaceId]
      );
      const url = res.rows[0]?.gdrive_url || '';
      return url.includes('tripc-vietnam-playbook-assets') ? '' : url;
    } catch {
      return '';
    }
  }

  async saveConfiguredDriveUrl(workspaceId: string, gdriveUrl: string): Promise<void> {
    const clean = gdriveUrl.trim();
    if (!clean) return;
    try {
      await this.db.query(
        `INSERT INTO merchant_onboarding (workspace_id, gdrive_url, onboarding_completed, updated_at)
         VALUES ($1::uuid, $2::text, true, NOW())
         ON CONFLICT (workspace_id) DO UPDATE SET gdrive_url = EXCLUDED.gdrive_url, updated_at = NOW()`,
        [workspaceId, clean]
      );
    } catch {
      // Ignore if table unavailable in unit test mock
    }
  }

  async clearMockAssets(workspaceId: string): Promise<number> {
    try {
      const res = await this.db.query(
        `DELETE FROM drive_asset_queue
         WHERE workspace_id = $1::uuid
           AND (file_url LIKE '%images.unsplash.com%' OR drive_file_id IS NULL)`,
        [workspaceId]
      );
      memoryDrive.delete(workspaceId);
      return res.rowCount ?? 0;
    } catch {
      memoryDrive.set(workspaceId, []);
      return 0;
    }
  }

  async listStagedAssets(workspaceId: string, allowSeed = true): Promise<DriveAsset[]> {
    try {
      const res = await this.db.query(
        `SELECT * FROM drive_asset_queue
         WHERE workspace_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT 100`,
        [workspaceId]
      );

      if (res.rows.length === 0) {
        if (!allowSeed) return [];
        return this.seedDemoDriveAssets(workspaceId);
      }

      return res.rows.map(this.mapAssetRow);
    } catch {
      if (!memoryDrive.has(workspaceId)) {
        memoryDrive.set(workspaceId, allowSeed ? this.getDemoDriveAssets(workspaceId) : []);
      }
      return memoryDrive.get(workspaceId)!;
    }
  }

  /**
   * Parses a single Google Drive embeddedfolderview page into folder title, child subfolders, and files.
   */
  private async fetchDriveFolderEntries(folderId: string): Promise<{
    folderTitle?: string;
    subfolders: Array<{ id: string; name: string }>;
    files: Array<{ id: string; name: string; thumbUrl?: string }>;
  }> {
    let folderTitle: string | undefined;
    const subfolders: Array<{ id: string; name: string }> = [];
    const files: Array<{ id: string; name: string; thumbUrl?: string }> = [];

    try {
      const embedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
      const res = await fetch(embedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const html = await res.text();
        const pageTitleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (pageTitleMatch) {
          const cleanedTitle = this.decodeHtmlEntities(
            pageTitleMatch[1].replace(/\s*-\s*Google Drive\s*$/i, '').trim()
          );
          if (cleanedTitle && !cleanedTitle.startsWith('Google Drive')) {
            folderTitle = cleanedTitle;
          }
        }
        // Split by flip-entry blocks
        const blocks = html.split('<div class="flip-entry"');
        for (let i = 1; i < blocks.length; i++) {
          const block = blocks[i];
          const idMatch = block.match(/id="entry-([a-zA-Z0-9_-]{15,})"/);
          const hrefMatch = block.match(/<a\s+href="([^"]+)"/i);
          const titleMatch = block.match(/<div\s+class="flip-entry-title">([^<]+)<\/div>/i);
          const thumbMatch = block.match(/<div\s+class="flip-entry-thumb">\s*<img\s+src="([^"]+)"/i);

          if (!idMatch || !titleMatch) continue;
          const entryId = idMatch[1].trim();
          const entryTitle = this.decodeHtmlEntities(titleMatch[1].trim());
          const href = hrefMatch ? hrefMatch[1] : '';
          const isFolder =
            href.includes('/drive/folders/') ||
            href.includes('/folders/') ||
            block.includes('aria-label="Folder"') ||
            block.includes('drive-sprite-folder');

          if (isFolder) {
            subfolders.push({ id: entryId, name: entryTitle });
          } else {
            files.push({
              id: entryId,
              name: entryTitle,
              thumbUrl: thumbMatch ? this.decodeHtmlEntities(thumbMatch[1]) : undefined,
            });
          }
        }
      }
    } catch {
      // Ignore network timeout on single folder
    }

    return { folderTitle, subfolders, files };
  }

  /**
   * Recursively discovers all files inside ANY public Google Drive folder (including nested subfolders up to depth 4)
   * or a single shared file link.
   */
  async discoverFilesFromGoogleDrive(rawUrl: string): Promise<{
    files: DiscoveredDriveFile[];
    discoveredFolderIds: string[];
    discoveredSubfolderNames: string[];
  }> {
    const target = extractGoogleDriveTarget(rawUrl);
    if (target.kind === 'none' || !target.id) {
      return { files: [], discoveredFolderIds: [], discoveredSubfolderNames: [] };
    }

    if (target.kind === 'file') {
      const fileName = await this.fetchSingleDriveFileName(target.id);
      return {
        files: [{ fileId: target.id, fileName, folderName: 'File lẻ Google Drive' }],
        discoveredFolderIds: [],
        discoveredSubfolderNames: ['File lẻ Google Drive'],
      };
    }

    const visitedFolders = new Set<string>();
    const discoveredFolderIds: string[] = [target.id];
    const discoveredSubfolderNames: string[] = [];
    const discoveredFiles = new Map<string, DiscoveredDriveFile>();

    // BFS queue of folders to crawl recursively (up to depth 4)
    let currentLevel: Array<{ id: string; pathName: string }> = [{ id: target.id, pathName: '' }];

    for (let depth = 0; depth < 4 && currentLevel.length > 0; depth++) {
      const nextLevel: Array<{ id: string; pathName: string }> = [];

      const levelResults = await Promise.all(
        currentLevel.map(async (folder) => {
          if (visitedFolders.has(folder.id)) return null;
          visitedFolders.add(folder.id);
          const entries = await this.fetchDriveFolderEntries(folder.id);
          return { folder, entries };
        })
      );

      for (const item of levelResults) {
        if (!item) continue;
        const { folder, entries } = item;
        const effectiveRootCategory = folder.pathName || entries.folderTitle || 'Thư mục gốc';

        for (const f of entries.files) {
          if (!discoveredFiles.has(f.id)) {
            if (!discoveredSubfolderNames.includes(effectiveRootCategory)) {
              discoveredSubfolderNames.push(effectiveRootCategory);
            }
            discoveredFiles.set(f.id, {
              fileId: f.id,
              fileName: f.name,
              folderName: effectiveRootCategory,
              thumbUrl: f.thumbUrl,
            });
          }
        }

        for (const sub of entries.subfolders) {
          discoveredFolderIds.push(sub.id);
          const subPath = folder.pathName ? `${folder.pathName} / ${sub.name}` : sub.name;
          if (!discoveredSubfolderNames.includes(subPath)) {
            discoveredSubfolderNames.push(subPath);
          }
          if (!visitedFolders.has(sub.id)) {
            nextLevel.push({ id: sub.id, pathName: subPath });
          }
        }
      }

      currentLevel = nextLevel;
      if (discoveredFiles.size >= 80) break;
    }

    // If root had no folder entries and was actually a single shared file ID via ?id=FILE_ID
    if (discoveredFiles.size === 0 && discoveredSubfolderNames.length === 0) {
      const singleName = await this.fetchSingleDriveFileName(target.id);
      if (singleName && !singleName.startsWith('Google Drive:') && !singleName.startsWith('Drive_Asset_')) {
        discoveredFiles.set(target.id, {
          fileId: target.id,
          fileName: singleName,
          folderName: 'File lẻ Google Drive',
        });
      }
    }

    return {
      files: Array.from(discoveredFiles.values()).slice(0, 80),
      discoveredFolderIds,
      discoveredSubfolderNames,
    };
  }

  private async fetchSingleDriveFileName(fileId: string): Promise<string> {
    try {
      const res = await fetch(`https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();
        const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1];
        if (ogTitle) return this.decodeHtmlEntities(ogTitle.trim());
        const titleTag = html.match(/<title>([^<]+)<\/title>/i)?.[1];
        if (titleTag) {
          return this.decodeHtmlEntities(titleTag.replace(/\s*-\s*Google Drive\s*$/i, '').trim());
        }
      }
    } catch {
      // Ignore
    }
    return `Drive_Asset_${fileId.slice(0, 8)}.jpg`;
  }

  private decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private synthesizeDriveMetadata(file: DiscoveredDriveFile): {
    title: string;
    tags: string[];
    notes: string;
    caption: string;
  } {
    const folderPrefix = file.folderName ? `[${file.folderName}] ` : '';
    const cleanBaseName = file.fileName
      .replace(/\.[a-zA-Z0-9]{2,5}$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();

    for (const rule of KNOWN_VIETNAMESE_SPOT_NAMES) {
      if (rule.pattern.test(file.fileName)) {
        const tags = file.folderName
          ? Array.from(new Set([`Thư mục: ${file.folderName}`, ...rule.tags]))
          : rule.tags;
        return {
          title: `${folderPrefix}${rule.title}`,
          tags,
          notes: `${rule.notes} (File gốc Google Drive: ${file.fileName})`,
          caption: `📍 ${rule.title} — ${rule.notes} Đặt lịch khám phá cùng TripC ngay hôm nay! ✨ #TripC #${(
            file.folderName || 'DaNang'
          ).replace(/\s+/g, '')} #GoogleMaps`,
        };
      }
    }

    const prettyName = cleanBaseName
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const title = `${folderPrefix}${prettyName || file.fileName}`;
    const tags = [
      ...(file.folderName ? [`Thư mục: ${file.folderName}`, file.folderName] : ['Google Drive Thật']),
      prettyName || 'Tư liệu thực tế',
      'Local SEO Maps',
    ];
    return {
      title,
      tags,
      notes: `Tư liệu ảnh thực tế từ thư mục Google Drive "${file.folderName || 'Gốc'}" (File: ${file.fileName}).`,
      caption: `📸 Khám phá vẻ đẹp thực tế tại ${file.folderName || 'Đà Nẵng - Hội An'}: ${prettyName || file.fileName
        }! Lưu ngay địa điểm trên Google Maps cho hành trình sắp tới của bạn nhé! ✨ #TripC #LocalSEO`,
    };
  }

  async syncDriveFolder(
    workspaceId: string,
    folderUrl?: string
  ): Promise<{
    assets_scanned: number;
    new_assets_ingested: number;
    truly_new_assets?: number;
    items: DriveAsset[];
    is_real_drive?: boolean;
    folder_url?: string;
    subfolders?: string[];
    message?: string;
  }> {
    if (folderUrl && folderUrl.trim()) {
      await this.saveConfiguredDriveUrl(workspaceId, folderUrl.trim());
    }
    const effectiveUrl = (folderUrl && folderUrl.trim()) || (await this.getConfiguredDriveUrl(workspaceId));
    const target = extractGoogleDriveTarget(effectiveUrl);

    // If a real Google Drive URL/ID is provided, crawl real Google Drive recursively!
    if (target.kind !== 'none' && target.id) {
      const { files, discoveredFolderIds, discoveredSubfolderNames } =
        await this.discoverFilesFromGoogleDrive(effectiveUrl);

      // Remove any old mock rows AND any rows from a previous Google Drive link that are not in the newly scanned folder
      await this.clearMockAssets(workspaceId);
      if (files.length > 0 && target.kind === 'folder') {
        try {
          const validFileIds = files.map((f) => f.fileId);
          await this.db.query(
            `DELETE FROM drive_asset_queue
             WHERE workspace_id = $1::uuid
               AND (drive_file_id IS NULL OR NOT (drive_file_id = ANY($2::text[])))`,
            [workspaceId, validFileIds]
          );
        } catch {
          // Ignore
        }
      } else if (discoveredFolderIds.length > 0) {
        try {
          await this.db.query(
            `DELETE FROM drive_asset_queue WHERE workspace_id = $1::uuid AND drive_file_id = ANY($2::text[])`,
            [workspaceId, discoveredFolderIds]
          );
        } catch {
          // Ignore
        }
      }

      if (files.length === 0) {
        const subMsg =
          discoveredSubfolderNames.length > 0
            ? `Đã tìm thấy ${discoveredSubfolderNames.length} thư mục con (${discoveredSubfolderNames.join(', ')}) nhưng bên trong các thư mục này hiện chưa có file ảnh nào.`
            : 'Không tìm thấy file ảnh công khai trong link Google Drive này. Hãy đảm bảo thư mục/file Google Drive đã bật quyền chia sẻ "Bất kỳ ai có đường liên kết đều có thể xem (Anyone with the link)".';
        return {
          assets_scanned: 0,
          new_assets_ingested: 0,
          items: [],
          is_real_drive: true,
          folder_url: effectiveUrl,
          subfolders: discoveredSubfolderNames,
          message: subMsg,
        };
      }

      const inserted: DriveAsset[] = [];
      let trulyNewAssets = 0;
      for (const file of files) {
        const imageUrl = `https://drive.google.com/thumbnail?id=${file.fileId}&sz=w1200`;
        const displayFileName = file.folderName ? `${file.folderName}/${file.fileName}` : file.fileName;
        const analysis = this.synthesizeDriveMetadata(file);
        try {
          const existing = await this.db.query(
            `SELECT * FROM drive_asset_queue WHERE workspace_id = $1::uuid AND drive_file_id = $2::varchar LIMIT 1`,
            [workspaceId, file.fileId]
          );
          if (existing.rows.length > 0) {
            const updated = await this.db.query(
              `UPDATE drive_asset_queue
               SET file_name = $3::varchar,
                   file_url = $4::text,
                   vision_tags = $5::jsonb,
                   dish_name = $6::varchar,
                   flavor_notes = $7::text,
                   generated_caption = $8::text,
                   updated_at = NOW()
               WHERE workspace_id = $1::uuid AND drive_file_id = $2::varchar
               RETURNING *`,
              [
                workspaceId,
                file.fileId,
                displayFileName,
                imageUrl,
                JSON.stringify(analysis.tags),
                analysis.title,
                analysis.notes,
                analysis.caption,
              ]
            );
            inserted.push(this.mapAssetRow(updated.rows[0]));
            continue;
          }

          const res = await this.db.query(
            `INSERT INTO drive_asset_queue (
              workspace_id, file_name, file_url, drive_file_id, asset_type, vision_tags, dish_name, flavor_notes, generated_caption, status
            ) VALUES (
              $1::uuid, $2::varchar, $3::text, $4::varchar, 'destination_photo', $5::jsonb, $6::varchar, $7::text, $8::text, 'published'
            ) RETURNING *`,
            [
              workspaceId,
              displayFileName,
              imageUrl,
              file.fileId,
              JSON.stringify(analysis.tags),
              analysis.title,
              analysis.notes,
              analysis.caption,
            ]
          );
          trulyNewAssets++;
          inserted.push(this.mapAssetRow(res.rows[0]));
        } catch {
          // Ignore single file error
        }
      }

      const folderSummary =
        discoveredSubfolderNames.length > 0
          ? ` qua ${discoveredSubfolderNames.length} thư mục con (${discoveredSubfolderNames.join(', ')})`
          : '';
      return {
        assets_scanned: files.length,
        new_assets_ingested: inserted.length,
        truly_new_assets: trulyNewAssets,
        items: inserted,
        is_real_drive: true,
        folder_url: effectiveUrl,
        subfolders: discoveredSubfolderNames,
        message: `Đã quét đệ quy${folderSummary} và đồng bộ thành công ${inserted.length} file ảnh thật từ Google Drive!`,
      };
    }

    // Fallback sample sync (used when no real Google Drive link is configured yet or in unit tests)
    const mockPhotos = [
      {
        name: 'IMG_20261118_HoangHonSonTra.jpg',
        url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
        title: 'Hoàng Hôn Tuyệt Đẹp Trên Bán Đảo Sơn Trà & Bãi Biển Mỹ Khê',
        tags: ['Du lịch Đà Nẵng', 'Hoàng hôn biển', 'Check-in Sơn Trà', 'Cảnh quan thiên nhiên', 'Ảnh chụp thực tế'],
        notes: 'Góc ngắm hoàng hôn rực rỡ, gió biển trong lành, thích hợp cho chuyến đi chữa lành và lưu giữ kỷ niệm đẹp.',
        caption:
          '🌅 Hoàng hôn buông xuống Sơn Trà đẹp tựa tranh vẽ! Gió biển lồng lộng xua tan mọi mệt mỏi. Check-in ngay điểm ngắm hoàng hôn triệu đô này bạn nhé! ✨ #DuLichDaNang #SonTraSunset',
      },
      {
        name: 'IMG_20261118_TraiNghiemCheoSUP.jpg',
        url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
        title: 'Trải Nghiệm Chèo SUP Đón Bình Minh & Lặn Ngắm San Hô Bản Địa',
        tags: ['Tour trải nghiệm', 'Chèo SUP', 'Lặn biển', 'Hoạt động ngoài trời', 'Khám phá bản địa'],
        notes: 'Cảm giác đón bình minh trên mặt biển êm ả, khám phá hệ sinh thái biển nguyên sơ cùng hướng dẫn viên nhiệt tình.',
        caption:
          '🌊 Đón ánh bình minh đầu ngày rực rỡ giữa biển khơi Mỹ Khê với tour chèo SUP độc bản! Đặt chỗ hôm nay để nhận ưu đãi chụp ảnh flycam miễn phí nha! 🏄 #CheoSUP #MyKhe',
      },
    ];

    const inserted: DriveAsset[] = [];
    for (const p of mockPhotos) {
      try {
        const res = await this.db.query(
          `INSERT INTO drive_asset_queue (
            workspace_id, file_name, file_url, asset_type, vision_tags, dish_name, flavor_notes, generated_caption, status
          ) VALUES (
            $1::uuid, $2::varchar, $3::text, 'destination_photo', $4::jsonb, $5::varchar, $6::text, $7::text, 'staged'
          ) RETURNING *`,
          [workspaceId, p.name, p.url, JSON.stringify(p.tags), p.title, p.notes, p.caption]
        );
        inserted.push(this.mapAssetRow(res.rows[0]));
      } catch {
        const fallbackAsset: DriveAsset = {
          id: `asset_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          workspace_id: workspaceId,
          file_name: p.name,
          file_url: p.url,
          asset_type: 'destination_photo',
          vision_tags: p.tags,
          dish_name: p.title,
          flavor_notes: p.notes,
          generated_caption: p.caption,
          suggested_channels: ['google_maps', 'facebook', 'tiktok'],
          status: 'staged',
          created_at: new Date().toISOString(),
        };
        inserted.push(fallbackAsset);
      }
    }

    if (memoryDrive.has(workspaceId)) {
      memoryDrive.set(workspaceId, [...inserted, ...memoryDrive.get(workspaceId)!]);
    } else {
      memoryDrive.set(workspaceId, inserted);
    }

    return {
      assets_scanned: 2,
      new_assets_ingested: inserted.length,
      items: inserted,
      is_real_drive: false,
      message:
        'Chưa có link Google Drive thật — hệ thống vừa nạp 2 ảnh mẫu minh họa. Hãy dán link Google Drive thật vào ô bên trên để lấy dữ liệu thật.',
    };
  }

  async addAsset(
    workspaceId: string,
    data: {
      file_name: string;
      file_url: string;
      spot_name: string;
      spot_notes?: string;
    }
  ): Promise<DriveAsset> {
    const normalized = normalizeGoogleDriveImageUrl(data.file_url);
    const tags = normalized.driveFileId
      ? ['Google Drive Thật', data.spot_name, 'Du lịch Đà Nẵng', 'Ảnh thực tế']
      : ['Du lịch Đà Nẵng', 'Địa điểm check-in', 'Ảnh thực tế'];
    const caption = `✨ Cập nhật mới nhất từ địa điểm "${data.spot_name}": ${data.spot_notes || 'Khung cảnh tuyệt đẹp, đáng để trải nghiệm khi đến Đà Nẵng'
      }. Hãy ghé thăm và cảm nhận nhé! 📍`;

    try {
      const res = await this.db.query(
        `INSERT INTO drive_asset_queue (
          workspace_id, file_name, file_url, drive_file_id, asset_type, vision_tags, dish_name, flavor_notes, generated_caption, status
        ) VALUES (
          $1::uuid, $2::varchar, $3::text, $4::varchar, 'destination_photo', $5::jsonb, $6::varchar, $7::text, $8::text, 'staged'
        ) RETURNING *`,
        [
          workspaceId,
          data.file_name,
          normalized.fileUrl,
          normalized.driveFileId || null,
          JSON.stringify(tags),
          data.spot_name,
          data.spot_notes || 'Thông tin địa điểm thực tế từ Google Drive',
          caption,
        ]
      );

      return this.mapAssetRow(res.rows[0]);
    } catch {
      const newAsset: DriveAsset = {
        id: `asset_${Date.now()}`,
        workspace_id: workspaceId,
        file_name: data.file_name,
        file_url: normalized.fileUrl,
        drive_file_id: normalized.driveFileId,
        asset_type: 'destination_photo',
        vision_tags: tags,
        dish_name: data.spot_name,
        flavor_notes: data.spot_notes || 'Thông tin địa điểm thực tế từ Google Drive',
        generated_caption: caption,
        suggested_channels: ['google_maps', 'facebook'],
        status: 'staged',
        created_at: new Date().toISOString(),
      };
      const cur = memoryDrive.get(workspaceId) || this.getDemoDriveAssets(workspaceId);
      memoryDrive.set(workspaceId, [newAsset, ...cur]);
      return newAsset;
    }
  }

  async publishAsset(
    workspaceId: string,
    assetId: string,
    channels: string[] = ['facebook', 'google_maps', 'tiktok']
  ): Promise<DriveAsset | null> {
    try {
      const res = await this.db.query(
        `UPDATE drive_asset_queue
         SET status = 'published',
             suggested_channels = $3::text[],
             updated_at = NOW()
         WHERE workspace_id = $1::uuid AND id = $2::uuid
         RETURNING *`,
        [workspaceId, assetId, channels]
      );

      if (res.rows.length === 0) return null;
      return this.mapAssetRow(res.rows[0]);
    } catch {
      const cur = memoryDrive.get(workspaceId) || [];
      const item = cur.find((a) => a.id === assetId);
      if (item) {
        item.status = 'published';
        item.suggested_channels = channels;
        return item;
      }
      return null;
    }
  }

  private async seedDemoDriveAssets(workspaceId: string): Promise<DriveAsset[]> {
    const demo = this.getDemoDriveAssets(workspaceId);
    try {
      const results: DriveAsset[] = [];
      for (const d of demo) {
        const res = await this.db.query(
          `INSERT INTO drive_asset_queue (
            workspace_id, file_name, file_url, asset_type, vision_tags, dish_name, flavor_notes, generated_caption, status
          ) VALUES (
            $1::uuid, $2::varchar, $3::text, 'destination_photo', $4::jsonb, $5::varchar, $6::text, $7::text, 'staged'
          ) RETURNING *`,
          [workspaceId, d.file_name, d.file_url, JSON.stringify(d.vision_tags), d.dish_name, d.flavor_notes, d.generated_caption]
        );
        results.push(this.mapAssetRow(res.rows[0]));
      }
      return results;
    } catch {
      memoryDrive.set(workspaceId, demo);
      return demo;
    }
  }

  private getDemoDriveAssets(workspaceId: string): DriveAsset[] {
    return [
      {
        id: '10000000-0000-4000-8000-000000000031',
        workspace_id: workspaceId,
        file_name: 'IMG_BaiBien_MyKhe_DaNang.jpg',
        file_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
        asset_type: 'destination_photo',
        dish_name: 'Bình Minh Bãi Biển Mỹ Khê — Top Bãi Biển Quyến Rũ Nhất Hành Tinh',
        vision_tags: ['Biển Mỹ Khê', 'Du lịch tự túc', 'Check-in sống ảo', 'Trải nghiệm du lịch'],
        flavor_notes: 'Cát trắng mịn màng, sóng êm và làn nước trong xanh màu ngọc bích.',
        generated_caption:
          '🌊 Bình minh Mỹ Khê sáng nay rực rỡ như một bức tranh! Nếu bạn đang lên kế hoạch cho chuyến đi Đà Nẵng sắp tới, đừng quên dậy sớm đón những tia nắng đầu tiên bên bờ biển nhé. Nhắn tin cho tụi mình để nhận cẩm nang du lịch bản địa miễn phí nha! ✨ #DuLichDaNang #MyKheBeach #TravelDanang',
        suggested_channels: ['google_maps', 'facebook', 'tiktok'],
        status: 'staged',
        created_at: new Date().toISOString(),
      },
      {
        id: '10000000-0000-4000-8000-000000000032',
        workspace_id: workspaceId,
        file_name: 'IMG_Tour_SonTra_KhamPha.jpg',
        file_url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
        asset_type: 'destination_photo',
        dish_name: 'Hành Trình Khám Phá Rừng Nguyên Sinh & Vọoc Chà Vá Bán Đảo Sơn Trà',
        vision_tags: ['Bán đảo Sơn Trà', 'Tour trải nghiệm', 'Thiên nhiên hoang sơ', 'Chụp ảnh du lịch'],
        flavor_notes: 'Cung đường ven biển uốn lượn, không khí mát lành giữa đại ngàn và biển cả.',
        generated_caption:
          '🌿 Thả mình giữa cung đường biển Sơn Trà lộng gió, ngắm trọn toàn cảnh vịnh Đà Nẵng từ trên cao. Trải nghiệm du lịch không thể bỏ lỡ khi ghé thăm thành phố đáng sống! 🛵🏔️ #SonTraPeninsula #KhamPhaDaNang #CheckinVietnam',
        suggested_channels: ['google_maps', 'facebook'],
        status: 'published',
        created_at: new Date().toISOString(),
      },
    ];
  }

  private mapAssetRow(row: any): DriveAsset {
    const rawFileName = String(row.file_name || '');
    const slashIdx = rawFileName.indexOf('/');
    const folderFromPath = slashIdx > 0 ? rawFileName.slice(0, slashIdx) : undefined;
    const visionTags: string[] = Array.isArray(row.vision_tags)
      ? row.vision_tags
      : typeof row.vision_tags === 'string'
        ? JSON.parse(row.vision_tags)
        : ['Du lịch trải nghiệm Đà Nẵng'];
    const tagFolder = visionTags.find((t) => typeof t === 'string' && t.startsWith('Thư mục: '))?.replace('Thư mục: ', '');

    return {
      id: row.id,
      workspace_id: row.workspace_id,
      file_name: rawFileName,
      file_url: row.file_url,
      drive_file_id: row.drive_file_id || undefined,
      folder_name: folderFromPath || tagFolder,
      asset_type: row.asset_type || 'destination_photo',
      vision_tags: visionTags,
      dish_name: row.dish_name || 'Điểm đến & Hoạt động trải nghiệm',
      flavor_notes: row.flavor_notes || 'Khung cảnh thiên nhiên ngoạn mục',
      generated_caption: row.generated_caption || undefined,
      suggested_channels: row.suggested_channels || ['facebook', 'google_maps'],
      status: row.status || 'staged',
      created_at: new Date(row.created_at).toISOString(),
    };
  }
}
