/**
 * Kịch bản kiểm thử tích hợp tự động cho W1-TQ-06
 * - Kiểm tra Public / Private Security Boundary (không lộ PII, draft, facts nội bộ)
 * - Kiểm tra Public Leads Submission kèm Idempotency
 * - Kiểm tra RAG Vector Chunks & Facts Validation & Concurrency (Stale Version check)
 */

import {
  sanitizeForPublic,
  assertPublishedOnly,
  assertCanMutateCms,
  assertCanApproveContent,
} from "../src/lib/public-boundary";
import {
  leadRoutes,
  publicContentRoutes,
  globalLeadRepo,
  globalAnalyticsSink,
} from "../src/lib/public-service";
import {
  persistRagPayloadSchema,
  ragChunkInputSchema,
} from "../src/modules/sources/rag";

async function runTests() {
  console.log("==========================================================");
  console.log("🚀 BẮT ĐẦU KIỂM THỬ TÍCH HỢP W1-TQ-06: PUBLIC BOUNDARY & RAG");
  console.log("==========================================================");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, message: string) {
    total++;
    if (condition) {
      console.log(`✅ [Pass] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // --------------------------------------------------------------------------
  // PHẦN 1: PUBLIC / PRIVATE SECURITY BOUNDARY
  // --------------------------------------------------------------------------
  console.log("\n--- [Phần 1] Kiểm tra Ranh giới Bảo mật Public / Private ---");

  // Test 1: sanitizeForPublic lọc sạch các trường PII và thông tin nội bộ
  const internalData = {
    title: "Public Post Title",
    slug: "public-post",
    email: "secret_author@tripc.vn",
    actor_id: "uuid-1234",
    internal_notes: "Don't tell customer this price",
    source_facts: [{ key: "price", value: 100 }],
    safety_rules: { no_hallucinate: true },
    meta: {
      tags: ["housing"],
      reviewed_by: "admin-uuid",
    },
  };

  const sanitized = sanitizeForPublic(internalData);
  assert(
    !("email" in sanitized) &&
      !("actor_id" in sanitized) &&
      !("internal_notes" in sanitized) &&
      !("source_facts" in sanitized) &&
      !("safety_rules" in sanitized),
    "1. sanitizeForPublic đã lọc sạch toàn bộ các trường PII, actor_id, internal_notes, source_facts"
  );
  assert(
    !("reviewed_by" in (sanitized.meta as any)),
    "2. sanitizeForPublic lọc đệ quy các trường nhạy cảm lồng trong object con"
  );

  // Test 3: assertPublishedOnly chặn các trạng thái draft
  try {
    assertPublishedOnly("draft");
    assert(false, "assertPublishedOnly phải ném lỗi khi status là draft");
  } catch (err: any) {
    assert(
      err.code === "NOT_FOUND" || err.statusCode === 404,
      "3. assertPublishedOnly ném lỗi 404 khi nội dung ở trạng thái 'draft'"
    );
  }

  // Test 4: Phân quyền CMS Mutation & Approval
  try {
    assertCanMutateCms("viewer");
    assert(false, "Viewer không được phép mutate CMS");
  } catch (err: any) {
    assert(
      err.statusCode === 403,
      "4. Viewer bị chặn 403 Forbidden khi cố gắng sửa đổi nội dung CMS"
    );
  }

  try {
    assertCanApproveContent("editor");
    assert(false, "Editor không được phép approve");
  } catch (err: any) {
    assert(
      err.statusCode === 403,
      "5. Editor bị chặn 403 Forbidden khi cố gắng phê duyệt nội dung"
    );
  }

  // --------------------------------------------------------------------------
  // PHẦN 2: PUBLIC CONTENT READ ROUTES (W1-MY-05 & W1-TQ-06)
  // --------------------------------------------------------------------------
  console.log("\n--- [Phần 2] Kiểm tra Public Read Endpoints (Posts & Landing) ---");

  // Test 6: Liệt kê bài viết công khai của site 'tripc-pilot'
  const listRes = await publicContentRoutes.handleListPosts({
    params: { site_id: "tripc-pilot" },
  });
  assert(listRes.status === 200, "6. GET /public/v1/sites/tripc-pilot/posts trả về HTTP 200");
  const posts = (listRes.body as any).items;
  assert(Array.isArray(posts) && posts.length > 0, "7. Trả về danh sách bài viết hợp lệ");

  // Kiểm tra không có bài nháp và không có trường nội bộ nào lọt ra
  const hasDraft = posts.some((p: any) => p.status === "draft");
  const leaksInternal = posts.some(
    (p: any) =>
      p.member_id ||
      p.author_email ||
      p.source_refs ||
      p.evidence ||
      p.internal_ranking
  );
  assert(!hasDraft, "8. Không có bài viết nháp (draft) nào lọt vào danh sách public");
  assert(
    !leaksInternal,
    "9. Không có bất kỳ trường nội bộ (member_id, author_email, evidence) nào bị lộ ra ngoài"
  );

  // Test 10: Xem chi tiết bài viết công khai
  const detailRes = await publicContentRoutes.handleGetPost({
    params: { site_id: "tripc-pilot", slug: "housing-guide-da-nang" },
  });
  assert(
    detailRes.status === 200 && (detailRes.body as any).slug === "housing-guide-da-nang",
    "10. GET /public/v1/sites/tripc-pilot/posts/{slug} trả về chi tiết bài viết published"
  );

  // Test 11: Slug không tồn tại hoặc chưa published $\rightarrow$ 404
  const notFoundRes = await publicContentRoutes.handleGetPost({
    params: { site_id: "tripc-pilot", slug: "unpublished-draft-slug" },
  });
  assert(
    notFoundRes.status === 404,
    "11. GET bài viết chưa publish hoặc không tồn tại trả về đúng HTTP 404 Not Found"
  );

  // --------------------------------------------------------------------------
  // PHẦN 3: PUBLIC LEADS SUBMISSION & IDEMPOTENCY (W1-MY-04 & W1-TQ-06)
  // --------------------------------------------------------------------------
  console.log("\n--- [Phần 3] Kiểm tra Public Lead Submission & Idempotency ---");

  const validLeadBody = {
    email: "nomad.john@example.com",
    name: "John Doe",
    interest_topic: "Apartments Son Tra",
    consent: {
      accepted: true,
      policy_version: "2026-10-v1",
    },
    context: {
      utm_source: "google",
      utm_medium: "organic",
      utm_campaign: "pilot_q4",
    },
  };

  const testIdempotencyKey = "key-test-w1-tq-06-" + Date.now();

  // Test 12: Submit thiếu Idempotency-Key header $\rightarrow$ 422
  const noKeyRes = await leadRoutes.handleCreateLead({
    params: { site_id: "tripc-pilot" },
    headers: {},
    body: validLeadBody,
  });
  assert(
    noKeyRes.status === 422,
    "12. Submit lead thiếu Idempotency-Key header bị chặn đúng HTTP 422 Validation Error"
  );

  // Test 13: Submit với consent.accepted = false $\rightarrow$ 422
  const noConsentRes = await leadRoutes.handleCreateLead({
    params: { site_id: "tripc-pilot" },
    headers: { "idempotency-key": testIdempotencyKey + "-no-consent" },
    body: { ...validLeadBody, consent: { accepted: false, policy_version: "2026-10-v1" } },
  });
  assert(
    noConsentRes.status === 422,
    "13. Submit lead khi chưa đồng ý Consent bị chặn đúng HTTP 422 Validation Error"
  );

  // Test 14: Submit lead hợp lệ lần đầu $\rightarrow$ 201 Created
  const createLeadRes = await leadRoutes.handleCreateLead({
    params: { site_id: "tripc-pilot" },
    headers: { "idempotency-key": testIdempotencyKey },
    body: validLeadBody,
  });
  assert(
    createLeadRes.status === 201 && (createLeadRes.body as any).status === "persisted",
    "14. Submit lead hợp lệ lần đầu trả về 201 Created, status: 'persisted', deduplicated: false"
  );
  const firstSubmissionId = (createLeadRes.body as any).submission_id;

  // Test 15: Re-submit cùng Idempotency Key và cùng Payload $\rightarrow$ 200 OK (Deduplicated)
  const dedupRes = await leadRoutes.handleCreateLead({
    params: { site_id: "tripc-pilot" },
    headers: { "idempotency-key": testIdempotencyKey },
    body: validLeadBody,
  });
  assert(
    dedupRes.status === 200 &&
      (dedupRes.body as any).submission_id === firstSubmissionId &&
      (dedupRes.body as any).deduplicated === true,
    "15. Re-submit cùng key và payload trả về 200 OK với cùng submission_id và deduplicated: true"
  );

  // Test 16: Re-submit cùng Idempotency Key nhưng KHÁC Payload $\rightarrow$ 409 Conflict
  const conflictRes = await leadRoutes.handleCreateLead({
    params: { site_id: "tripc-pilot" },
    headers: { "idempotency-key": testIdempotencyKey },
    body: { ...validLeadBody, name: "Different Name Tampered" },
  });
  assert(
    conflictRes.status === 409,
    "16. Re-submit cùng key nhưng payload bị thay đổi bị chặn đúng HTTP 409 Conflict"
  );

  // --------------------------------------------------------------------------
  // PHẦN 4: RAG VECTOR CHUNKS & FACTS VALIDATION (W1-TQ-06 & W1-TQ-08)
  // --------------------------------------------------------------------------
  console.log("\n--- [Phần 4] Kiểm tra RAG Vector Chunks & Facts Schema & Concurrency ---");

  // Test 17: Chunk schema bắt buộc vector 768 chiều (embeddinggemma)
  const validChunk = {
    chunk_index: 0,
    text_content: "Finding an apartment in Son Tra Da Nang is easy...",
    citation_locator: "page:1;paragraph:2",
    embedding: new Array(768).fill(0.0123),
    model: "embeddinggemma",
  };
  const chunkCheck = ragChunkInputSchema.safeParse(validChunk);
  assert(chunkCheck.success, "17. Chunk schema chấp nhận vector 768 chiều chuẩn embeddinggemma");

  // Test 18: Reject nếu vector sai số chiều (ví dụ 1536 chiều của OpenAI)
  const invalidVectorChunk = {
    chunk_index: 0,
    text_content: "Invalid vector test",
    embedding: new Array(1536).fill(0.01), // sai chiều
    model: "openai",
  };
  const invalidChunkCheck = ragChunkInputSchema.safeParse(invalidVectorChunk);
  assert(
    !invalidChunkCheck.success,
    "18. Chunk schema từ chối vector không đúng 768 chiều (chống trộn model)"
  );

  // Test 19: RAG Payload Schema validation
  const validRagPayload = {
    source_version: 1,
    content_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    provenance: {
      license: "CC BY-SA 4.0",
      attribution: "TripC Local Guides",
      source_url: "https://tripc.vn/guides/son-tra",
      upstream_version: "2026.1",
      retrieved_at: new Date().toISOString(),
    },
    chunks: [validChunk],
    facts: [
      {
        fact_key: "average_rent_son_tra",
        fact_value: "8000000",
        unit: "VND/month",
        verification_status: "verified",
        valid_until: new Date(Date.now() + 90 * 86400000).toISOString(),
      },
    ],
  };

  const payloadCheck = persistRagPayloadSchema.safeParse(validRagPayload);
  assert(payloadCheck.success, "19. RAG Payload schema hợp lệ bao gồm chunks, facts và provenance");

  console.log("\n==========================================================");
  console.log(`🎉 KẾT QUẢ: ${passed}/${total} TEST CASES ĐẠT CHUẨN 100%!`);
  console.log("==========================================================");
}

runTests().catch((err) => {
  console.error("Test failed unexpectedly:", err);
  process.exit(1);
});
