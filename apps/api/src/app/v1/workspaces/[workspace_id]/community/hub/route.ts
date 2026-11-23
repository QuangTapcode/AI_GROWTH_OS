import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { resolveTenantContext, requireRole } from '@/lib/tenant';
import { AppError, handleApiError } from '@/lib/errors';
import pool from '@/lib/db';
import { CommunityHubService, invalidateCommunityHubCache, normalizePublishTarget } from '@/modules/community/hub';

export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const actor = authenticateUser(req);
    const tenant = await resolveTenantContext(actor, params.workspace_id);
    requireRole(tenant, ['owner', 'editor', 'viewer']);

    try {
      const service = new CommunityHubService(pool);
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json(data);
    } catch (error) {
      // Only a database that cannot be reached may fall back to demo data (clearly flagged).
      // Any other failure is a real bug and must surface instead of showing fake posts.
      if (isDbUnavailable(error)) {
        return NextResponse.json(getOfflineCommunityHubFallback(params.workspace_id), {
          headers: { 'X-Data-Source': 'offline-demo-fallback' },
        });
      }
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}

/** True only when Postgres itself is unreachable (Docker stopped, wrong port, etc.). */
function isDbUnavailable(error: unknown): boolean {
  const e = error as { code?: string; message?: string; errors?: { code?: string }[] };
  const codes = [e?.code, ...(e?.errors ?? []).map((x) => x.code)];
  if (codes.some((c) => c && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', '57P01', '57P03'].includes(c))) return true;
  return /ECONNREFUSED|connection terminated|Connection refused|timeout expired/i.test(String(e?.message ?? ''));
}

function getOfflineCommunityHubFallback(workspaceId: string) {
  return {
    synced_at: new Date().toISOString(),
    group: {
      name: "Cộng Đồng Du Lịch & Khám Phá Đà Nẵng",
      group_url: "https://facebook.com/groups/cam-nang-du-lich-da-nang",
      group_share_url: "https://facebook.com/groups/cam-nang-du-lich-da-nang",
      publish_target: "group",
      group_bot_session: {
        isLoggedIn: true,
        sessionSource: "cookie",
        detail: "Phiên Quản trị viên Group Bot sẵn sàng",
        accountIdMask: "admin_tripc_dn",
      },
      page_name: "TripC Experience Hub",
      page_url: "https://facebook.com/dulich.trainghiem.danang",
      connected_fanpage_id: "100293847583920",
      positioning: "Cộng đồng chia sẻ kinh nghiệm du lịch thực tế, địa điểm ăn uống, thuê xe và tour trải nghiệm tự túc tại Đà Nẵng",
      target_source: "growth_lead_agent",
      auto_reply_comments: true,
      auto_invite_enabled: true,
      daily_invite_limit: 15,
      fb_admin_name: "TripC Growth Lead",
      last_invite_run_at: new Date().toISOString(),
      last_comment_sync_at: new Date().toISOString(),
    },
    growth_lead_targets: {
      target_source: "growth_lead_agent",
      strategy_artifact_id: `art-strat-${workspaceId.slice(0, 8)}`,
      strategy_plan_id: `plan-${workspaceId.slice(0, 8)}`,
      rationale: "Tập trung khai thác khách du lịch tự túc dịp cuối năm qua các chủ đề review thực tế và giải đáp trực tiếp",
      updated_at: new Date().toISOString(),
      weekly_targets: [
        { week: 1, label: "Tuần 1: Chạm & Nhận diện", member_target: 350, weekly_new_target: 100, focus: "Top bãi biển và tour xe máy", channel_tactic: "Group seeding & RAG auto-reply" },
        { week: 2, label: "Tuần 2: Tương tác sâu", member_target: 500, weekly_new_target: 150, focus: "Ẩm thực địa phương & Chợ đêm", channel_tactic: "Thảo luận & mời tham gia nhóm" },
        { week: 3, label: "Tuần 3: Giữ chân & Chuyển đổi", member_target: 750, weekly_new_target: 250, focus: "Ưu đãi tour & vé tham quan", channel_tactic: "Lead concierge 1-1" },
        { week: 4, label: "Tuần 4: Lan tỏa tự nhiên", member_target: 1200, weekly_new_target: 450, focus: "Khen thưởng review & Minigame", channel_tactic: "Đại sứ cộng đồng" },
      ],
      auto_reply_comments: true,
      auto_invite_enabled: true,
      daily_invite_limit: 15,
    },
    stats: {
      total_matched_members: 142,
      real_group_members: 1280,
      real_page_followers: 3450,
      real_page_likes: 3100,
      real_identified_people: 142,
      manual_prospects: 18,
      current_campaign_week: 2,
      week1_baseline_members: 250,
      week1_target: 350,
      week1_achieved: 380,
      week2_target: 500,
      week2_progress: 465,
      week3_target: 750,
      week4_target: 1200,
      daily_invite_limit: 15,
      invites_sent_today: 12,
      invites_remaining_today: 3,
      invites_sent_7d: 84,
      invites_sent_total: 215,
      comments_received_count: 58,
      comments_replied_count: 56,
      messages_received_count: 34,
      messages_replied_count: 34,
      pending_questions_count: 0,
      active_discussions: 8,
      total_approved_playbook_topics: 12,
      published_topics_count: 8,
      published_group_count: 8,
      published_fanpage_count: 6,
      scheduled_topics_count: 4,
      scheduled_group_count: 4,
      failed_group_count: 0,
      fresh_unposted_topics: 4,
      approved_unique_images: 12,
      duplication_rate_pct: 0,
      total_post_likes: 420,
      total_post_comments: 89,
      total_post_shares: 45,
      total_post_engagement: 554,
      tracked_posts_count: 14,
      avg_engagement_per_post: 39.5,
      group_post_likes: 310,
      group_post_comments: 65,
      group_post_shares: 32,
      fanpage_post_likes: 110,
      fanpage_post_comments: 24,
      fanpage_post_shares: 13,
      member_growth_delta: 24.5,
      engagement_growth_delta: 18.2,
    },
    weekly_campaigns: [
      {
        week: 1,
        date_range: "Tuần 1",
        title: "Khám phá địa điểm mới & Biển Mỹ Khê",
        target_members: 350,
        current_members: 380,
        status: "completed",
        theme: "Cảnh đẹp Đà Nẵng",
        target_trends: ["Check-in Mỹ Khê", "Ngắm hoàng hôn Bán đảo Sơn Trà"],
        responsible_agents: "Growth Lead, Content Marketing, Community",
        tactics: ["Đăng bài review có hình ảnh chất lượng", "Tự động phản hồi bình luận hỏi đường"],
      },
      {
        week: 2,
        date_range: "Tuần 2",
        title: "Thiên đường ẩm thực & Chợ đêm Sơn Trà",
        target_members: 500,
        current_members: 465,
        status: "active",
        theme: "Ẩm thực & Tour đêm",
        target_trends: ["Hải sản tươi sống", "Mì Quảng chuẩn vị"],
        responsible_agents: "Growth Lead, SEO Worker, Community",
        tactics: ["Cung cấp danh sách quán ăn bản địa", "Mời người quan tâm vào group nhận ưu đãi"],
      },
    ],
    matched_members: [
      {
        id: "mem-1",
        external_ref: "fb_user_101",
        display_name: "Hoàng Minh Travel",
        channel: "facebook_group",
        matched_signal: "Hỏi địa điểm ngắm hoàng hôn đẹp ở Sơn Trà",
        matched_trend: "Check-in Bán đảo Sơn Trà",
        interest_tags: ["du lịch", "hoàng hôn", "Sơn Trà"],
        affinity_score: 95,
        campaign_week: 2,
        status: "invited",
        invite_group_url: "https://facebook.com/groups/cam-nang-du-lich-da-nang",
        recommended_topic: "Kinh nghiệm vi vu Bán đảo Sơn Trà & Chùa Linh Ứng",
        created_at: new Date().toISOString(),
      },
      {
        id: "mem-2",
        external_ref: "fb_user_102",
        display_name: "Lê Thị Thu Trang",
        channel: "facebook_page",
        matched_signal: "Quan tâm thuê xe máy tự túc tại Mỹ Khê",
        matched_trend: "Thuê xe máy Đà Nẵng",
        interest_tags: ["thuê xe", "Mỹ Khê", "tự túc"],
        affinity_score: 92,
        campaign_week: 2,
        status: "replied",
        invite_group_url: "https://facebook.com/groups/cam-nang-du-lich-da-nang",
        recommended_topic: "Cẩm nang du lịch trải nghiệm Đà Nẵng 2026",
        created_at: new Date().toISOString(),
      },
    ],
    discussions: [
      {
        id: "disc-1",
        category: "Kinh nghiệm du lịch",
        title: "Đi Đà Nẵng 3 ngày 2 đêm nên ở khu vực nào thuận tiện nhất?",
        author_name: "TripC Community Lead",
        author_role: "Quản trị viên",
        body: "Chào cả nhà, nếu lần đầu đến Đà Nẵng thì nên ưu tiên ở gần Biển Mỹ Khê hay gần trung tâm Cầu Rồng? Mọi người cùng chia sẻ trải nghiệm thực tế nhé!",
        discussion_prompt: "Chia sẻ kinh nghiệm chọn khách sạn Đà Nẵng",
        source_url: "https://tripc.ai/blog/cam-nang-du-lich-da-nang-2026",
        image_url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
        replies: [
          { author: "Hải Nam", role: "Thành viên", text: "Nên ở sát biển Mỹ Khê sáng dậy tắm biển rất thích!", created_at: new Date().toISOString() },
          { author: "TripC Concierge", role: "AI Assistant", text: "Khu An Thượng gần biển Mỹ Khê cũng có nhiều quán cafe đẹp và đồ ăn đa dạng đó bạn.", created_at: new Date().toISOString() },
        ],
        participants_count: 14,
        facebook_post_id: "fb_post_88392",
        created_at: new Date().toISOString(),
      },
    ],
    recent_comments: [
      {
        id: "cmt-1",
        platform: "facebook_group",
        source_channel: "group",
        external_id: "c_123",
        author_name: "Nguyễn Văn Tuấn",
        content: "Tour Sơn Trà bên mình có đón tận khách sạn không bạn?",
        post_url: "https://facebook.com/groups/cam-nang-du-lich-da-nang/posts/101",
        status: "replied",
        rag_reply_text: "Dạ có ạ! Tour khám phá Bán đảo Sơn Trà của TripC có xe đưa đón tận nơi tại các khách sạn trung tâm và ven biển Mỹ Khê.",
        reply_artifact_id: null,
        invite_sent: true,
        received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    calendar: {
      daily: [
        {
          day_index: 1,
          day_label: "Hôm nay",
          scheduled_date_vn: "19/11/2026",
          scheduled_date_short: "19/11",
          week_number: 2,
          source_id: "source-danang-guide",
          topic_title: "Cẩm nang du lịch trải nghiệm Đà Nẵng 2026",
          source_url: "https://tripc.ai/blog/cam-nang-du-lich-da-nang-2026",
          image_url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
          image_attribution: "Unsplash - Da Nang Travel",
          target_trend: "Du lịch Đà Nẵng tự túc",
          interest_tags: ["du lịch", "Đà Nẵng", "tự túc"],
          community_discussion_hook: "Kinh nghiệm thực tế của bạn về du lịch Đà Nẵng là gì? Chia sẻ cùng TripC nhé!",
          status: "published",
          job_status: "published",
          is_published_group: true,
          is_published_fanpage: true,
          group_status: "published",
          group_post_url: "https://facebook.com/groups/cam-nang-du-lich-da-nang",
          fanpage_post_url: "https://facebook.com/dulich.trainghiem.danang",
          published_slug: "cam-nang-du-lich-da-nang-2026",
          published_at: new Date().toISOString(),
          post_body_preview: "Khám phá trọn vẹn thành phố biển Đà Nẵng từ Bán đảo Sơn Trà, Bãi biển Mỹ Khê đến đỉnh Bà Nà Hills...\n\n1. Thời điểm lý tưởng: Tháng 2 đến tháng 8.\n2. Lịch trình 3N2Đ: Sơn Trà - Mỹ Khê - Ngũ Hành Sơn - Cầu Rồng - Chợ Cồn.\n3. Đặt tour & thuê xe máy tự túc tiết kiệm 20% cùng TripC Experience!",
          unique_topic_verified: true,
          unique_image_verified: true,
        },
      ],
      weekly: [
        {
          week_number: 1,
          week_label: "Tuần 1",
          member_target: "350 thành viên",
          pillar_theme: "Cảnh sắc & Biển Mỹ Khê",
          planned_topics: ["Cẩm nang du lịch Đà Nẵng", "Check-in Bán đảo Sơn Trà"],
          interactive_format: "Hình ảnh & Chia sẻ kinh nghiệm",
        },
        {
          week_number: 2,
          week_label: "Tuần 2",
          member_target: "500 thành viên",
          pillar_theme: "Ẩm thực & Trải nghiệm địa phương",
          planned_topics: ["Top quán ăn đặc sản", "Chợ đêm Sơn Trà"],
          interactive_format: "Bình luận & Hỏi đáp trực tiếp",
        },
      ],
      monthly: [
        {
          month_number: 1,
          month_label: "Tháng 11/2026",
          member_goal: "1,200 thành viên tích cực",
          content_commitment: "28 bài đăng chất lượng cao kèm hình ảnh bản quyền",
          key_pillars: ["Khám phá địa danh", "Review ẩm thực", "Ưu đãi độc quyền cho thành viên"],
        },
      ],
    },
    snapshots: [
      { id: "snap-1", group_member_count: 1280, page_followers_count: 3450, identified_prospects_count: 142, invites_sent_count: 215, replies_sent_count: 56, campaign_week: 2, captured_at: new Date().toISOString() }
    ],
  };
}

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const actor = authenticateUser(req);
    const tenant = await resolveTenantContext(actor, params.workspace_id);
    requireRole(tenant, ['owner', 'editor']);

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const action = String(body.action || 'scan_members');
    invalidateCommunityHubCache(params.workspace_id);
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
        auto_reply_comments:
          typeof body.auto_reply_comments === 'boolean' ? body.auto_reply_comments : undefined,
        auto_invite_enabled:
          typeof body.auto_invite_enabled === 'boolean' ? body.auto_invite_enabled : undefined,
        daily_invite_limit:
          body.daily_invite_limit !== undefined ? Number(body.daily_invite_limit) : undefined,
        lock_manual: body.lock_manual === true,
        target_source:
          body.target_source === 'growth_lead_agent' ||
          body.target_source === 'manual' ||
          body.target_source === 'locked_manual'
            ? body.target_source
            : undefined,
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'updated', data });
    }

    if (action === 'sync_growth_lead_targets') {
      const syncResult = await service.syncGrowthLeadTargets(params.workspace_id, {
        forceRecalculate: body.force_recalculate !== false,
        forceOverrideManual: body.force_override_manual !== false,
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'synced_targets', sync_result: syncResult, data });
    }

    if (action === 'scan_comments') {
      const scanResult = await service.scanAndProcessComments(params.workspace_id, actor.id, {
        includeGroupBot: body.include_group_bot !== false,
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'comments_scanned', scan_result: scanResult, data });
    }

    if (action === 'dispatch_comment_replies') {
      const replyResult = await service.dispatchPendingCommentReplies(params.workspace_id, {
        maxBatch: typeof body.max_batch === 'number' ? body.max_batch : 10,
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'comment_replies_dispatched', reply_result: replyResult, data });
    }

    if (action === 'sync_post_stats') {
      const syncStatsResult = await service.syncPostEngagementStats(params.workspace_id, {
        includeGroupBot: body.include_group_bot !== false,
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'post_stats_synced', sync_stats_result: syncStatsResult, data });
    }

    if (action === 'send_safe_invites') {
      const inviteResult = await service.sendSafeCommunityInvites(params.workspace_id, {
        maxBatch: typeof body.max_batch === 'number' ? body.max_batch : 5,
        includeNativeGroupUi: body.include_native_group_ui !== false,
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'safe_invites_sent', invite_result: inviteResult, data });
    }

    if (action === 'discover_opportunities') {
      const opportunities = await service.discoverSearxngCommunityOpportunities();
      return NextResponse.json({ status: 'discovered', opportunities });
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

    if (action === 'publish_reel') {
      if (!body.source_id) throw new AppError(400, 'SOURCE_ID_REQUIRED', 'source_id is required');
      const reel = await service.queueReelForPublishedPost(params.workspace_id, String(body.source_id));
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'reel_queued', reel, data });
    }

    if (action === 'publish_fresh_post') {
      try {
        const published = await service.publishFreshPlaybookPost(params.workspace_id, actor.id, {
          source_id: body.source_id ? String(body.source_id) : undefined,
        });
        const data = await service.getHubData(params.workspace_id);
        const httpStatus = published.status === 'published' ? 201 : 200;
        return NextResponse.json({ status: published.status ?? 'published', published, data }, { status: httpStatus });
      } catch (error) {
        // Never pretend a post was published: report the real failure to the caller.
        if (isDbUnavailable(error)) {
          throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Không kết nối được cơ sở dữ liệu (Docker/Postgres đang tắt?). Bài chưa được đăng.');
        }
        throw error;
      }
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
      const botStatus = await service.verifyGroupBotSession(params.workspace_id);
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: 'bot_verified', ...botStatus, data });
    }

    if (action === 'sync_telegram_bot') {
      const tgResult = await service.syncTelegramBot(params.workspace_id, {
        clearWebhookForPolling: body.clear_webhook_for_polling === true,
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({
        status: tgResult.success ? 'telegram_synced' : 'telegram_not_configured',
        ...tgResult,
        data,
      });
    }

    if (action === 'login_group_bot') {
      const login = await service.launchGroupBotLogin(params.workspace_id, {
        fresh: body.fresh === true,
        waitForConfirm: body.wait_confirm !== false,
      });
      return NextResponse.json({ status: login.started ? 'login_started' : 'login_error', ...login });
    }

    if (action === 'switch_group_bot_account') {
      const switched = await service.switchGroupBotAccount(params.workspace_id);
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({
        status: switched.started ? 'switch_started' : 'login_error',
        ...switched,
        data,
      });
    }

    if (action === 'complete_group_bot_login') {
      const completed = await service.completeGroupBotLogin(params.workspace_id);
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({
        status: completed.completed ? 'login_completed' : 'login_pending',
        ...completed,
        data,
      });
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

    if (action === 'retract_group_post') {
      const retractResult = await service.retractGroupPost(params.workspace_id, {
        source_id: body.source_id ? String(body.source_id) : undefined,
        post_url: body.post_url ? String(body.post_url) : undefined,
        title: body.title ? String(body.title) : undefined,
      });
      const data = await service.getHubData(params.workspace_id);
      return NextResponse.json({ status: retractResult.success ? 'retracted' : 'error', retractResult, data });
    }

    const data = await service.getHubData(params.workspace_id);
    return NextResponse.json({ status: 'ok', data });
  } catch (error) {
    return handleApiError(error);
  }
}
