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
        if (sql.includes("SELECT id, content FROM community_messages")) {
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
        expect.stringContaining("SELECT id, content FROM community_messages"),
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
        if (sql.includes("platform = 'facebook_message'")) return { rows: [{ id: "msg-fb", author_contact: "psid-123" }] };
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
  });
});
