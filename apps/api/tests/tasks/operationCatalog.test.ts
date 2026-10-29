import { describe, expect, it } from "vitest";
import {
  expectedRoleForOperation,
  missingTaskPrerequisite,
  normalizeTaskPayload,
} from "../../src/modules/tasks/catalog";

describe("executable agent task catalog", () => {
  it("keeps the six-agent operation mapping explicit", () => {
    expect(expectedRoleForOperation("research.run")).toBe("research");
    expect(expectedRoleForOperation("seo.local_draft")).toBe("seo");
    expect(expectedRoleForOperation("content.repurpose")).toBe("content");
    expect(expectedRoleForOperation("community.response")).toBe("community");
    expect(expectedRoleForOperation("analytics.report")).toBe("performance");
    expect(expectedRoleForOperation("unknown.operation")).toBeUndefined();
  });

  it("turns the lightweight modal fields into a dispatchable input", () => {
    const payload = normalizeTaskPayload("community.response", {
      title: "Answer a customer question",
      description: "Can TripC help me find a verified local experience?",
    });
    expect(payload.input).toEqual({
      operation: "community.response",
      question: "Can TripC help me find a verified local experience?",
    });
    expect(missingTaskPrerequisite("community.response", payload)).toBeNull();
  });

  it("fails closed when downstream work has no parent artifact", () => {
    expect(missingTaskPrerequisite("seo.local_draft", { input: { operation: "seo.local_draft" } })).toBe("research_artifact_id");
    expect(missingTaskPrerequisite("content.repurpose", { input: { operation: "content.repurpose", cta: "Contact TripC" } })).toBe("source_article_id");
  });
});
