import { describe, it, expect, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import {
  receiveMessageInputSchema,
  updateMessageStatusSchema,
} from "../../src/modules/community/schemas";
import {
  CommunityService,
  processReceivedCommunityMessages,
} from "../../src/modules/community/service";
import { persistCommunityLead } from "../../src/modules/community/leads";

describe("Community Agent: Inbox API, Lead Persistence & Autopilot", () => {
  const workspaceId = "00000000-0000-0000-0000-000000000001";
  const actorId = "00000000-0000-0000-0000-000000000002";
  const snapshotId = "00000000-0000-0000-0000-000000000003";

  describe("1. Schema Validation", () => {
    it("validates incoming community message payloads across supported platforms", () => {
      const valid = {
        platform: "facebook_comment",
        external_id: "fb_comm_99182",
        author_name: "Alex Danang Expat",
        author_contact: "alex.expat@gmail.com",
        content: "How much is rent for a 1-bedroom studio near My Khe Beach?",
        post_url: "https://facebook.com/tripc/posts/123",
      };
      const result = receiveMessageInputSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("rejects unsupported platforms or missing content", () => {
      const invalidPlatform = {
        platform: "myspace",
        content: "Hello",
      };
      expect(receiveMessageInputSchema.safeParse(invalidPlatform).success).toBe(false);

      const missingContent = {
        platform: "facebook_comment",
        content: "   ",
      };
      expect(receiveMessageInputSchema.safeParse(missingContent).success).toBe(false);
    });

    it("validates status updates for community messages", () => {
      const valid = { status: "replied", lead_id: "00000000-0000-0000-0000-000000000099" };
      expect(updateMessageStatusSchema.safeParse(valid).success).toBe(true);

      const invalid = { status: "unknown_state" };
      expect(updateMessageStatusSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe("2. CommunityService & Inbox Processing", () => {
    it("receives message, inserts record, and enqueues AI community task when snapshot exists", async () => {
      const insertedMessage = {
        id: "msg-123",
        workspace_id: workspaceId,
        platform: "facebook_comment",
        external_id: "ext-1",
        author_name: "Linh Nguyen",
        author_contact: "0905123456",
        content: "Cho mình hỏi TripC có căn hộ dịch vụ ở An Thượng không?",
        post_url: null,
        status: "received",
        task_id: null,
        lead_id: null,
        metadata: {},
        received_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const query = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT id FROM workspaces")) {
          return { rows: [{ id: workspaceId }] };
        }
        if (sql.includes("SELECT role FROM memberships")) {
          return { rows: [{ role: "owner" }] };
        }
        if (sql.includes("SELECT snapshot_id FROM knowledge_contexts")) {
          return { rows: [{ snapshot_id: snapshotId }] };
        }
        if (sql.includes("INSERT INTO community_messages")) {
          return { rows: [insertedMessage] };
        }
        if (sql.includes("INSERT INTO workflow_tasks")) {
          return { rows: [{ id: "task-comm-001" }] };
        }
        if (sql.includes("UPDATE community_messages SET task_id")) {
          return { rows: [{ ...insertedMessage, task_id: "task-comm-001", status: "queued" }] };
        }
        return { rows: [] };
      });

      const pool = {
        query,
        connect: async () => ({
          query,
          release: vi.fn(),
        }),
      } as unknown as Pool;
      const service = new CommunityService(pool);

      const result = await service.receiveMessage(workspaceId, actorId, {
        platform: "facebook_comment",
        author_name: "Linh Nguyen",
        author_contact: "0905123456",
        content: "Cho mình hỏi TripC có căn hộ dịch vụ ở An Thượng không?",
      });

      expect(result.message.id).toBe("msg-123");
      expect(result.task_id).toBeDefined();
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT snapshot_id FROM knowledge_contexts"),
        [workspaceId],
      );
    });

    it("processes received unqueued messages during Autopilot cycle", async () => {
      const unhandled = [
        { id: "msg-a", content: "What are the best neighborhoods for remote workers in Da Nang?" },
        { id: "msg-b", content: "Giá phòng tháng tại An Thượng là bao nhiêu?" },
      ];

      const query = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT id FROM workspaces")) {
          return { rows: [{ id: workspaceId }] };
        }
        if (sql.includes("SELECT role FROM memberships")) {
          return { rows: [{ role: "owner" }] };
        }
        if (sql.includes("SELECT snapshot_id FROM knowledge_contexts")) {
          return { rows: [{ snapshot_id: snapshotId }] };
        }
        if (sql.includes("SELECT id, content, platform, author_contact FROM community_messages")) {
          return { rows: unhandled };
        }
        if (sql.includes("INSERT INTO workflow_tasks")) {
          return { rows: [{ id: "task-enqueued" }] };
        }
        if (sql.includes("UPDATE community_messages SET task_id")) {
          return { rowCount: 1 };
        }
        return { rows: [] };
      });

      const pool = {
        query,
        connect: async () => ({
          query,
          release: vi.fn(),
        }),
      } as unknown as Pool;
      const enqueuedCount = await processReceivedCommunityMessages(pool, workspaceId, actorId, snapshotId);

      expect(enqueuedCount).toBe(2);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("FROM community_messages"),
        [workspaceId, 10],
      );
    });
  });

  describe("3. Lead Persistence from Community Responses", () => {
    it("persists a lead with UTM source 'community' when community response has a lead proposal", async () => {
      const artifactId = "00000000-0000-0000-0000-000000000100";
      const taskId = "00000000-0000-0000-0000-000000000200";

      const clientQuery = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, role, task_id, payload FROM content_artifacts")) {
          return {
            rows: [
              {
                id: artifactId,
                role: "community",
                task_id: taskId,
                payload: {
                  result: {
                    reply: "TripC offers modern verified apartments in An Thuong and My Khe.",
                    lead_proposal: {
                      intent: "request_information",
                      status: "proposed",
                      contact: {
                        email: "expat.marcus@gmail.com",
                        phone: "+84905123999",
                      },
                    },
                  },
                },
              },
            ],
          };
        }
        if (sql.includes("SELECT id, author_name, author_contact, content FROM community_messages")) {
          return {
            rows: [
              {
                id: "msg-marcus",
                author_name: "Marcus Miller",
                author_contact: "expat.marcus@gmail.com",
                content: "Looking for 6-month rental in Da Nang. Email me at expat.marcus@gmail.com",
              },
            ],
          };
        }
        if (sql.includes("INSERT INTO leads")) {
          return { rows: [{ lead_id: "lead-new-001" }] };
        }
        if (sql.includes("UPDATE community_messages SET lead_id")) {
          return { rowCount: 1 };
        }
        return { rows: [] };
      });

      const client = { query: clientQuery } as unknown as PoolClient;
      const savedLeadId = await persistCommunityLead(client, workspaceId, artifactId, actorId);

      expect(savedLeadId).toBe("lead-new-001");
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO leads"),
        expect.arrayContaining([
          "00000000-0000-0000-0000-000000000001", // workspaceId
          "expat.marcus@gmail.com",
          "Marcus Miller",
          "+84905123999",
        ]),
      );
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE community_messages SET lead_id = $3, status = 'replied'"),
        [workspaceId, "msg-marcus", "lead-new-001"],
      );
    });

    it("never stores a Messenger user id as the lead's phone and leaves 'replied' to the worker that sends", async () => {
      const artifactId = "00000000-0000-0000-0000-000000000102";
      const taskId = "00000000-0000-0000-0000-000000000202";
      const clientQuery = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, role, task_id, payload FROM content_artifacts")) {
          return { rows: [{ id: artifactId, role: "community", task_id: taskId, payload: { result: {
            status: "draft", reply: "Street food stalls open every evening near the river.", escalation_required: false,
            lead_proposal: { intent: "request_information", status: "proposed", contact: {} } } } }] };
        }
        if (sql.includes("platform IN ('facebook_message', 'telegram_message')")) return { rows: [{ id: "msg-fb", platform: "facebook_message", author_contact: "psid-123", metadata: {} }] };
        if (sql.includes("SELECT id, author_name, author_contact, content FROM community_messages")) {
          return { rows: [{ id: "msg-fb", author_name: "Facebook user", author_contact: "psid-123", content: "Street food?" }] };
        }
        if (sql.includes("INSERT INTO leads")) return { rows: [{ lead_id: "lead-fb" }] };
        return { rows: [], rowCount: 1 };
      });
      await persistCommunityLead({ query: clientQuery } as unknown as PoolClient, workspaceId, artifactId, actorId);
      const lead = clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO leads"))!;
      expect(lead[1]).not.toContain("psid-123");
      expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("status = 'replied'"))).toBe(false);
    });

    it("lists a question the bot could not answer from its sources, so sources can be found for it", async () => {
      const artifactId = "00000000-0000-0000-0000-000000000105";
      const clientQuery = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, role, task_id, payload FROM content_artifacts")) {
          return { rows: [{ id: artifactId, role: "community", task_id: "00000000-0000-0000-0000-000000000205", payload: { result: {
            status: "insufficient_data", reply: "Chào bạn! ... nhóm Facebook ...", escalation_required: true, missing_facts: ["grounded_answer"] } } }] };
        }
        if (sql.includes("platform IN ('facebook_message', 'telegram_message')")) {
          return { rows: [{ id: "msg-gap", platform: "telegram_message", author_contact: "-100123", content: "Cù Lao Chàm đi thế nào", metadata: {} }] };
        }
        if (sql.includes("INSERT INTO community_knowledge_gaps")) {
          return { rows: [{ id: "gap-1", workspace_id: workspaceId, key: "cu lao cham di the nao", question: "Cù Lao Chàm đi thế nào", ask_count: 1,
            status: "open", topic: null, proposed: [], last_asked_at: new Date(), last_checked_at: null, reopened: 0 }] };
        }
        return { rows: [], rowCount: 1 };
      });
      await persistCommunityLead({ query: clientQuery } as unknown as PoolClient, workspaceId, artifactId, actorId);
      const gap = clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO community_knowledge_gaps"));
      expect(gap?.[1]).toEqual(expect.arrayContaining([workspaceId, "cu lao cham di the nao", "Cù Lao Chàm đi thế nào"]));
    });

    it("answers a Telegram group question in the group, as a reply to the asking message", async () => {
      const artifactId = "00000000-0000-0000-0000-000000000104";
      const clientQuery = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, role, task_id, payload FROM content_artifacts")) {
          return { rows: [{ id: artifactId, role: "community", task_id: "00000000-0000-0000-0000-000000000204", payload: { result: {
            status: "draft", reply: "Buy an eSIM before you fly.", escalation_required: false,
            lead_proposal: { intent: "request_information", status: "proposed", contact: {} } } } }] };
        }
        if (sql.includes("platform IN ('facebook_message', 'telegram_message')")) {
          return { rows: [{ id: "msg-grp", platform: "telegram_message", author_contact: "-100123",
            metadata: { chat_type: "supergroup", reply_to_message_id: 11, from_id: 777 } }] };
        }
        return { rows: [], rowCount: 1 };
      });
      await persistCommunityLead({ query: clientQuery } as unknown as PoolClient, workspaceId, artifactId, actorId);
      const outbox = clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO outbox_events"))!;
      expect(JSON.parse(outbox[1][2])).toMatchObject({ recipient: "-100123", platform: "telegram_message", reply_to_message_id: 11 });
    });

    it("queues a Telegram reply for its chat and connected account, and never stores the chat id as a phone", async () => {
      const artifactId = "00000000-0000-0000-0000-000000000103";
      const taskId = "00000000-0000-0000-0000-000000000203";
      const clientQuery = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, role, task_id, payload FROM content_artifacts")) {
          return { rows: [{ id: artifactId, role: "community", task_id: taskId, payload: { result: {
            status: "draft", reply: "Street food stalls open every evening near the river.", escalation_required: false,
            lead_proposal: { intent: "request_information", status: "proposed", contact: {} } } } }] };
        }
        if (sql.includes("platform IN ('facebook_message', 'telegram_message')")) {
          return { rows: [{ id: "msg-tg", platform: "telegram_message", author_contact: "-100555", metadata: { business_connection_id: "conn-1", chat_type: "supergroup", reply_to_message_id: 78 } }] };
        }
        if (sql.includes("SELECT id, author_name, author_contact, content FROM community_messages")) {
          return { rows: [{ id: "msg-tg", author_name: "Telegram user", author_contact: "-100555", content: "Street food?" }] };
        }
        if (sql.includes("INSERT INTO leads")) return { rows: [{ lead_id: "lead-tg" }] };
        return { rows: [], rowCount: 1 };
      });
      await persistCommunityLead({ query: clientQuery } as unknown as PoolClient, workspaceId, artifactId, actorId);
      const outbox = clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO outbox_events"))!;
      expect(JSON.parse(outbox[1][2])).toMatchObject({ message_id: "msg-tg", recipient: "-100555", platform: "telegram_message", business_connection_id: "conn-1", reply_to_message_id: 78 });
      const lead = clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO leads"))!;
      expect(lead[1]).not.toContain("-100555");
      expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("status = 'replied'"))).toBe(false);
    });

    it("marks linked community message as replied even when artifact has no lead proposal", async () => {
      const artifactId = "00000000-0000-0000-0000-000000000101";
      const taskId = "00000000-0000-0000-0000-000000000201";

      const clientQuery = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, role, task_id, payload FROM content_artifacts")) {
          return {
            rows: [
              {
                id: artifactId,
                role: "community",
                task_id: taskId,
                payload: {
                  result: {
                    reply: "TripC has office locations in Da Nang.",
                    lead_proposal: null,
                  },
                },
              },
            ],
          };
        }
        if (sql.includes("UPDATE community_messages SET status = 'replied'")) {
          return { rowCount: 1 };
        }
        return { rows: [] };
      });

      const client = { query: clientQuery } as unknown as PoolClient;
      const result = await persistCommunityLead(client, workspaceId, artifactId, actorId);

      expect(result).toBeNull();
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE community_messages SET status = 'replied'"),
        [workspaceId, taskId],
      );
    });

    it("skips queuing outbox reply for facebook_comment when auto_reply_comments is disabled", async () => {
      const artifactId = "00000000-0000-0000-0000-000000000105";
      const taskId = "00000000-0000-0000-0000-000000000205";
      const clientQuery = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, role, task_id, payload FROM content_artifacts")) {
          return {
            rows: [
              {
                id: artifactId,
                role: "community",
                task_id: taskId,
                payload: {
                  result: {
                    status: "draft",
                    reply: "Bạn có thể xem khu An Thượng ở Đà Nẵng nhé.",
                    lead_proposal: null,
                  },
                },
              },
            ],
          };
        }
        if (sql.includes("FROM community_messages WHERE workspace_id = $1 AND task_id = $2")) {
          return {
            rows: [
              {
                id: "msg-cmt-disabled",
                platform: "facebook_comment",
                author_contact: "user-123",
                author_name: "Ngọc Lan",
                content: "Khu nào gần biển Mỹ Khê ạ?",
                metadata: { comment_id: "cmt-555", comment_source: "page", from_name: "Ngọc Lan" },
              },
            ],
          };
        }
        if (sql.includes("FROM community_hub_settings WHERE workspace_id = $1")) {
          return {
            rows: [
              {
                group_url: "https://www.facebook.com/groups/1134282109069209",
                auto_reply_comments: false,
                auto_invite_enabled: true,
                daily_invite_limit: 12,
              },
            ],
          };
        }
        if (sql.includes("FROM community_invite_logs")) {
          return { rows: [{ invited_before: false, today_count: 2 }] };
        }
        return { rows: [], rowCount: 1 };
      });

      await persistCommunityLead({ query: clientQuery } as unknown as PoolClient, workspaceId, artifactId, actorId);
      expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO outbox_events"))).toBe(false);
    });

    it("queues facebook_comment page reply with RAG text + Group invite link & should_private_invite when enabled", async () => {
      const artifactId = "00000000-0000-0000-0000-000000000106";
      const taskId = "00000000-0000-0000-0000-000000000206";
      const clientQuery = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, role, task_id, payload FROM content_artifacts")) {
          return {
            rows: [
              {
                id: artifactId,
                role: "community",
                task_id: taskId,
                payload: {
                  result: {
                    status: "draft",
                    reply: "Khu An Thượng có nhiều căn hộ dịch vụ cách biển 5 phút đi bộ.",
                    lead_proposal: null,
                  },
                },
              },
            ],
          };
        }
        if (sql.includes("FROM community_messages WHERE workspace_id = $1 AND task_id = $2")) {
          return {
            rows: [
              {
                id: "msg-cmt-enabled",
                platform: "facebook_comment",
                author_contact: "comment:cmt-777",
                author_name: "Minh Quân",
                content: "An Thượng thuê dài hạn có tiện không ạ?",
                post_url: "https://facebook.com/post/1",
                metadata: { comment_id: "cmt-777", comment_source: "page", from_name: "Minh Quân" },
              },
            ],
          };
        }
        if (sql.includes("FROM community_hub_settings WHERE workspace_id = $1")) {
          return {
            rows: [
              {
                group_url: "https://www.facebook.com/groups/1134282109069209",
                auto_reply_comments: true,
                auto_invite_enabled: true,
                daily_invite_limit: 12,
              },
            ],
          };
        }
        if (sql.includes("FROM community_invite_logs")) {
          return { rows: [{ invited_before: false, today_count: 1 }] };
        }
        return { rows: [], rowCount: 1 };
      });

      await persistCommunityLead({ query: clientQuery } as unknown as PoolClient, workspaceId, artifactId, actorId);
      const outbox = clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO outbox_events"));
      expect(outbox).toBeDefined();
      const payload = JSON.parse(String(outbox![1][2]));
      expect(payload).toMatchObject({
        message_id: "msg-cmt-enabled",
        platform: "facebook_comment",
        comment_id: "cmt-777",
        comment_source: "page",
        should_private_invite: true,
        invite_group_url: "https://www.facebook.com/groups/1134282109069209",
      });
      expect(payload.text).toContain("https://www.facebook.com/groups/1134282109069209");
    });

    it("attaches Facebook community CTA + inline keyboard to Telegram replies once per 24h cooldown", async () => {
      const artifactId = "00000000-0000-0000-0000-000000000107";
      const taskId = "00000000-0000-0000-0000-000000000207";
      let recentInvite = false;
      const clientQuery = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, role, task_id, payload FROM content_artifacts")) {
          return {
            rows: [{
              id: artifactId,
              role: "community",
              task_id: taskId,
              payload: { result: { status: "draft", reply: "Bãi biển Mỹ Khê rất gần khu An Thượng.", lead_proposal: null } },
            }],
          };
        }
        if (sql.includes("FROM community_messages WHERE workspace_id = $1 AND task_id = $2")) {
          return {
            rows: [{
              id: "msg-tg-cta",
              platform: "telegram_message",
              author_contact: "555",
              author_name: "Minh",
              content: "Ở Đà Nẵng khu nào gần biển vậy bạn?",
              metadata: {},
            }],
          };
        }
        if (sql.includes("FROM community_hub_settings WHERE workspace_id = $1")) {
          return {
            rows: [{
              community_name: "Cộng đồng TripC Đà Nẵng",
              group_url: "https://www.facebook.com/groups/1134282109069209",
              auto_invite_enabled: true,
            }],
          };
        }
        if (sql.includes("FROM community_invite_logs")) {
          return { rows: [{ invited_before: recentInvite, recent_telegram_invite: recentInvite, today_count: 1 }] };
        }
        return { rows: [], rowCount: 1 };
      });

      await persistCommunityLead({ query: clientQuery } as unknown as PoolClient, workspaceId, artifactId, actorId);
      const firstOutbox = JSON.parse(String(clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO outbox_events"))![1][2]));
      expect(firstOutbox.should_community_invite).toBe(true);
      expect(firstOutbox.text).toContain("https://www.facebook.com/groups/1134282109069209");
      expect(firstOutbox.reply_markup?.inline_keyboard?.[0]?.[0]?.url).toBe("https://www.facebook.com/groups/1134282109069209");

      recentInvite = true;
      clientQuery.mockClear();
      await persistCommunityLead({ query: clientQuery } as unknown as PoolClient, workspaceId, artifactId, actorId);
      const secondOutbox = JSON.parse(String(clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO outbox_events"))![1][2]));
      expect(secondOutbox.should_community_invite).toBe(false);
      expect(secondOutbox.text).toBe("Bãi biển Mỹ Khê rất gần khu An Thượng.");
    });
  });
});
