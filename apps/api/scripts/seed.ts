import { createHash, randomBytes } from "crypto";
import pool from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

/**
 * Seed dữ liệu synthetic cho DB local (database/README: tenant A/B + roles).
 * - Chạy sau `npm run db:migrate`. Idempotent: ID cố định + ON CONFLICT DO NOTHING.
 * - Mật khẩu user demo: SEED_USER_PASSWORD, nếu không có thì sinh ngẫu nhiên và in ra một lần.
 *   User đã có mật khẩu thì giữ nguyên, trừ khi truyền SEED_USER_PASSWORD.
 * - Mọi payload có `synthetic: true`; không dùng cho staging chung/production.
 */

const TRIPC = "10000000-0000-4000-8000-000000000001"; // = lib/sites.ts 'tripc-pilot'
const HOIAN = "20000000-0000-4000-8000-000000000001"; // = lib/sites.ts 'other-site'

const USERS = [
  { id: "a0000000-0000-4000-8000-000000000001", email: "owner.tripc.demo@gmail.com", name: "Linh Tran", login: true },
  { id: "a0000000-0000-4000-8000-000000000002", email: "editor.tripc.demo@gmail.com", name: "Minh Nguyen", login: true },
  { id: "a0000000-0000-4000-8000-000000000003", email: "viewer.tripc.demo@gmail.com", name: "Hoa Pham", login: true },
  { id: "a0000000-0000-4000-8000-000000000004", email: "owner.hoian.demo@gmail.com", name: "Bao Le", login: true },
  // Trùng ID với dev token trong lib/auth.ts để test/dev token có membership thật
  { id: "11111111-1111-4000-8000-000000000001", email: "owner@tripc.local", name: "TripC Owner", login: false },
  { id: "22222222-2222-4000-8000-000000000002", email: "editor@tripc.local", name: "TripC Editor", login: false },
  { id: "33333333-3333-4000-8000-000000000003", email: "viewer@tripc.local", name: "TripC Viewer", login: false },
];

const MEMBERSHIPS: Array<[string, string, "owner" | "editor" | "viewer"]> = [
  [TRIPC, USERS[0].id, "owner"],
  [TRIPC, USERS[1].id, "editor"],
  [TRIPC, USERS[2].id, "viewer"],
  [TRIPC, USERS[4].id, "owner"],
  [TRIPC, USERS[5].id, "editor"],
  [TRIPC, USERS[6].id, "viewer"],
  [HOIAN, USERS[3].id, "owner"],
  [HOIAN, USERS[0].id, "editor"],
];

const CAMPAIGN = "c0000000-0000-4000-8000-000000000001";

// Thời điểm tương đối so với lúc seed, đơn vị phút trước hiện tại
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const T = (n: number) => `b0000000-0000-4000-8000-00000000000${n}`;
const A = (n: number) => `d0000000-0000-4000-8000-00000000000${n}`;

interface TaskSeed {
  id: string;
  workspace: string;
  campaign: string | null;
  role: string;
  operation: string;
  status: string;
  title: string;
  description: string;
  createdAgo: number;
  startedAgo?: number;
  completedAgo?: number;
  deps?: string[];
  error?: Record<string, unknown>;
  retries?: number;
}

const TASKS: TaskSeed[] = [
  {
    id: T(1), workspace: TRIPC, campaign: CAMPAIGN, role: "research", operation: "research.run", status: "completed",
    title: "Research Da Nang expat housing demand",
    description: "Collect search demand signals, competitor coverage and approved facts for expat housing in Da Nang.",
    createdAgo: 4320, startedAgo: 4318, completedAgo: 4312,
  },
  {
    id: T(2), workspace: TRIPC, campaign: CAMPAIGN, role: "growth_lead", operation: "opportunity.score", status: "completed",
    title: "Score growth opportunities for Central Vietnam",
    description: "Rank research findings by demand, competition and business value for TripC.",
    createdAgo: 4300, startedAgo: 4299, completedAgo: 4290, deps: [T(1)],
  },
  {
    id: T(3), workspace: TRIPC, campaign: CAMPAIGN, role: "growth_lead", operation: "brief.generate", status: "completed",
    title: "Brief: best neighborhoods for expats in Da Nang",
    description: "Turn the top-scored opportunity into an SEO content brief with CTA and required facts.",
    createdAgo: 2880, startedAgo: 2879, completedAgo: 2872, deps: [T(2)],
  },
  {
    id: T(4), workspace: TRIPC, campaign: CAMPAIGN, role: "content", operation: "content.generate", status: "awaiting_approval",
    title: "Draft article: where to live in Da Nang as an expat",
    description: "Write the long-form article from the approved brief; requires human approval before publishing.",
    createdAgo: 1440, startedAgo: 1438, deps: [T(3)],
  },
  {
    id: T(5), workspace: TRIPC, campaign: CAMPAIGN, role: "seo", operation: "seo.audit", status: "running",
    title: "Audit on-page SEO for the Da Nang housing guide",
    description: "Check titles, meta descriptions, internal links and schema for the housing guide cluster.",
    createdAgo: 120, startedAgo: 90,
  },
  {
    id: T(6), workspace: TRIPC, campaign: CAMPAIGN, role: "community", operation: "community.response", status: "queued",
    title: "Draft replies for Da Nang expat forum threads",
    description: "Prepare helpful, non-promotional replies to recent housing questions for human review.",
    createdAgo: 40,
  },
  {
    id: T(7), workspace: TRIPC, campaign: null, role: "performance", operation: "analytics.report", status: "failed",
    title: "Weekly performance report",
    description: "Summarize sessions, search clicks and leads for the last 7 days.",
    createdAgo: 300, startedAgo: 299, completedAgo: 298, retries: 2,
    error: { code: "GOOGLE_CREDENTIALS_NOT_CONFIGURED", message: "GA4 service account is not configured for this workspace" },
  },
  {
    id: T(8), workspace: TRIPC, campaign: CAMPAIGN, role: "content", operation: "content.repurpose", status: "pending",
    title: "Repurpose article into social snippets",
    description: "Create Facebook and LinkedIn snippets once the article is approved.",
    createdAgo: 1430, deps: [T(4)],
  },
  {
    id: T(9), workspace: HOIAN, campaign: null, role: "research", operation: "research.run", status: "completed",
    title: "Research Hoi An homestay search demand",
    description: "Tenant B isolation fixture.",
    createdAgo: 600, startedAgo: 598, completedAgo: 590,
  },
];

interface ArtifactSeed {
  id: string;
  workspace: string;
  task: string | null;
  role: string;
  operation: string;
  type: string;
  title: string;
  createdAgo: number;
  payload: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
}

const ARTIFACTS: ArtifactSeed[] = [
  {
    id: A(1), workspace: TRIPC, task: T(1), role: "research", operation: "research.run", type: "research_brief",
    title: "Research brief: Da Nang expat housing demand", createdAgo: 4312,
    payload: {
      synthetic: true,
      summary: "English-speaking expats researching Da Nang mostly search for long-term rentals near the beach (An Thuong, My Khe) and for neighborhood comparisons. Existing results are thin on safety, commute and coworking access.",
      target_cluster: "Da Nang expat housing",
      target_locale: "en-VN",
      keywords: [
        { keyword: "long term rental da nang", intent: "commercial", note: "Rental listings dominate; few neighborhood guides." },
        { keyword: "best area to live in da nang", intent: "informational", note: "Forum threads rank; content is outdated." },
        { keyword: "da nang apartment for expats", intent: "commercial", note: "Agency pages; weak local context." },
      ],
      missing_facts: ["Current average monthly rent per district (needs approved source)"],
    },
    evidence: [
      { url: "https://en.wikivoyage.org/wiki/Da_Nang", quote: "Da Nang is the largest city in central Vietnam.", fetched_at: ago(4315) },
    ],
  },
  {
    id: A(2), workspace: TRIPC, task: T(2), role: "growth_lead", operation: "opportunity.score", type: "opportunity_scores",
    title: "Opportunity scores: Central Vietnam housing", createdAgo: 4290,
    payload: {
      synthetic: true,
      summary: "Neighborhood guides score highest: strong commercial intent, weak competing content and direct fit with TripC housing services.",
      opportunities: [
        {
          topic: "Best neighborhoods for expats in Da Nang", keyword: "best area to live in da nang", intent: "informational",
          priority: "P0", demand_score: 8.5, competition_score: 3.2, business_value_score: 9.1, confidence: 0.86,
          hypothesis: "A neighborhood comparison with commute, coworking and beach access fills the gap left by outdated forum threads.",
        },
        {
          topic: "Long-term rental checklist for Da Nang", keyword: "long term rental da nang", intent: "commercial",
          priority: "P1", demand_score: 7.9, competition_score: 5.4, business_value_score: 8.2, confidence: 0.78,
          hypothesis: "A practical checklist converts renters who are comparing agencies.",
        },
        {
          topic: "Coworking spaces near An Thuong", keyword: "coworking da nang", intent: "commercial",
          priority: "P2", demand_score: 6.1, competition_score: 4.0, business_value_score: 6.8, confidence: 0.7,
          hypothesis: "Remote workers searching for coworking are a secondary audience for TripC housing.",
        },
      ],
    },
    evidence: [{ artifact_ref: A(1), note: "Scores derived from research brief A1" }],
  },
  {
    id: A(3), workspace: TRIPC, task: T(3), role: "growth_lead", operation: "brief.generate", type: "content_brief",
    title: "Content brief: best neighborhoods for expats in Da Nang", createdAgo: 2872,
    payload: {
      synthetic: true,
      summary: "Long-form guide comparing An Thuong, My Khe, Son Tra and Hai Chau for English-speaking expats, ending with a housing enquiry CTA.",
      primary_keyword: "best area to live in da nang",
      secondary_keywords: ["da nang neighborhoods", "where to stay long term da nang"],
      audience: "English-speaking expats living or planning to live in Da Nang",
      cta: "Ask TripC to shortlist apartments in your preferred neighborhood",
      topic_clusters: [
        { title: "Beachside living", description: "An Thuong and My Khe: walkability, noise, rental mix." },
        { title: "Quiet and green", description: "Son Tra: space and nature, longer commutes." },
        { title: "City centre", description: "Hai Chau: services, markets, river views." },
      ],
    },
    evidence: [{ artifact_ref: A(2), note: "Top opportunity from A2" }],
  },
  {
    id: A(4), workspace: TRIPC, task: T(4), role: "content", operation: "content.generate", type: "content_draft",
    title: "Where to live in Da Nang as an expat", createdAgo: 1430,
    payload: {
      synthetic: true,
      summary: "Draft article comparing four Da Nang neighborhoods for expats. Prices are omitted until approved facts exist.",
      target_cluster: "Da Nang expat housing",
      target_locale: "en-VN",
      document_markdown: [
        "# Where to live in Da Nang as an expat",
        "",
        "Choosing a neighborhood shapes your daily life in Da Nang more than the apartment itself.",
        "",
        "## An Thuong and My Khe",
        "Walkable streets, cafés and the beach a few minutes away. Expect more short-term rentals and some evening noise.",
        "",
        "## Son Tra",
        "Greener and quieter, close to the peninsula. You will rely more on a scooter or ride-hailing.",
        "",
        "## Hai Chau",
        "The city centre: markets, services and river views, further from the beach.",
        "",
        "## Next step",
        "Tell TripC which neighborhood fits you and we will shortlist apartments that match.",
      ].join("\n"),
      topic_clusters: [
        { title: "Beachside living", description: "An Thuong and My Khe" },
        { title: "Quiet and green", description: "Son Tra" },
        { title: "City centre", description: "Hai Chau" },
      ],
      missing_facts: ["Average monthly rent per neighborhood"],
    },
    evidence: [{ artifact_ref: A(3), note: "Written from brief A3" }],
  },
  {
    id: A(5), workspace: TRIPC, task: null, role: "content", operation: "content.repurpose", type: "social_snippets",
    title: "Social snippets: Da Nang beach apartments", createdAgo: 2000,
    payload: {
      synthetic: true,
      summary: "Three short posts promoting beachside apartments.",
      document_markdown: "1. Wake up to the sea in My Khe...\n2. Beach apartments from a low monthly price...\n3. Ask TripC for a shortlist.",
    },
    evidence: [],
  },
  {
    id: A(6), workspace: HOIAN, task: T(9), role: "research", operation: "research.run", type: "research_brief",
    title: "Research brief: Hoi An homestays", createdAgo: 590,
    payload: { synthetic: true, summary: "Tenant B isolation fixture." },
    evidence: [],
  },
];

function contentHash(title: string, payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify({ title, payload })).digest("hex");
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed synthetic data with NODE_ENV=production");
  }

  const providedPassword = process.env.SEED_USER_PASSWORD;
  const password = providedPassword || randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(password);

  const client = await pool.connect();
  let passwordsSet = 0;
  try {
    await client.query("BEGIN");

    for (const u of USERS) {
      await client.query(
        `INSERT INTO users (id, email, full_name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [u.id, u.email, u.name]
      );
      if (u.login) {
        const res = await client.query(
          `UPDATE users SET password_hash = $1, password_updated_at = NOW()
           WHERE id = $2 AND ($3::boolean OR password_hash IS NULL)`,
          [passwordHash, u.id, Boolean(providedPassword)]
        );
        passwordsSet += res.rowCount ?? 0;
      }
    }

    await client.query(
      `INSERT INTO workspaces (id, name, slug, timezone, default_language) VALUES
         ($1, 'TripC', 'tripc', 'Asia/Ho_Chi_Minh', 'en'),
         ($2, 'Hoi An Homestays', 'hoian-homestays', 'Asia/Ho_Chi_Minh', 'en')
       ON CONFLICT (id) DO NOTHING`,
      [TRIPC, HOIAN]
    );

    await client.query(
      `INSERT INTO business_profiles (workspace_id, company_name, website_url, industry, overview)
       VALUES ($1, 'TripC', 'https://tripc.vn', 'Travel & Expat Housing',
               'Helps English-speaking expats find housing, coworking and local services in Da Nang.'),
              ($2, 'Hoi An Homestays', NULL, 'Hospitality', 'Tenant B isolation fixture.')
       ON CONFLICT (workspace_id) DO NOTHING`,
      [TRIPC, HOIAN]
    );

    for (const [ws, user, role] of MEMBERSHIPS) {
      await client.query(
        `INSERT INTO memberships (workspace_id, user_id, role, status) VALUES ($1, $2, $3, 'active')
         ON CONFLICT (workspace_id, user_id) DO NOTHING`,
        [ws, user, role]
      );
    }

    await client.query(
      `INSERT INTO campaigns (id, workspace_id, name, utm_campaign, start_date, end_date)
       VALUES ($1, $2, 'Central Vietnam SEO — Q4', 'cv-seo-q4', CURRENT_DATE - 7, CURRENT_DATE + 60)
       ON CONFLICT (id) DO NOTHING`,
      [CAMPAIGN, TRIPC]
    );

    for (const t of TASKS) {
      await client.query(
        `INSERT INTO workflow_tasks (id, workspace_id, campaign_id, role, operation, status, payload,
           error_details, retry_count, started_at, completed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [
          t.id, t.workspace, t.campaign, t.role, t.operation, t.status,
          JSON.stringify({ synthetic: true, title: t.title, description: t.description }),
          t.error ? JSON.stringify(t.error) : null,
          t.retries ?? 0,
          t.startedAgo !== undefined ? ago(t.startedAgo) : null,
          t.completedAgo !== undefined ? ago(t.completedAgo) : null,
          ago(t.createdAgo),
          ago(t.completedAgo ?? t.startedAgo ?? t.createdAgo),
        ]
      );
    }
    for (const t of TASKS) {
      for (const dep of t.deps ?? []) {
        await client.query(
          `INSERT INTO task_dependencies (task_id, depends_on_task_id, workspace_id) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [t.id, dep, t.workspace]
        );
      }
    }

    const hashes = new Map<string, string>();
    for (const a of ARTIFACTS) {
      const hash = contentHash(a.title, a.payload);
      hashes.set(a.id, hash);
      await client.query(
        `INSERT INTO content_artifacts (id, workspace_id, task_id, version, content_hash, role, operation,
           artifact_type, title, storage, payload, evidence, created_at)
         VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, 'postgres_ledger', $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [a.id, a.workspace, a.task, hash, a.role, a.operation, a.type, a.title,
         JSON.stringify(a.payload), JSON.stringify(a.evidence), ago(a.createdAgo)]
      );
      await client.query(
        `UPDATE workflow_tasks SET result_ref = $1 WHERE id = $2 AND workspace_id = $3 AND result_ref IS NULL`,
        [a.id, a.task, a.workspace]
      );
    }

    const owner = USERS[0].id;
    const approvals: Array<[string, string, string, string | null, string | null, number]> = [
      // [id, artifact, status, decision, note, updated minutes ago]
      ["e0000000-0000-4000-8000-000000000001", A(4), "pending", null, null, 1425],
      ["e0000000-0000-4000-8000-000000000002", A(3), "pending", null, null, 2870],
      ["e0000000-0000-4000-8000-000000000003", A(1), "approved", "approve", "Facts and sources check out.", 4200],
      ["e0000000-0000-4000-8000-000000000004", A(2), "approved", "approve", null, 180],
      ["e0000000-0000-4000-8000-000000000005", A(5), "rejected", "reject",
        "Mentions a 'low monthly price' that is not in approved facts.", 1900],
    ];
    for (const [id, artifact, status, decision, note, updatedAgo] of approvals) {
      const art = ARTIFACTS.find((a) => a.id === artifact)!;
      await client.query(
        `INSERT INTO approvals (id, workspace_id, target_type, target_id, target_version, target_hash, status,
           decision, actor_id, actor_role, review_note, created_at, updated_at)
         VALUES ($1, $2, 'artifact', $3, 1, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [id, art.workspace, artifact, hashes.get(artifact), status, decision,
         decision ? owner : null, decision ? "owner" : null, note,
         ago(art.createdAgo - 2), ago(updatedAgo)]
      );
    }

    const leads: Array<[string, string, string, string, number]> = [
      ["f0000000-0000-4000-8000-000000000001", "james.k.demo@example.com", "James K.", "housing", 1500],
      ["f0000000-0000-4000-8000-000000000002", "sofia.r.demo@example.com", "Sofia R.", "coworking", 4300],
      ["f0000000-0000-4000-8000-000000000003", "an.demo@example.com", "An V.", "housing", 8600],
    ];
    for (const [id, email, name, topic, capturedAgo] of leads) {
      await client.query(
        `INSERT INTO leads (lead_id, workspace_id, site_id, idempotency_key, payload_hash, contact_email,
           contact_name, interest_topic, consent_accepted, consent_policy_version, utm_source, utm_medium,
           utm_campaign, context, captured_at, updated_at)
         VALUES ($1, $2, 'tripc-pilot', $3, $4, $5, $6, $7, true, 'v1.0', 'google', 'organic', 'cv-seo-q4',
                 '{"synthetic": true}'::jsonb, $8, $8)
         ON CONFLICT (lead_id) DO NOTHING`,
        [id, TRIPC, `seed-${id}`, createHash("sha256").update(email).digest("hex"), email, name, topic, ago(capturedAgo)]
      );
    }

    await client.query(
      `INSERT INTO system_exceptions (id, workspace_id, code, severity, source_task_id, assigned_owner, status,
         title, description, created_at)
       VALUES
         ('90000000-0000-4000-8000-000000000001', $1, 'GOOGLE_CREDENTIALS_NOT_CONFIGURED', 'high', $2, $3, 'open',
          'GA4 credentials missing', 'Performance reports cannot read sessions until a GA4 service account is connected.', $4),
         ('90000000-0000-4000-8000-000000000002', $1, 'CMS_NOT_CONNECTED', 'medium', NULL, $3, 'investigating',
          'CMS publisher not connected', 'Approved articles stay in the ledger until the pilot CMS adapter is configured.', $5)
       ON CONFLICT (id) DO NOTHING`,
      [TRIPC, T(7), owner, ago(297), ago(2000)]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  console.log("Seed completed: workspaces TripC + Hoi An Homestays.");
  console.log("Login accounts:");
  for (const u of USERS.filter((x) => x.login)) console.log(`  ${u.email}`);
  if (passwordsSet === 0) {
    console.log("Existing passwords kept. Set SEED_USER_PASSWORD to reset them.");
  } else if (providedPassword) {
    console.log(`Password set from SEED_USER_PASSWORD for ${passwordsSet} account(s).`);
  } else {
    console.log(`Generated password for ${passwordsSet} new account(s): ${password}`);
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
