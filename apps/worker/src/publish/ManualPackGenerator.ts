/**
 * Manual pack generator for social channels when live publishing is not available
 * (e.g. pending Meta App Review / TikTok for Developers approval, permission denied).
 *
 * Produces a labeled manual pack (zip bundle & copy-paste instructions) that editors
 * can use to publish safely by hand.
 */

export interface ManualPackFile {
  filename: string;
  content: string;
}

export interface ManualPack {
  channel: 'Facebook' | 'TikTok' | 'Instagram';
  contentId: string;
  workspaceId: string;
  title: string;
  bodyText: string;
  caption: string;
  cta?: string;
  mediaUrl?: string;
  mediaType?: 'video' | 'image';
  isAiGenerated: boolean;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  label: 'manual-pack'; // UI shows this label to distinguish from live publish
  createdAt: Date;
  instructions: string[];
  files: Record<string, string>; // Virtual zip package files: { filename: content }
}

export function generateManualPack(
  job: {
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
  },
  channel: 'Facebook' | 'TikTok' | 'Instagram'
): ManualPack {
  const workspaceId = job.workspaceId ?? job.workspace_id ?? 'unknown';
  const utmSource = job.utmSource || 'social';
  const utmMedium = job.utmMedium || channel.toLowerCase();
  const utmCampaign = job.utmCampaign || 'manual-pack';
  const isAiGenerated = Boolean(job.isAiGenerated);
  const title = job.metaTitle || job.title || 'Untitled';
  const rawBody = job.bodyMarkdown || '';

  // Chuẩn bị caption hoàn chỉnh có nhãn AI theo chính sách nếu cần
  let caption = rawBody.trim();
  if (isAiGenerated) {
    if (channel === 'Facebook') {
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
  if (channel === 'Facebook') {
    instructions.push(`1. Mở Meta Business Suite hoặc Fanpage quản trị của workspace ${workspaceId}.`);
    instructions.push(`2. Chọn 'Tạo bài viết' (Create Post) và dán toàn bộ nội dung từ file caption.txt.`);
    if (job.mediaUrl) {
      instructions.push(`3. Tải ảnh/video từ link trong file media_urls.txt và đính kèm vào bài viết.`);
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

  // Tạo các file trong virtual zip bundle
  const files: Record<string, string> = {
    'caption.txt': caption,
    'media_urls.txt': job.mediaUrl ? `Media URL: ${job.mediaUrl}\nType: ${job.mediaType || 'unknown'}` : 'Không có media đính kèm.',
    'instructions.md': `# HƯỚNG DẪN ĐĂNG BÀI THỦ CÔNG (${channel.toUpperCase()})\n\n` +
      `- **Mã bài viết:** ${job.contentId}\n` +
      `- **Workspace:** ${workspaceId}\n` +
      `- **Nhãn AI:** ${isAiGenerated ? 'CÓ (Bắt buộc gắn nhãn AI)' : 'KHÔNG'}\n\n` +
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
        createdAt: new Date().toISOString(),
      },
      null,
      2
    ),
  };

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
  job: {
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
  },
  channels: ('Facebook' | 'TikTok' | 'Instagram')[]
): ManualPack[] {
  return channels.map((channel) => generateManualPack(job, channel));
}
