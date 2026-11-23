import type { Pool } from 'pg';
import { z } from 'zod';
import { periodSchema } from '../metrics/period';
import { AppError } from '../../lib/errors';

const counters = ['reactions', 'comments', 'shares'] as const;
const summary = z.object({ summary: z.object({ total_count: z.number().int().nonnegative() }).optional() }).optional();
const responseSchema = z.object({ id: z.string(), reactions: summary, comments: summary,
  shares: z.object({ count: z.number().int().nonnegative() }).optional() });
type Published = { publishing_job_id: string; content_id: string; artifact_id: string; artifact_version: number;
  external_post_id: string; published_at: Date; account_ref: string };

/** An owner explicitly rechecks the already-bound Page after replacing credentials in env. */
export async function verifyFacebookConnection(pool: Pool, workspace: string) {
  const page=process.env.FACEBOOK_PAGE_ID?.trim(), token=process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  const version=process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || process.env.META_GRAPH_API_VERSION?.trim();
  if(process.env.INTEGRATION_MODE!=='production'||!page||!token||!version||!/^v\d+\.\d+$/.test(version))
    throw new AppError(409,'FACEBOOK_METRICS_NOT_CONFIGURED','Configure Page credentials and Graph version on the server');
  const binding=(await pool.query("SELECT account_ref FROM integration_connections WHERE workspace_id=$1 AND provider='facebook_page' AND account_ref=$2",[workspace,page])).rows[0];
  if(!binding)throw new AppError(403,'WORKSPACE_ACCOUNT_NOT_BOUND','Only an already-bound Page can be reverified');
  let response: Response;
  try { response=await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(page)}?fields=id`,{
    headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(5000),
  }); } catch { throw new AppError(502,'FACEBOOK_REQUEST_FAILED','Page verification failed; try again after checking connectivity'); }
  if(!response.ok)throw new AppError(409,'FACEBOOK_REAUTH_REQUIRED','Facebook rejected the credentials; update them on the server and reverify');
  const identity=z.object({id:z.string()}).safeParse(await response.json().catch(()=>null));
  if(!identity.success||identity.data.id!==page)throw new AppError(502,'INVALID_PROVIDER_RESPONSE','Facebook did not confirm the configured Page');
  await pool.query("UPDATE integration_connections SET status='connected',verified_at=now(),last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND provider='facebook_page' AND account_ref=$2",[workspace,page]);
  return {verified:true,provider:'facebook_page',account_ref:page};
}

/** Read counters only for published, version-pinned posts on this workspace's verified Page.
 * These are lifetime observations, never period reach, unique people or ad attribution.
 */
export async function syncFacebookCounters(pool: Pool, workspace: string, raw: unknown) {
  const parsed = periodSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(422, 'INVALID_PERIOD', parsed.error.message);
  const page = process.env.FACEBOOK_PAGE_ID?.trim(), token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  const version = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || process.env.META_GRAPH_API_VERSION?.trim();
  if (process.env.INTEGRATION_MODE !== 'production' || !page || !token || !version || !/^v\d+\.\d+$/.test(version)) {
    throw new AppError(409, 'FACEBOOK_METRICS_NOT_CONFIGURED', 'Configure Page ID, Page access token and an explicit supported Graph API version');
  }
  const bound = (await pool.query(`SELECT account_ref,status FROM integration_connections WHERE workspace_id=$1
    AND provider='facebook_page' AND account_ref=$2 AND status IN ('connected','error') AND verified_at IS NOT NULL`, [workspace, page])).rows[0];
  if (!bound) throw new AppError(403, 'WORKSPACE_ACCOUNT_NOT_BOUND', 'Verify this Page connection for the workspace before reading counters');
  if (bound.status === 'error') throw new AppError(409, 'FACEBOOK_REAUTH_REQUIRED', 'Reconnect and verify the Page before syncing again');
  const posts = (await pool.query<Published>(`SELECT pj.id AS publishing_job_id,pj.content_id,pj.artifact_id,
      a.version AS artifact_version,pj.external_post_id,pj.published_at,ch.channel_identifier AS account_ref
    FROM publishing_jobs pj JOIN channels ch ON ch.id=pj.channel_id AND ch.workspace_id=pj.workspace_id
    JOIN content_artifacts a ON a.id=pj.artifact_id AND a.workspace_id=pj.workspace_id
    WHERE pj.workspace_id=$1 AND lower(ch.platform_name)='facebook' AND ch.channel_identifier=$2
      AND pj.status='published' AND pj.published_at >= $3::date AND pj.published_at < $4::date+1 AND pj.published_at<=now()
      AND pj.external_post_id IS NOT NULL
    ORDER BY pj.published_at DESC,pj.id LIMIT 21`, [workspace, page, parsed.data.from, parsed.data.to])).rows;
  if (posts.length > 20) throw new AppError(422, 'SOCIAL_BATCH_TOO_LARGE', 'Narrow the period to at most 20 published posts');
  const observations = [];
  let credentialFailure = false;
  for (const post of posts) {
    let values: Record<string, number | null> = { reactions: null, comments: null, shares: null };
    let reason: string | null = null;
    if (credentialFailure) reason = 'FACEBOOK_TOKEN_INVALID_OR_EXPIRED';
    else if (!/^\d+_\d+$/.test(post.external_post_id) || !post.external_post_id.startsWith(`${page}_`)) {
      reason = 'POST_PAGE_MISMATCH';
    } else {
      try {
        const url = `https://graph.facebook.com/${version}/${encodeURIComponent(post.external_post_id)}?fields=id,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares`;
        const response = await fetch(url, { method: 'GET', headers: { authorization: `Bearer ${token}` },
          redirect: 'error', signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
          const body = z.object({ error: z.object({ code: z.number().int() }) }).safeParse(await response.json().catch(() => null));
          if (response.status === 401 || (body.success && body.data.error.code === 190)) {
            reason = 'FACEBOOK_TOKEN_INVALID_OR_EXPIRED'; credentialFailure = true;
          } else reason = response.status === 403 ? 'FACEBOOK_PERMISSION_MISSING'
            : response.status === 429 ? 'FACEBOOK_RATE_LIMITED' : `FACEBOOK_HTTP_${response.status}`;
        }
        else {
          const parsed = responseSchema.safeParse(await response.json());
          if (!parsed.success || parsed.data.id !== post.external_post_id) reason = 'INVALID_PROVIDER_RESPONSE';
          else values = { reactions: parsed.data.reactions?.summary?.total_count ?? null,
            comments: parsed.data.comments?.summary?.total_count ?? null, shares: parsed.data.shares?.count ?? null };
        }
      } catch (error) { reason = error instanceof Error && ['TimeoutError','AbortError'].includes(error.name)
        ? 'FACEBOOK_REQUEST_TIMEOUT' : 'FACEBOOK_REQUEST_FAILED'; }
    }
    observations.push({ post, values, reason, captured_at: new Date().toISOString() });
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    if (credentialFailure) await db.query(`UPDATE integration_connections SET status='error',last_error='FACEBOOK_TOKEN_INVALID_OR_EXPIRED',updated_at=now()
      WHERE workspace_id=$1 AND provider='facebook_page' AND account_ref=$2`, [workspace,page]);
    for (const observation of observations) for (const metric of counters) {
      const value = observation.values[metric];
      await db.query(`INSERT INTO metrics_snapshots(workspace_id,provider,metric_name,period_from,period_to,timezone,
        metric_value,availability,missing_reason,metadata,captured_at)
        VALUES($1,'facebook_page',$2,($3::timestamptz AT TIME ZONE 'UTC')::date,($3::timestamptz AT TIME ZONE 'UTC')::date,'UTC',$4,$5,$6,$7::jsonb,$3::timestamptz)`,
      [workspace, `facebook_${metric}`, observation.captured_at, value, value === null ? 'missing' : 'available',
        value === null ? observation.reason ?? 'COUNTER_NOT_RETURNED' : null,
        JSON.stringify({ ...observation.post, scope: 'post_lifetime', account_ref: page })]);
    }
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
  return { posts: observations.length, measured_posts: observations.filter(o => counters.some(k => o.values[k] !== null)).length,
    unavailable_posts: observations.filter(o => counters.every(k => o.values[k] === null)).length,
    scope: 'post_lifetime', from: parsed.data.from, to: parsed.data.to, requires_reauth: credentialFailure,
    reasons: [...new Set(observations.map(o => o.reason).filter((reason): reason is string => reason !== null))] };
}

/** Only observations still matching a tenant-owned published post and verified Page may enter an AI snapshot. */
export async function socialEvidence(pool: Pool, workspace: string, start: Date, end: Date, capturedAt = new Date()) {
  return (await pool.query(`SELECT pj.workspace_id,pj.id AS publishing_job_id,pj.content_id,pj.artifact_id,a.version AS artifact_version,
      (SELECT t.campaign_id FROM workflow_tasks t WHERE t.workspace_id=pj.workspace_id AND t.result_ref=a.id AND t.campaign_id IS NOT NULL ORDER BY t.created_at DESC LIMIT 1) AS campaign_id,
      pj.external_post_id,pj.published_at,latest.captured_at,latest.values AS counters,latest.missing_reasons,
      'facebook_page' AS provider,'post_lifetime' AS scope
    FROM publishing_jobs pj JOIN channels ch ON ch.id=pj.channel_id AND ch.workspace_id=pj.workspace_id
    JOIN content_artifacts a ON a.id=pj.artifact_id AND a.workspace_id=pj.workspace_id
    JOIN integration_connections c ON c.workspace_id=pj.workspace_id AND c.provider='facebook_page'
      AND c.account_ref=ch.channel_identifier AND c.status='connected' AND c.verified_at IS NOT NULL
    JOIN LATERAL (
      SELECT max(s.captured_at) AS captured_at,jsonb_object_agg(replace(s.metric_name,'facebook_',''),s.metric_value) AS values,
        coalesce(jsonb_object_agg(replace(s.metric_name,'facebook_',''),s.missing_reason) FILTER(WHERE s.metric_value IS NULL),'{}') AS missing_reasons
      FROM (SELECT DISTINCT ON (metric_name) metric_name,metric_value,missing_reason,captured_at FROM metrics_snapshots
        WHERE workspace_id=pj.workspace_id AND provider='facebook_page' AND metadata->>'scope'='post_lifetime'
          AND metadata->>'publishing_job_id'=pj.id::text AND metadata->>'account_ref'=c.account_ref
          AND metadata->>'external_post_id'=pj.external_post_id AND metadata->>'artifact_id'=a.id::text
          AND (metadata->>'artifact_version')=a.version::text AND captured_at<=$4
          AND metric_name IN ('facebook_reactions','facebook_comments','facebook_shares')
        ORDER BY metric_name,captured_at DESC,id DESC) s
    ) latest ON latest.captured_at IS NOT NULL
    WHERE pj.workspace_id=$1 AND pj.status='published' AND lower(ch.platform_name)='facebook'
      AND pj.published_at >= $2 AND pj.published_at < $3
    ORDER BY pj.published_at DESC,pj.id LIMIT 20`, [workspace, start, end, capturedAt])).rows;
}
