import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { handleApiError } from '@/lib/errors';
import pool from '@/lib/db';
import { CommunityHubService, normalizePublishTarget } from '@/modules/community/hub';

export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const actor = authenticateUser(req);
    const tenant = await resolveTenantContext(actor, params.workspace_id);
    requireRole(tenant, ['owner', 'editor', 'viewer']);

    const service = new CommunityHubService(pool);
    const data = await service.getHubData(params.workspace_id);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const actor = authenticateUser(req);
    const tenant = await resolveTenantContext(actor, params.workspace_id);
    requireRole(tenant, ['owner', 'editor']);

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const action = String(body.action || 'scan_members');
    const service = new CommunityHubService(pool);

    if (action === 'update_settings') {
      await service.updateCommunitySettings(params.workspace_id, {
        community_name: body.community_name ? String(body.community_name) : undefined,
        group_url: body.group_url ? String(body.group_url) : body.target_group_url ? String(body.target_group_url) : undefined,
        publish_target:
          body.publish_target !== undefined ? normalizePublishTarget(body.publish_target) : undefined,
        positioning: body.positioning ? String(body.positioning) : undefined,
        group_member_count: body.group_member_count !== undefined ? Number(body.group_member_count) : undefined,
        week1_target: body.week1_target !== undefined ? Number(body.week1_target) : undefined,
        week2_target: body.week2_target !== undefined ? Number(body.week2_target) : undefined,
        week3_target: body.week3_target !== undefined ? Number(body.week3_target) : undefined,
        week4_target: body.week4_target !== undefined ? Number(body.week4_target) : undefined,
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'updated', data });
    }

    if (action === 'scan_members') {
      if (body.display_name && body.signal) {
        await service.addProspectMember(params.workspace_id, {
          display_name: String(body.display_name),
          channel: body.channel ? String(body.channel) : 'auto_trend_scanner',
          signal: String(body.signal),
          campaign_week: typeof body.campaign_week === 'number' ? body.campaign_week : 2,
        });
      } else {
        await service.syncMembersFromInteractions(params.workspace_id);
      }
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'synced', data });
    }

    if (action === 'send_messenger_invite') {
      const inviteResult = await service.sendMessengerGroupInvite(
        params.workspace_id,
        body.external_ref ? String(body.external_ref) : undefined,
      );
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'invited', invite_result: inviteResult, data });
    }

    if (action === 'create_discussion') {
      const discussion = await service.createDiscussion(params.workspace_id, {
        category: body.category ? String(body.category) : 'Thảo luận Cộng đồng',
        title: String(body.title || 'Thảo luận Cộng đồng Dịch vụ hỗ trợ du lịch'),
        author_name: body.author_name ? String(body.author_name) : undefined,
        author_role: body.author_role ? String(body.author_role) : undefined,
        body: String(body.body || ''),
        discussion_prompt: String(
          body.discussion_prompt || 'Chia sẻ kinh nghiệm thực tế của bạn dưới phần bình luận nhé!',
        ),
        source_url: body.source_url ? String(body.source_url) : undefined,
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'created', discussion, data }, { status: 201 });
    }

    if (action === 'publish_fresh_post') {
      const published = await service.publishFreshPlaybookPost(params.workspace_id, actor.id, {
        source_id: body.source_id ? String(body.source_id) : undefined,
      });
      const data = await service.getHubData(params.workspace_id);
      const httpStatus = published.status === 'published' ? 201 : 200;
      return NextResponse.json({ status: published.status ?? 'published', published, data }, { status: httpStatus });
    }

    if (action === 'schedule_all_posts') {
      const result = await service.scheduleAllPlaybookPosts(params.workspace_id, actor.id, {
        start_date_iso: body.start_date_iso ? String(body.start_date_iso) : undefined,
        interval_hours: body.interval_hours !== undefined ? Number(body.interval_hours) : undefined,
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'scheduled_all', result, data });
    }

    if (action === 'reschedule_post') {
      if (!body.source_id || !body.scheduled_for) {
        return NextResponse.json({ error: 'source_id and scheduled_for are required' }, { status: 400 });
      }
      const result = await service.reschedulePlaybookPost(params.workspace_id, actor.id, {
        source_id: String(body.source_id),
        scheduled_for: String(body.scheduled_for),
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'rescheduled', result, data });
    }

    if (action === 'check_group_bot') {
      const status = await service.getGroupBotSessionStatus();
      return NextResponse.json({ status: 'bot_status', ...status });
    }

    if (action === 'verify_group_bot') {
      const botStatus = await service.verifyGroupBotSession();
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'bot_verified', ...botStatus, data });
    }

    if (action === 'login_group_bot') {
      const login = await service.launchGroupBotLogin(params.workspace_id);
      return NextResponse.json({ status: login.started ? 'login_started' : 'login_error', ...login });
    }

    if (action === 'post_group_bot') {
      const botResult = await service.postToGroupViaBot(params.workspace_id, {
        title: String(body.title || 'Cẩm nang du lịch và cuộc sống Việt Nam'),
        body: String(body.body || ''),
        discussion_prompt: body.discussion_prompt ? String(body.discussion_prompt) : undefined,
        image_url: body.image_url ? String(body.image_url) : undefined,
        source_id: body.source_id ? String(body.source_id) : undefined,
        article_id: body.article_id ? String(body.article_id) : undefined,
        publishing_job_id: body.publishing_job_id ? String(body.publishing_job_id) : undefined,
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: botResult.success ? 'posted' : 'error', botResult, data });
    }

    const data = await service.getHubData(params.workspace_id);
    return NextResponse.json({ status: 'ok', data });
  } catch (error) {
    return handleApiError(error);
  }
}
