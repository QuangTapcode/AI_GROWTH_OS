import { createInterface } from "node:readline";
import {
  buildDiscoveryQueries,
  refreshDiscoveryIfStale,
  searxngSearch,
  type DiscoveryProfile,
} from "../../../apps/api/src/modules/research/discovery";
import { policyFor } from "../../../apps/api/src/modules/research/sourcePolicy";

type HarnessInput = {
  action: "queries" | "policy" | "search" | "refresh";
  profile?: DiscoveryProfile;
  offset?: number;
  focus?: string[];
  url?: string;
  baseUrl?: string;
  query?: string;
  latestAt?: string | null;
  maxAgeHours?: number;
  now?: string;
};

async function run(input: HarnessInput): Promise<unknown> {
  if (input.action === "queries") {
    return buildDiscoveryQueries(
      input.profile ?? { locations: [], audiences: [], products: [] },
      input.offset ?? 0,
      input.focus ?? [],
    );
  }
  if (input.action === "policy") {
    return policyFor(input.url ?? "");
  }
  if (input.action === "search") {
    if (!input.baseUrl) throw new Error("baseUrl is required for search action");
    return searxngSearch(input.baseUrl)(input.query ?? "Da Nang housing");
  }
  if (input.action === "refresh") {
    const profile = {
      target_locations: input.profile?.locations ?? ["Da Nang"],
      target_audiences: input.profile?.audiences ?? ["Expats"],
      products_services: input.profile?.products ?? ["housing", "living_areas", "coworking"],
      research_strategy: null,
    };
    let insertedSourceId = 0;
    const pool = {
      query: async (sql: string) => {
        if (sql.includes("max(observed_at)")) return { rows: [{ at: input.latestAt ?? null }] };
        if (sql.includes("FROM business_profiles")) return { rows: [profile] };
        if (sql.includes("FROM growth_goals")) return { rows: [] };
        return { rows: [] };
      },
      connect: async () => ({
        query: async (sql: string) => {
          if (sql.startsWith("SELECT id FROM sources")) return { rows: [] };
          if (sql.includes("INSERT INTO sources")) return { rows: [{ id: `source-${++insertedSourceId}` }] };
          return { rows: [] };
        },
        release: () => undefined,
      }),
    } as Parameters<typeof refreshDiscoveryIfStale>[0];
    const searchedQueries: string[] = [];
    const realNow = Date.now;
    const now = input.now;
    if (now) Date.now = () => Date.parse(now);
    let result;
    try {
      result = await refreshDiscoveryIfStale(
        pool,
        "synthetic-workspace",
        async (query) => {
          searchedQueries.push(query);
          return [];
        },
        input.maxAgeHours ?? 24,
      );
    } finally {
      Date.now = realNow;
    }
    return { result, searchedQueries };
  }
  throw new Error(`Unknown harness action: ${String(input.action)}`);
}

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  void (async () => {
    try {
      const output = await run(JSON.parse(line) as HarnessInput);
      process.stdout.write(`${JSON.stringify({ ok: true, output })}\n`);
    } catch (error) {
      process.stdout.write(JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }) + "\n");
    }
  })();
});
