/**
 * Registers the Community webhook with Telegram and prints what Telegram reports back.
 * Usage from apps/api: npm run telegram:webhook [-- <public webhook url>]
 */
const DEFAULT_URL = 'https://aigrowthos-staging.pages.dev/v1/webhooks/telegram';

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required');

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
  await call('setWebhook', { url: process.argv[2] ?? DEFAULT_URL, secret_token: secret, allowed_updates: ['message', 'business_message'] });
  const info = await call<{ url: string; pending_update_count: number; last_error_message?: string }>('getWebhookInfo');
  console.log(`bot: @${bot.username}`);
  console.log(`webhook: ${info.url}`);
  console.log(`pending updates: ${info.pending_update_count}`);
  if (info.last_error_message) console.log(`last error: ${info.last_error_message}`);
}

void main().catch((error) => { console.error((error as Error).message); process.exit(1); });
