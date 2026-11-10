/**
 * Manages Telegram Bot commands & Webhook / Polling setup.
 * Usage from apps/api:
 *   npm run telegram:webhook -- https://<public-domain>/v1/webhooks/telegram
 *   npm run telegram:webhook -- --ngrok       (auto-detects local ngrok HTTPS tunnel on port 4040)
 *   npm run telegram:webhook -- --delete      (removes webhook so local Long Polling worker can run)
 */
const DEFAULT_URL = 'https://aigrowthos-staging.pages.dev/v1/webhooks/telegram';

const BOT_COMMANDS = [
  { command: 'start', description: 'Bắt đầu trò chuyện & nhận tư vấn du lịch' },
  { command: 'community', description: 'Nhận link tham gia Cộng đồng Facebook TripC' },
  { command: 'help', description: 'Xem hướng dẫn & chủ đề bot có thể hỗ trợ' },
];

async function detectNgrokWebhookUrl(): Promise<string | null> {
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels', { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return null;
    const data = await res.json() as { tunnels?: Array<{ public_url?: string }> };
    const httpsUrl = data.tunnels?.find((t) => t.public_url?.startsWith('https://'))?.public_url;
    return httpsUrl ? `${httpsUrl.replace(/\/$/, '')}/v1/webhooks/telegram` : null;
  } catch {
    return null;
  }
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

  const call = async <T>(method: string, body?: unknown): Promise<T> => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await response.json() as { ok: boolean; description?: string; result: T };
    if (!json.ok) throw new Error(`${method}: ${json.description ?? `HTTP ${response.status}`}`);
    return json.result;
  };

  const bot = await call<{ username: string }>('getMe');
  await call('setMyCommands', { commands: BOT_COMMANDS });

  const arg = process.argv[2]?.trim();
  if (arg === '--delete' || arg === '--polling') {
    await call('deleteWebhook', { drop_pending_updates: false });
    console.log(`bot: @${bot.username}`);
    console.log('webhook: deleted (ready for local Long Polling mode)');
    return;
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error('TELEGRAM_WEBHOOK_SECRET is required when setting a webhook');

  let targetUrl = arg && arg !== '--ngrok' ? arg : null;
  if (!targetUrl && arg === '--ngrok') {
    targetUrl = await detectNgrokWebhookUrl();
    if (!targetUrl) throw new Error('No HTTPS ngrok tunnel found on http://127.0.0.1:4040');
  }
  if (!targetUrl) targetUrl = DEFAULT_URL;

  await call('setWebhook', { url: targetUrl, secret_token: secret, allowed_updates: ['message', 'business_message'] });
  const info = await call<{ url: string; pending_update_count: number; last_error_message?: string }>('getWebhookInfo');
  console.log(`bot: @${bot.username}`);
  console.log(`webhook: ${info.url}`);
  console.log(`pending updates: ${info.pending_update_count}`);
  if (info.last_error_message) console.log(`last error: ${info.last_error_message}`);
}

void main().catch((error) => { console.error((error as Error).message); process.exit(1); });
