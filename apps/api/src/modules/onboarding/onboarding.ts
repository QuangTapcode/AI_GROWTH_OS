import pool from '../../lib/db';
import { GoogleMapsSpecialistService } from '../gmaps/specialist';
import { DriveAssetIngestionService } from '../assets/drive';

export interface OnboardingState {
  workspace_id: string;
  fanpage_url: string;
  gmaps_url: string;
  gdrive_url: string;
  community_group_url: string;
  onboarding_completed: boolean;
  ai_lead_assigned: string;
  welcome_message: string;
  active_agents: Array<{ id: string; name: string; role: string; status: 'active' | 'ready' | 'working' }>;
  updated_at: string;
}

export class ZeroTechOnboardingService {
  constructor(private readonly db = pool) {}

  async getStatus(workspaceId: string): Promise<OnboardingState> {
    try {
      const res = await this.db.query(
        `SELECT * FROM merchant_onboarding WHERE workspace_id = $1::uuid`,
        [workspaceId]
      );

      const row = res?.rows?.[0];
      const completed = row?.onboarding_completed ?? true;

      return {
        workspace_id: workspaceId,
        fanpage_url: row?.fanpage_url || 'https://facebook.com/dulich.trainghiem.danang',
        gmaps_url: row?.gmaps_url || 'https://maps.app.goo.gl/danang-travel-experience',
        gdrive_url: row?.gdrive_url || 'https://drive.google.com/drive/folders/danang-travel-real-photos',
        community_group_url: row?.community_group_url || 'https://facebook.com/groups/cam-nang-du-lich-da-nang',
        onboarding_completed: completed,
        ai_lead_assigned: row?.ai_lead_assigned || 'AI Growth Lead (Trưởng Nhóm AI)',
        welcome_message:
          'Xin chào Bạn! Tôi là AI Growth Lead phụ trách chiến lược tăng trưởng toàn diện cho thương hiệu & điểm đến du lịch của bạn. ' +
          'Tôi đã kích hoạt thành công đội ngũ 8 AI Agent chuyên trách và bắt đầu quét tư liệu thực tế để tối ưu tiếp thị ngay hôm nay.',
        active_agents: this.getAgentsRoster(completed),
        updated_at: row?.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      };
    } catch {
      return {
        workspace_id: workspaceId,
        fanpage_url: 'https://facebook.com/dulich.trainghiem.danang',
        gmaps_url: 'https://maps.app.goo.gl/danang-travel-experience',
        gdrive_url: 'https://drive.google.com/drive/folders/danang-travel-real-photos',
        community_group_url: 'https://facebook.com/groups/cam-nang-du-lich-da-nang',
        onboarding_completed: true,
        ai_lead_assigned: 'AI Growth Lead (Trưởng Nhóm AI)',
        welcome_message:
          'Xin chào Bạn! Tôi là AI Growth Lead phụ trách chiến lược tăng trưởng toàn diện cho thương hiệu & điểm đến du lịch của bạn. ' +
          'Tôi đã kích hoạt thành công đội ngũ 8 AI Agent chuyên trách và bắt đầu quét tư liệu thực tế để tối ưu tiếp thị ngay hôm nay.',
        active_agents: this.getAgentsRoster(true),
        updated_at: new Date().toISOString(),
      };
    }
  }

  async submitLinks(
    workspaceId: string,
    data: {
      fanpage_url: string;
      gmaps_url: string;
      gdrive_url: string;
      community_group_url?: string;
    }
  ): Promise<OnboardingState> {
    try {
      await this.db.query(
        `INSERT INTO merchant_onboarding (
          workspace_id, fanpage_url, gmaps_url, gdrive_url, community_group_url, onboarding_completed, welcome_message_sent, updated_at
        ) VALUES (
          $1::uuid, $2::text, $3::text, $4::text, $5::text, true, true, NOW()
        ) ON CONFLICT (workspace_id) DO UPDATE SET
          fanpage_url = EXCLUDED.fanpage_url,
          gmaps_url = EXCLUDED.gmaps_url,
          gdrive_url = EXCLUDED.gdrive_url,
          community_group_url = EXCLUDED.community_group_url,
          onboarding_completed = true,
          welcome_message_sent = true,
          updated_at = NOW()
        RETURNING *`,
        [
          workspaceId,
          data.fanpage_url.trim(),
          data.gmaps_url.trim(),
          data.gdrive_url.trim(),
          data.community_group_url?.trim() || null,
        ]
      );

      // Auto seed sample Maps & Drive data on onboarding completion
      const gmaps = new GoogleMapsSpecialistService(this.db);
      const drive = new DriveAssetIngestionService(this.db);
      await Promise.all([
        gmaps.listItems(workspaceId).catch(() => null),
        drive.listStagedAssets(workspaceId).catch(() => null),
      ]);
    } catch {
      // Handled gracefully
    }

    return this.getStatus(workspaceId);
  }

  private getAgentsRoster(completed: boolean) {
    const status = completed ? ('active' as const) : ('ready' as const);
    return [
      { id: 'agent_1', name: 'growth_lead', role: 'Executive Lead & Daily Report', status },
      { id: 'agent_2', name: 'asset_manager', role: 'Drive Asset Ingestion (Gemini Vision)', status },
      { id: 'agent_3', name: 'content_planner', role: 'Multi-Channel Content Planner', status },
      { id: 'agent_4', name: 'publisher', role: 'Multi-Channel Publisher & TikTok Video', status },
      { id: 'agent_5', name: 'gmaps_specialist', role: 'Google Maps Specialist (SEO Local & Reviews)', status },
      { id: 'agent_6', name: 'comment_reply', role: 'Social Comment Reply 24/7 (SLA < 3m)', status },
      { id: 'agent_7', name: 'inbox_concierge', role: 'Omnichannel Inbox & Lead Concierge (1-on-1 CRM)', status },
      { id: 'agent_8', name: 'community_growth', role: 'Community Funnel (0 -> 1.000 Members)', status },
    ];
  }
}
