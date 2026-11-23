import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { MultiLLMAdapterService } from '../../src/modules/ai/llmAdapter';
import { BookingLeadsService } from '../../src/modules/booking/leads';
import { GoogleMapsSpecialistService } from '../../src/modules/gmaps/specialist';
import { DriveAssetIngestionService } from '../../src/modules/assets/drive';
import { ZeroTechOnboardingService } from '../../src/modules/onboarding/onboarding';
import { MerchantWalletService } from '../../src/modules/billing/wallet';

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';

describe('Merchant Growth Platform & 8-Agent Features', () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
  });

  describe('1. Multi-LLM Adapter with Auto-Switch', () => {
    it('initializes default configuration with Gemini as primary and auto-switch enabled', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // initial check
        .mockResolvedValueOnce({
          rows: [
            {
              workspace_id: WORKSPACE_ID,
              primary_provider: 'gemini',
              auto_switch_enabled: true,
              active_fallback: 'gemini',
              provider_status: { gemini: 'active', deepseek: 'ready' },
            },
          ],
        });

      const service = new MultiLLMAdapterService(mockDb as unknown as Pool);
      const config = await service.getConfig(WORKSPACE_ID);

      expect(config.primary_provider).toBe('gemini');
      expect(config.auto_switch_enabled).toBe(true);
    });

    it('pings provider and returns latency indicator', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            workspace_id: WORKSPACE_ID,
            primary_provider: 'gemini',
            auto_switch_enabled: true,
          },
        ],
      });

      const service = new MultiLLMAdapterService(mockDb as unknown as Pool);
      const ping = await service.pingProvider(WORKSPACE_ID, 'gemini');

      expect(ping.status).toBe('ok');
      expect(ping.latency_ms).toBeGreaterThan(0);
      expect(ping.message).toContain('GEMINI');
    });

    it('generates grounded response when primary or fallback LLM is invoked', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            workspace_id: WORKSPACE_ID,
            primary_provider: 'gemini',
            auto_switch_enabled: true,
          },
        ],
      });

      const service = new MultiLLMAdapterService(mockDb as unknown as Pool);
      const result = await service.generateTextWithAutoSwitch(
        WORKSPACE_ID,
        'Khách hỏi muốn đặt bàn cho 4 người vào 19h tối nay'
      );

      expect(result.text).toContain('đặt bàn');
      expect(result.provider_used).toBe('gemini');
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('2. Direct Booking Concierge & Leads Hub (Agent 7)', () => {
    it('seeds and lists booking leads when database is initially empty', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // initial check empty
        .mockResolvedValue({
          rows: [
            {
              id: 'lead-1',
              workspace_id: WORKSPACE_ID,
              customer_name: 'Nguyễn Văn Minh',
              customer_phone: '0905123456',
              platform: 'messenger',
              party_size: 4,
              booking_time: new Date().toISOString(),
              status: 'confirmed',
              deposit_amount: 0,
            },
          ],
        });

      const service = new BookingLeadsService(mockDb as unknown as Pool);
      const leads = await service.listLeads(WORKSPACE_ID);

      expect(leads.length).toBeGreaterThan(0);
      expect(leads[0].customer_name).toBe('Nguyễn Văn Minh');
      expect(leads[0].party_size).toBe(4);
    });

    it('creates a new booking lead from Messenger chat interaction', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'lead-new',
            workspace_id: WORKSPACE_ID,
            customer_name: 'Lê Hoàng Nam',
            customer_phone: '0905999888',
            platform: 'messenger',
            party_size: 5,
            booking_time: new Date().toISOString(),
            status: 'confirmed',
            deposit_amount: 200000,
          },
        ],
      });

      const service = new BookingLeadsService(mockDb as unknown as Pool);
      const lead = await service.createLead(WORKSPACE_ID, {
        customer_name: 'Lê Hoàng Nam',
        customer_phone: '0905999888',
        party_size: 5,
      });

      expect(lead.id).toBe('lead-new');
      expect(lead.customer_name).toBe('Lê Hoàng Nam');
      expect(lead.party_size).toBe(5);
    });
  });

  describe('3. Google Maps Specialist (Agent 5)', () => {
    it('returns reputation scorecard with average rating and Local Pack Top 3 rank', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ total_items: 50, replied_items: 50, avg_rating: 4.9 }],
      });

      const service = new GoogleMapsSpecialistService(mockDb as unknown as Pool);
      const overview = await service.getOverview(WORKSPACE_ID);

      expect(overview.average_rating).toBe(4.9);
      expect(overview.response_rate_percent).toBe(100);
      expect(overview.local_pack_rank).toBe(2);
      expect(overview.top_seo_keywords).toContain('Hải sản tươi sống Đà Nẵng');
    });

    it('auto-generates SEO-grounded review reply', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rev-1',
              author_name: 'Trần Văn Hùng',
              rating: 5,
              content: 'Quán ăn hải sản rất ngon và tươi.',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              workspace_id: WORKSPACE_ID,
              primary_provider: 'gemini',
              auto_switch_enabled: true,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'rev-1',
              workspace_id: WORKSPACE_ID,
              item_type: 'review',
              author_name: 'Trần Văn Hùng',
              rating: 5,
              content: 'Quán ăn hải sản rất ngon và tươi.',
              reply_text: 'Dạ cảm ơn anh Hùng đã ủng hộ hải sản tươi sống Đà Nẵng của quán!',
              status: 'replied',
              created_at: new Date().toISOString(),
            },
          ],
        });

      const service = new GoogleMapsSpecialistService(mockDb as unknown as Pool);
      const result = await service.replyToReview(WORKSPACE_ID, 'rev-1');

      expect(result).not.toBeNull();
      expect(result?.status).toBe('replied');
    });
  });

  describe('4. Google Drive Asset Ingestion (Agent 2)', () => {
    it('ingests and tags real food photos from Google Drive', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              workspace_id: WORKSPACE_ID,
              primary_provider: 'gemini',
              auto_switch_enabled: true,
            },
          ],
        })
        .mockResolvedValue({
          rows: [
            {
              id: 'asset-1',
              workspace_id: WORKSPACE_ID,
              file_name: 'IMG_HaiSan.jpg',
              file_url: 'https://example.com/food.jpg',
              asset_type: 'food_photo',
              vision_tags: ['Hải sản tươi sống', 'Nướng mỡ hành'],
              dish_name: 'Mực Trứng Nướng',
              status: 'staged',
              created_at: new Date().toISOString(),
            },
          ],
        });

      const service = new DriveAssetIngestionService(mockDb as unknown as Pool);
      const syncResult = await service.syncDriveFolder(WORKSPACE_ID);

      expect(syncResult.assets_scanned).toBe(2);
      expect(syncResult.items.length).toBeGreaterThan(0);
    });
  });

  describe('5. Zero-Tech Client Onboarding (Agent 1)', () => {
    it('saves merchant links and activates all 8 AI Agents', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            workspace_id: WORKSPACE_ID,
            fanpage_url: 'https://facebook.com/quan-an-ngon',
            gmaps_url: 'https://maps.app.goo.gl/test',
            gdrive_url: 'https://drive.google.com/test',
            onboarding_completed: true,
            ai_lead_assigned: 'growth_lead',
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const service = new ZeroTechOnboardingService(mockDb as unknown as Pool);
      const state = await service.submitLinks(WORKSPACE_ID, {
        fanpage_url: 'https://facebook.com/quan-an-ngon',
        gmaps_url: 'https://maps.app.goo.gl/test',
        gdrive_url: 'https://drive.google.com/test',
      });

      expect(state.onboarding_completed).toBe(true);
      expect(state.active_agents.length).toBe(8);
      expect(state.active_agents.every((a) => a.status === 'active')).toBe(true);
    });
  });

  describe('6. Wallet Top-up Mockup with VietQR', () => {
    it('creates top-up order with dynamic VietQR reference and confirms payment', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'tx-1',
              amount_vnd: 500000,
              credits_added: 3000,
              package_name: 'Gói Tăng Trưởng (Growth)',
              qr_reference: 'GROWTH 10000000 1234',
              payment_method: 'vietqr',
              status: 'pending',
              created_at: new Date().toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'tx-1',
              amount_vnd: 500000,
              credits_added: 3000,
              status: 'success',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // update wallet
        .mockResolvedValueOnce({
          rows: [
            {
              workspace_id: WORKSPACE_ID,
              balance_credits: 4200,
              balance_vnd: 750000,
              tier: 'growth',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // tx list

      const service = new MerchantWalletService(mockDb as unknown as Pool);
      const tx = await service.createTopup(WORKSPACE_ID, 'growth');

      expect(tx.amount_vnd).toBe(500000);
      expect(tx.credits_added).toBe(3000);
      expect(tx.qr_reference).toContain('GROWTH');
      expect(tx.vietqr_image_url).toContain('vietqr.io');

      const confirmedWallet = await service.confirmPayment(WORKSPACE_ID, tx.id);
      expect(confirmedWallet.balance_credits).toBe(4200);
    });
  });
});
