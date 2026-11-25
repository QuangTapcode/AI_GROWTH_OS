/**
 * Nạp hồ sơ quán MINH HỌA (data/merchant/sample-restaurant-danang.json) vào một workspace để demo/ kiểm thử.
 * Chạy: npx tsx --env-file-if-exists=.env.local scripts/seed-sample-merchant.ts <workspace_id>
 * Không kích hoạt agent (không chạy tự động); chủ quán vẫn phải dán 4 link và bấm Kích hoạt.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pool from "../src/lib/db";
import { ZeroTechOnboardingService } from "../src/modules/onboarding/onboarding";

async function main() {
  const workspaceId = process.argv[2];
  if (!workspaceId || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    console.error("Usage: tsx scripts/seed-sample-merchant.ts <workspace_id>");
    process.exit(2);
  }
  const file = path.resolve(__dirname, "../../../data/merchant/sample-restaurant-danang.json");
  const { _note, ...settings } = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  console.log(_note);
  const state = await new ZeroTechOnboardingService(pool).updateSettings(workspaceId, settings);
  console.log(`Đã nạp hồ sơ "${state.settings.business_name}" (${state.settings.menu?.length ?? 0} món, ${state.settings.faq?.length ?? 0} hỏi đáp).`);
  await pool.end();
}

void main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
