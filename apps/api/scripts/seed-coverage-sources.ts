/**
 * Queues open-licence travel pages that widen what the Community bot can answer: destinations beyond central
 * Vietnam, seasons/climate, food, festivals and entry rules (coverage matrix in
 * services/ai/evals/datasets/community_retrieval_v2.json).
 *
 *   npx tsx scripts/seed-coverage-sources.ts            # list what would be added (no write)
 *   npx tsx scripts/seed-coverage-sources.ts --apply    # create them as 'imported'
 *
 * Created sources follow the normal path: the worker fetches and chunks them, they wait in needs_review, and only
 * the owner's approval lets the bot quote them. Pages already in the workspace (any status, accents ignored) are skipped.
 */
import pool, { query } from '../src/lib/db';
import { createSource } from '../src/modules/sources/repository';

type Seed = { site: 'en.wikivoyage.org' | 'en.wikipedia.org'; page: string; topic: string };

export const COVERAGE_SEEDS: Seed[] = [
  // Destinations travellers ask about most, outside the central coast already covered.
  { site: 'en.wikivoyage.org', page: 'Hanoi', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Ho Chi Minh City', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Nha Trang', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Da Lat', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Phu Quoc', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Sa Pa', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Ninh Binh', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Phong Nha-Ke Bang', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Quy Nhon', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Mui Ne', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Con Dao', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Can Tho', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Cat Ba', topic: 'destination' },
  { site: 'en.wikivoyage.org', page: 'Northern Vietnam', topic: 'region' },
  { site: 'en.wikivoyage.org', page: 'Central Coast (Vietnam)', topic: 'region' },
  { site: 'en.wikivoyage.org', page: 'Southern Vietnam', topic: 'region' },
  // Topics every destination shares.
  { site: 'en.wikivoyage.org', page: 'Vietnamese cuisine', topic: 'food' },
  { site: 'en.wikivoyage.org', page: 'Vietnamese phrasebook', topic: 'language' },
  { site: 'en.wikipedia.org', page: 'Climate of Vietnam', topic: 'season' },
  { site: 'en.wikipedia.org', page: 'Visa policy of Vietnam', topic: 'visa' },
  { site: 'en.wikipedia.org', page: 'Mid-Autumn Festival', topic: 'culture' },
  { site: 'en.wikipedia.org', page: 'Áo dài', topic: 'culture' },
  // Dishes and sights people name in questions about Da Nang, Hoi An and Hue.
  { site: 'en.wikipedia.org', page: 'Bánh mì', topic: 'food' },
  { site: 'en.wikipedia.org', page: 'Mì Quảng', topic: 'food' },
  { site: 'en.wikipedia.org', page: 'Cao lầu', topic: 'food' },
  { site: 'en.wikipedia.org', page: 'Bún bò Huế', topic: 'food' },
  { site: 'en.wikipedia.org', page: 'Bánh xèo', topic: 'food' },
  { site: 'en.wikipedia.org', page: 'Ngũ Hành Sơn', topic: 'sight' },
  { site: 'en.wikipedia.org', page: 'Dragon Bridge (Da Nang)', topic: 'sight' },
  { site: 'en.wikipedia.org', page: 'Golden Bridge (Vietnam)', topic: 'sight' },
  { site: 'en.wikipedia.org', page: 'Hạ Long Bay', topic: 'sight' },
  { site: 'en.wikipedia.org', page: 'Phú Quốc', topic: 'destination' },
];

const unaccent = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
/** wiki/Hội_An, wiki/Hoi_An and wiki/H%E1%BB%99i_An are one page. */
export const pageKey = (url: string) => {
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch { /* keep as typed */ }
  return unaccent(decoded).toLowerCase().replace(/^https?:\/\//, '').replace(/[\s_]+/g, '_').replace(/\/+$/, '');
};
export const seedUrl = (seed: Seed) => `https://${seed.site}/wiki/${encodeURIComponent(seed.page.replace(/ /g, '_'))}`;

async function main() {
  const apply = process.argv.includes('--apply');
  const workspaces = (await query<{ workspace_id: string; n: string }>(
    `SELECT workspace_id, count(*) n FROM sources WHERE status = 'approved' AND deleted_at IS NULL
      GROUP BY 1 ORDER BY 2 DESC`)).rows;
  const arg = process.argv.find((a) => a.startsWith('--workspace='))?.split('=')[1];
  const workspaceId = arg ?? workspaces[0]?.workspace_id;
  if (!workspaceId || (!arg && workspaces.length > 1)) {
    throw new Error(`Pass --workspace=<id>; workspaces with approved sources: ${workspaces.map((w) => w.workspace_id).join(', ')}`);
  }
  const known = new Set((await query<{ url: string }>(
    `SELECT COALESCE(source_url, url_or_blob) AS url FROM sources WHERE workspace_id = $1 AND deleted_at IS NULL`,
    [workspaceId])).rows.map((r) => pageKey(r.url ?? '')));
  let added = 0;
  for (const seed of COVERAGE_SEEDS) {
    const url = seedUrl(seed);
    if (known.has(pageKey(url))) { console.log(`skip  ${seed.page} (${seed.site}) – already in the workspace`); continue; }
    if (apply) {
      await createSource(workspaceId, { title: `${seed.page} (${seed.site})`, kind: 'url', url_or_blob: url,
        category: seed.topic === 'destination' || seed.topic === 'region' || seed.topic === 'sight' ? 'locations' : 'content' });
    }
    added += 1;
    console.log(`${apply ? 'added' : 'would add'} [${seed.topic}] ${seed.page} (${seed.site})`);
  }
  console.log(`${apply ? 'Queued' : 'Would queue'} ${added} source(s) for workspace ${workspaceId}.${apply ? ' They wait for the owner\'s review after ingest.' : ' Run with --apply to create them.'}`);
}

if (require.main === module) {
  main().then(() => pool.end()).catch(async (error) => { console.error(error.message); await pool.end(); process.exit(1); });
}
