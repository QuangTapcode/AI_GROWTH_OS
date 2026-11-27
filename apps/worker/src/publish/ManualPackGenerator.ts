/**
 * Manual pack generator for social channels when live publishing is not available
 * (e.g. pending Meta App Review / TikTok for Developers approval, permission denied).
 *
 * Produces a labeled manual pack (zip bundle & copy-paste instructions) that editors
 * can use to publish safely by hand.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface ManualPackFile {
  filename: string;
  content: string;
}

export interface ManualPackJobInput {
  contentId: string;
  workspaceId?: string;
  workspace_id?: string;
  title?: string;
  bodyMarkdown?: string;
  metaTitle?: string;
  metaDescription?: string;
  slug?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  mediaUrl?: string;
  mediaType?: 'video' | 'image';
  isAiGenerated?: boolean;
  cta?: string;
  imageContentHash?: string;
  storageKey?: string;
  imageFileName?: string;
  imageFileContent?: string;
  requiresImage?: boolean;
}

export interface ManualPack {
  channel: 'Facebook' | 'FacebookGroup' | 'TikTok' | 'Instagram';
  contentId: string;
  workspaceId: string;
  title: string;
  bodyText: string;
  caption: string;
  cta?: string;
  mediaUrl?: string;
  mediaType?: 'video' | 'image';
  isAiGenerated: boolean;
  imageContentHash?: string;
  storageKey?: string;
  imageFileName?: string;
  hasMissingAsset?: boolean;
  missingAssetReason?: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  label: 'manual-pack'; // UI shows this label to distinguish from live publish
  createdAt: Date;
  instructions: string[];
  files: Record<string, string>; // Virtual zip package files: { filename: content }
}

export function generateManualPack(
  job: ManualPackJobInput,
  channel: 'Facebook' | 'FacebookGroup' | 'TikTok' | 'Instagram'
): ManualPack {
  const workspaceId = job.workspaceId ?? job.workspace_id ?? 'unknown';
  const utmSource = job.utmSource || 'social';
  const utmMedium = job.utmMedium || channel.toLowerCase();
  const utmCampaign = job.utmCampaign || 'manual-pack';
  const isAiGenerated = Boolean(job.isAiGenerated);
  const title = job.metaTitle || job.title || 'Untitled';
  const rawBody = job.bodyMarkdown || '';

  // Xử lý đính kèm file ảnh từ media_assets / storage cục bộ
  let resolvedImageContent = job.imageFileContent;
  let resolvedFileName = job.imageFileName;
  if (!resolvedFileName && job.storageKey) {
    resolvedFileName = path.basename(job.storageKey);
  }
  if (!resolvedImageContent && job.storageKey) {
    try {
      const localDir = process.env.LOCAL_STORAGE_DIR || path.resolve(process.cwd(), 'apps/api/public/uploads');
      const cleanKey = job.storageKey.replace(/^uploads[\\/]/, '');
      const physicalPath = path.resolve(localDir, cleanKey);
      if (fs.existsSync(physicalPath)) {
        resolvedImageContent = fs.readFileSync(physicalPath).toString('base64');
      }
    } catch {
      // Bỏ qua nếu fs không khả dụng trong môi trường sandbox cô lập
    }
  }

  // Kiểm tra tính toàn vẹn của tài sản ảnh
  const isImageRequired = Boolean(job.requiresImage || job.imageContentHash);
  const hasValidMedia = Boolean(job.mediaUrl || job.storageKey || resolvedImageContent);
  const hasMissingAsset = isImageRequired && !hasValidMedia;
  const missingAssetReason = hasMissingAsset
    ? `Thiếu file ảnh hợp lệ từ media_assets theo content_hash (${job.imageContentHash || 'unknown'}) đã khóa lúc duyệt.`
    : undefined;

  // Chuẩn bị caption hoàn chỉnh có nhãn AI theo chính sách nếu cần
  let caption = rawBody.trim();
  if (isAiGenerated) {
    if (channel === 'Facebook' || channel === 'FacebookGroup') {
      if (!caption.includes('[Ảnh tạo bởi AI]')) {
        caption += '\n\n[Ảnh tạo bởi AI]\n#AIgenerated #ImaginedWithAI';
      }
    } else if (channel === 'TikTok') {
      if (!caption.includes('#AIGC')) {
        caption += '\n\n#AIGC #AIcontent';
      }
    }
  }

  // Hướng dẫn chi tiết từng bước cho từng kênh
  const instructions: string[] = [];
  if (hasMissingAsset) {
    instructions.push(
      `⚠️ CẢNH BÁO QUAN TRỌNG: Bài viết này bị thiếu file ảnh tương ứng với content_hash (${job.imageContentHash || 'unknown'}) đã khóa lúc duyệt. KHÔNG đăng bài hỏng khi chưa bổ sung đủ tài sản ảnh!`
    );
  }

  if (channel === 'FacebookGroup') {
    instructions.push(`1. Mở Facebook Group mục tiêu với tư cách Quản trị viên (Admin hoặc Fanpage liên kết).`);
    instructions.push(`2. Chọn 'Viết bài' (Write something) và dán nội dung từ file caption.txt.`);
    if (hasValidMedia) {
      const sourceDesc = resolvedFileName ? `từ file '${resolvedFileName}'` : 'từ đường dẫn trong file media_urls.txt';
      const hashDesc = job.imageContentHash ? ` (Mã SHA-256 đã khóa: ${job.imageContentHash})` : '';
      instructions.push(`3. Tải/lấy ảnh ${sourceDesc}${hashDesc} và đính kèm vào bài viết.`);
    }
    if (isAiGenerated) {
      instructions.push(`4. QUAN TRỌNG: Đảm bảo nhãn minh bạch [Ảnh tạo bởi AI] được giữ nguyên trong bài viết theo chính sách của Meta.`);
    }
    instructions.push(`5. Kiểm tra câu hỏi thảo luận cuối bài và bấm 'Đăng' (Post).`);
    instructions.push(`6. Sao chép URL bài viết trong Group và cập nhật lại external_post_id vào hệ thống.`);
  } else if (channel === 'Facebook') {
    instructions.push(`1. Mở Meta Business Suite hoặc Fanpage quản trị của workspace ${workspaceId}.`);
    instructions.push(`2. Chọn 'Tạo bài viết' (Create Post) và dán toàn bộ nội dung từ file caption.txt.`);
    if (hasValidMedia) {
      const sourceDesc = resolvedFileName ? `từ file '${resolvedFileName}'` : 'từ link trong file media_urls.txt';
      const hashDesc = job.imageContentHash ? ` (Mã SHA-256 đã khóa: ${job.imageContentHash})` : '';
      instructions.push(`3. Tải ảnh/video ${sourceDesc}${hashDesc} và đính kèm vào bài viết.`);
    }
    if (isAiGenerated) {
      instructions.push(`4. QUAN TRỌNG: Bật tùy chọn 'Thông tin về AI' / 'Gắn nhãn do AI tạo' theo chính sách minh bạch của Meta.`);
    }
    instructions.push(`5. Chọn chế độ đăng (Đăng ngay hoặc Lên lịch) và bấm 'Đăng'.`);
    instructions.push(`6. Sao chép URL bài viết đã đăng và cập nhật lại external_post_id vào hệ thống.`);
  } else if (channel === 'TikTok') {
    instructions.push(`1. Đăng nhập TikTok Studio hoặc TikTok Web Upload (tiktok.com/creator-center/upload).`);
    instructions.push(`2. Tải video / ảnh từ link trong file media_urls.txt lên TikTok.`);
    instructions.push(`3. Dán nội dung từ file caption.txt vào ô Mô tả (Description/Title).`);
    instructions.push(`4. Trong mục Quyền riêng tư (Privacy Settings), chọn chế độ 'Chỉ mình tôi' (Only me) khi thử nghiệm.`);
    if (isAiGenerated) {
      instructions.push(`5. QUAN TRỌNG: Bật công tắc 'Nội dung do AI tạo' (AI-generated content switch) bắt buộc của TikTok.`);
    }
    instructions.push(`6. Bấm 'Đăng' (Post), sau đó kiểm tra và ghi nhận post_id vào hệ thống.`);
  } else {
    instructions.push(`1. Mở ứng dụng hoặc giao diện quản lý ${channel}.`);
    instructions.push(`2. Dán caption từ file caption.txt và đính kèm media từ media_urls.txt.`);
    instructions.push(`3. Đăng bài và lưu lại ID bài viết.`);
  }

  // Định dạng chi tiết media trong media_urls.txt
  const mediaDetails = hasValidMedia
    ? [
        `Media URL: ${job.mediaUrl || 'N/A'}`,
        `Type: ${job.mediaType || 'image'}`,
        `Content Hash (SHA-256): ${job.imageContentHash || 'N/A'}`,
        `Storage Key: ${job.storageKey || 'N/A'}`,
        `File Name: ${resolvedFileName || 'N/A'}`,
        `AI Generated: ${isAiGenerated ? 'Yes' : 'No'}`,
      ].join('\n')
    : 'Không có media đính kèm.';

  // Tạo các file trong virtual zip bundle
  const files: Record<string, string> = {
    'caption.txt': caption,
    'media_urls.txt': mediaDetails,
    'instructions.md': `# HƯỚNG DẪN ĐĂNG BÀI THỦ CÔNG (${channel.toUpperCase()})\n\n` +
      `- **Mã bài viết:** ${job.contentId}\n` +
      `- **Workspace:** ${workspaceId}\n` +
      `- **Nhãn AI:** ${isAiGenerated ? 'CÓ (Bắt buộc gắn nhãn AI)' : 'KHÔNG'}\n` +
      `- **Ảnh đính kèm (SHA-256):** ${job.imageContentHash || (hasValidMedia ? 'Có media' : 'Không có')}\n\n` +
      (hasMissingAsset ? `> ❌ **LỖI THIẾU TÀI SẢN**: ${missingAssetReason}\n\n` : '') +
      `## Các bước thực hiện:\n` +
      instructions.map((step) => `${step}`).join('\n\n'),
    'metadata.json': JSON.stringify(
      {
        contentId: job.contentId,
        workspaceId,
        channel,
        title,
        isAiGenerated,
        mediaUrl: job.mediaUrl,
        mediaType: job.mediaType,
        imageContentHash: job.imageContentHash,
        storageKey: job.storageKey,
        imageFileName: resolvedFileName,
        hasMissingAsset,
        missingAssetReason,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    ),
  };

  if (hasMissingAsset) {
    files['ERROR_MISSING_IMAGE.txt'] =
      `[CẢNH BÁO: KHÔNG ĐƯỢC ĐĂNG BÀI HỎNG]\n` +
      `Lý do: ${missingAssetReason}\n` +
      `Mã bài viết: ${job.contentId}\n` +
      `Workspace: ${workspaceId}\n` +
      `Vui lòng kiểm tra lại kho media_assets để tải ảnh hợp lệ trước khi thực hiện xuất bản.`;
  }

  // Đính kèm file ảnh trực tiếp vào gói virtual zip nếu có nội dung
  if (resolvedImageContent) {
    const filename = resolvedFileName || 'attached_image.webp';
    files[filename] = resolvedImageContent;
  }

  return {
    channel,
    contentId: job.contentId,
    workspaceId,
    title,
    bodyText: rawBody,
    caption,
    cta: job.cta,
    mediaUrl: job.mediaUrl,
    mediaType: job.mediaType,
    isAiGenerated,
    imageContentHash: job.imageContentHash,
    storageKey: job.storageKey,
    imageFileName: resolvedFileName,
    hasMissingAsset,
    missingAssetReason,
    utmSource,
    utmMedium,
    utmCampaign,
    label: 'manual-pack',
    createdAt: new Date(),
    instructions,
    files,
  };
}

export function generateManualPacks(
  job: ManualPackJobInput,
  channels: ('Facebook' | 'TikTok' | 'Instagram')[]
): ManualPack[] {
  return channels.map((channel) => generateManualPack(job, channel));
}
