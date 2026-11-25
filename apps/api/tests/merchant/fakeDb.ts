/**
 * DB giả cho unit test agent merchant: mỗi rule là (regex SQL → hàm trả rows). Ghi lại mọi câu lệnh
 * để test kiểm tra hệ thống đã ghi gì (outbox, trạng thái...). connect() trả client dùng chung rules.
 */
export type Rule = [RegExp, (params: unknown[]) => unknown[] | undefined];

export interface FakeDb {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number }>;
  connect: () => Promise<{ query: FakeDb["query"]; release: () => void }>;
  calls: Array<{ sql: string; params: unknown[] }>;
  rules: Rule[];
  callsMatching: (re: RegExp) => Array<{ sql: string; params: unknown[] }>;
}

export function createFakeDb(rules: Rule[] = []): FakeDb {
  const calls: FakeDb["calls"] = [];
  const db: FakeDb = {
    rules,
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      for (const [re, handler] of db.rules) {
        if (re.test(sql)) {
          const rows = handler(params) ?? [];
          return { rows, rowCount: rows.length };
        }
      }
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      return { query: db.query, release: () => undefined };
    },
    callsMatching: (re: RegExp) => calls.filter((c) => re.test(c.sql)),
  };
  return db;
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Hồ sơ quán tối thiểu cho loadMerchantProfile (SELECT ... FROM workspaces w LEFT JOIN merchant_onboarding ...). */
export function profileRule(settings: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Rule {
  return [
    /FROM workspaces w\s+LEFT JOIN merchant_onboarding/,
    () => [
      {
        settings,
        business_name: "Quán Mẫu Đà Nẵng",
        fanpage_url: "https://facebook.com/quanmau",
        gmaps_url: "https://maps.app.goo.gl/abc",
        gdrive_url: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv",
        community_group_url: "https://facebook.com/groups/quanmau",
        parsed_refs: {},
        onboarding_completed: true,
        workspace_name: "Quán Mẫu",
        ...extra,
      },
    ],
  ];
}
