import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { PublishingOutboxRunner } from './PublishingOutboxRunner';
import { TikTokPublisher, defaultTikTokUploadRoot } from './TikTokPublisher';
import type { CmsPublishRequest, CmsPublishResult } from './CmsPublisher';

/**
 * Agent 4 — TikTok: nhận outbox `merchant.tiktok.carousel` (API tạo khi bài lịch TikTok tới giờ),
 * dựng video carousel 720x1280 từ 3–5 ảnh món thật kèm nhạc nền (render_tiktok_carousel.py) rồi đăng
 * bằng TikTok Content Posting API (FILE_UPLOAD) với token OAuth của workspace.
 * Kết quả ghi vào payload.result để API đối soát lịch (CalendarPublisherService.reconcileTikTok).
 */
export interface CarouselPayload {
  calendar_entry_id: string;
  image_urls: string[];
  caption: string;
  title: string;
  brand: string;
  music_path?: string | null;
  result?: Record<string, unknown>;
}

export type RenderCarousel = (payload: CarouselPayload, outputPath: string) => Promise<void>;
export type PublishTikTok = (req: CmsPublishRequest) => Promise<CmsPublishResult>;

const MAX_ATTEMPTS = 3;

export const renderCarouselWithPython: RenderCarousel = (payload, outputPath) =>
  new Promise((resolve, reject) => {
    const script = path.resolve(__dirname, 'render_tiktok_carousel.py');
    const python = process.env.PYTHON_BIN?.trim() || 'python';
    const child = execFile(python, [script], { timeout: 240_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`carousel render failed: ${(stderr || err.message).slice(0, 400)}`));
      if (!fs.existsSync(outputPath)) return reject(new Error(`carousel render produced no file: ${stdout.slice(0, 200)}`));
      resolve();
    });
    child.stdin?.end(
      JSON.stringify({
        image_urls: payload.image_urls,
        output_path: outputPath,
        title: payload.title,
        brand: payload.brand,
        music_path: payload.music_path || process.env.TIKTOK_MUSIC_PATH?.trim() || null,
        seconds_per_image: 3,
      }),
    );
  });

export class MerchantTikTokCarouselRunner {
  private readonly authResolver: PublishingOutboxRunner;

  constructor(
    private readonly pool: Pool,
    private readonly render: RenderCarousel = renderCarouselWithPython,
    private readonly publish: PublishTikTok = (req) => new TikTokPublisher(process.env.TIKTOK_ACCESS_TOKEN || '', process.env.TIKTOK_OPEN_ID).publish(req),
    private readonly uploadRoot: string = defaultTikTokUploadRoot(),
  ) {
    this.authResolver = new PublishingOutboxRunner(pool);
  }

  async runOnce(): Promise<'idle' | 'published' | 'retry' | 'failed'> {
    const event = (
      await this.pool.query<{ id: string; workspace_id: string; payload: CarouselPayload; retry_count: number }>(`
        UPDATE outbox_events SET status = 'processing', retry_count = retry_count + 1
         WHERE id = (SELECT id FROM outbox_events WHERE event_type = 'merchant.tiktok.carousel' AND status = 'pending'
                      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
         RETURNING id, workspace_id, payload, retry_count`)
    ).rows[0];
    if (!event) return 'idle';
    const payload = event.payload;
    const safeWs = event.workspace_id.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeEntry = String(payload.calendar_entry_id).replace(/[^a-zA-Z0-9_-]/g, '');
    const outputPath = path.join(this.uploadRoot, safeWs, `carousel-${safeEntry}.mp4`);
    try {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        await this.render(payload, outputPath);
      }
      const auth = await this.authResolver.resolveTikTokAuth(event.workspace_id);
      const result = await this.publish({
        contentId: payload.calendar_entry_id,
        channel: 'TikTok',
        bodyMarkdown: payload.caption,
        metaTitle: payload.title,
        idempotencyKey: `tiktok-carousel:${payload.calendar_entry_id}`,
        workspaceId: event.workspace_id,
        mediaPath: outputPath,
        mediaType: 'video',
        ...(auth ? { authOverride: auth } : {}),
      });
      if (!result.success) throw new Error(`${result.errorCode ?? 'TIKTOK_PUBLISH_FAILED'}: ${result.errorMessage ?? 'publish failed'}`);
      await this.pool.query(
        `UPDATE outbox_events SET status = 'published', published_at = NOW(), payload = payload || $2::jsonb WHERE id = $1`,
        [event.id, JSON.stringify({ result: { publish_id: result.externalPostId ?? null, video_path: outputPath, published_url: result.publishedUrl ?? null } })],
      );
      return 'published';
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      const permanent = event.retry_count >= MAX_ATTEMPTS || /NOT_CONFIGURED|UNAUTHORIZED|access_token|need at least 3/i.test(message);
      await this.pool.query(
        `UPDATE outbox_events SET status = $2, payload = payload || $3::jsonb WHERE id = $1`,
        [event.id, permanent ? 'failed' : 'pending', JSON.stringify({ result: { error: message } })],
      );
      return permanent ? 'failed' : 'retry';
    }
  }
}
