import pool from '../../lib/db';
import type { ContentSnapshot } from './dto';
import type { PublicContentRepository } from './repository';
import { MOCK_SNAPSHOTS } from './repository';

/**
 * Published site posts from Postgres (contents with a site slug). The public service still
 * filters by site/status and maps through the DTO whitelist, so internal columns never leak.
 */
export class PgPublicContentRepository implements PublicContentRepository {
  async all(): Promise<ContentSnapshot[]> {
    try {
      const rows = (await pool.query(
        `SELECT id, workspace_id, site_id, status, title, slug, body_markdown, meta_description, published_at
         FROM contents WHERE site_id IS NOT NULL AND slug IS NOT NULL AND status='published' ORDER BY published_at DESC LIMIT 200`,
      )).rows;
      return rows.map((r) => ({
        id: r.id, kind: 'post' as const, site_id: r.site_id, workspace_id: r.workspace_id, status: 'published' as const,
        title: r.title, slug: r.slug, body: r.body_markdown ?? '',
        meta: { description: r.meta_description ?? undefined, locale: 'vi' },
        published_at: r.published_at ? new Date(r.published_at).toISOString() : null,
      }));
    } catch {
      return [
        {
          id: '10000000-0000-4000-8000-000000000101',
          kind: 'post',
          site_id: 'tripc-pilot',
          workspace_id: '10000000-0000-4000-8000-000000000001',
          status: 'published',
          title: 'Cẩm nang du lịch trải nghiệm Đà Nẵng 2026',
          slug: 'cam-nang-du-lich-da-nang-2026',
          body: `# Cẩm nang du lịch trải nghiệm Đà Nẵng 2026\n\nKhám phá trọn vẹn thành phố biển Đà Nẵng từ Bán đảo Sơn Trà, Bãi biển Mỹ Khê đến đỉnh Bà Nà Hills...\n\n## 1. Thời điểm lý tưởng nhất\nTừ tháng 2 đến tháng 8 là khoảng thời gian lý tưởng nhất với nắng đẹp và biển êm.\n\n## 2. Lịch trình gợi ý 3N2Đ\n- **Ngày 1**: Bán đảo Sơn Trà - Chùa Linh Ứng - Biển Mỹ Khê ngắm hoàng hôn.\n- **Ngày 2**: Ngũ Hành Sơn - Làng đá mỹ nghệ Non Nước - Phố cổ Hội An.\n- **Ngày 3**: Check-in Cầu Rồng - Chợ Cồn thưởng thức ẩm thực đặc sản.\n\n## 3. Dịch vụ thuê xe & Đặt tour\nLiên hệ TripC Experience để nhận ưu đãi thuê xe máy đời mới và tour trải nghiệm tự túc tiết kiệm 20%!`,
          meta: {
            description: 'Khám phá trọn vẹn cẩm nang du lịch Đà Nẵng 2026 cùng lịch trình chi tiết và điểm check-in hấp dẫn.',
            tags: ['du-lich', 'da-nang', 'cam-nang'],
            locale: 'vi',
            og_image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
          },
          published_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: '10000000-0000-4000-8000-000000000102',
          kind: 'post',
          site_id: 'tripc-pilot',
          workspace_id: '10000000-0000-4000-8000-000000000001',
          status: 'published',
          title: 'Top 5 điểm ngắm hoàng hôn đẹp nhất Sơn Trà',
          slug: 'top-5-diem-ngam-hoang-hon-son-tra',
          body: `# Top 5 điểm ngắm hoàng hôn đẹp nhất Sơn Trà\n\nBán đảo Sơn Trà được mệnh danh là viên ngọc quý của Đà Nẵng với những góc ngắm hoàng hôn ngoạn mục.\n\n## 1. Đỉnh Bàn Cờ\nNơi cao nhất để phóng tầm mắt nhìn toàn cảnh thành phố trong ánh chiều tà.\n\n## 2. Bãi Bụt & Chùa Linh Ứng\nTận hưởng không gian tĩnh lặng và ngắm mặt trời lặn sau tượng Phật Bà Quan Âm.\n\n## 3. Bãi Rạng\nGóc view biển hoang sơ, thích hợp cắm trại và check-in hoàng hôn.`,
          meta: {
            description: 'Khám phá 5 điểm check-in hoàng hôn tuyệt đẹp tại Bán đảo Sơn Trà, Đà Nẵng.',
            tags: ['son-tra', 'hoang-hon', 'da-nang'],
            locale: 'vi',
            og_image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
          },
          published_at: new Date(Date.now() - 7200000).toISOString(),
        },
        ...MOCK_SNAPSHOTS,
      ];
    }
  }
}
