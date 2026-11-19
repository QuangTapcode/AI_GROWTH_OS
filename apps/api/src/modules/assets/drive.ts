import pool from '../../lib/db';
import { MultiLLMAdapterService } from '../ai/llmAdapter';

export interface DriveAsset {
  id: string;
  workspace_id: string;
  file_name: string;
  file_url: string;
  drive_file_id?: string;
  asset_type: 'destination_photo' | 'experience_activity' | 'accommodation_space' | 'service_menu';
  vision_tags: string[];
  dish_name?: string; // Tên điểm đến / Hoạt động trải nghiệm
  flavor_notes?: string; // Cảm xúc & Nét đặc sắc du lịch
  generated_caption?: string;
  suggested_channels: string[];
  status: 'staged' | 'published' | 'archived';
  created_at: string;
}

const memoryDrive = new Map<string, DriveAsset[]>();

export class DriveAssetIngestionService {
  constructor(private readonly db = pool) {}

  async listStagedAssets(workspaceId: string): Promise<DriveAsset[]> {
    try {
      const res = await this.db.query(
        `SELECT * FROM drive_asset_queue
         WHERE workspace_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT 50`,
        [workspaceId]
      );

      if (res.rows.length === 0) {
        return this.seedDemoDriveAssets(workspaceId);
      }

      return res.rows.map(this.mapAssetRow);
    } catch {
      if (!memoryDrive.has(workspaceId)) {
        memoryDrive.set(workspaceId, this.getDemoDriveAssets(workspaceId));
      }
      return memoryDrive.get(workspaceId)!;
    }
  }

  async syncDriveFolder(
    workspaceId: string,
    _folderUrl?: string
  ): Promise<{ assets_scanned: number; new_assets_ingested: number; items: DriveAsset[] }> {
    const mockPhotos = [
      {
        name: 'IMG_20261118_HoangHonSonTra.jpg',
        url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
        title: 'Hoàng Hôn Tuyệt Đẹp Trên Bán Đảo Sơn Trà & Bãi Biển Mỹ Khê',
        tags: ['Du lịch Đà Nẵng', 'Hoàng hôn biển', 'Check-in Sơn Trà', 'Cảnh quan thiên nhiên', 'Ảnh chụp thực tế'],
        notes: 'Góc ngắm hoàng hôn rực rỡ, gió biển trong lành, thích hợp cho chuyến đi chữa lành và lưu giữ kỷ niệm đẹp.',
        caption: '🌅 Hoàng hôn buông xuống Sơn Trà đẹp tựa tranh vẽ! Gió biển lồng lộng xua tan mọi mệt mỏi. Check-in ngay điểm ngắm hoàng hôn triệu đô này bạn nhé! ✨ #DuLichDaNang #SonTraSunset',
      },
      {
        name: 'IMG_20261118_TraiNghiemCheoSUP.jpg',
        url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
        title: 'Trải Nghiệm Chèo SUP Đón Bình Minh & Lặn Ngắm San Hô Bản Địa',
        tags: ['Tour trải nghiệm', 'Chèo SUP', 'Lặn biển', 'Hoạt động ngoài trời', 'Khám phá bản địa'],
        notes: 'Cảm giác đón bình minh trên mặt biển êm ả, khám phá hệ sinh thái biển nguyên sơ cùng hướng dẫn viên nhiệt tình.',
        caption: '🌊 Đón ánh bình minh đầu ngày rực rỡ giữa biển khơi Mỹ Khê với tour chèo SUP độc bản! Đặt chỗ hôm nay để nhận ưu đãi chụp ảnh flycam miễn phí nha! 🏄 #CheoSUP #MyKhe',
      },
    ];

    const inserted: DriveAsset[] = [];
    for (const p of mockPhotos) {
      try {
        const res = await this.db.query(
          `INSERT INTO drive_asset_queue (
            workspace_id, file_name, file_url, asset_type, vision_tags, dish_name, flavor_notes, generated_caption, status
          ) VALUES (
            $1::uuid, $2::varchar, $3::text, 'destination_photo', $4::jsonb, $5::varchar, $6::text, $7::text, 'staged'
          ) RETURNING *`,
          [workspaceId, p.name, p.url, JSON.stringify(p.tags), p.title, p.notes, p.caption]
        );
        inserted.push(this.mapAssetRow(res.rows[0]));
      } catch {
        const fallbackAsset: DriveAsset = {
          id: `asset_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          workspace_id: workspaceId,
          file_name: p.name,
          file_url: p.url,
          asset_type: 'destination_photo',
          vision_tags: p.tags,
          dish_name: p.title,
          flavor_notes: p.notes,
          generated_caption: p.caption,
          suggested_channels: ['google_maps', 'facebook', 'tiktok'],
          status: 'staged',
          created_at: new Date().toISOString(),
        };
        inserted.push(fallbackAsset);
      }
    }

    if (memoryDrive.has(workspaceId)) {
      memoryDrive.set(workspaceId, [...inserted, ...memoryDrive.get(workspaceId)!]);
    } else {
      memoryDrive.set(workspaceId, inserted);
    }

    return {
      assets_scanned: 2,
      new_assets_ingested: inserted.length,
      items: inserted,
    };
  }

  async addAsset(
    workspaceId: string,
    data: {
      file_name: string;
      file_url: string;
      spot_name: string;
      spot_notes?: string;
    }
  ): Promise<DriveAsset> {
    const tags = ['Du lịch Đà Nẵng', 'Địa điểm check-in', 'Ảnh thực tế'];
    const caption = `✨ Cập nhật mới nhất từ địa điểm "${data.spot_name}": ${data.spot_notes || 'Khung cảnh tuyệt đẹp, đáng để trải nghiệm khi đến Đà Nẵng'}. Hãy ghé thăm và cảm nhận nhé! 📍`;

    try {
      const res = await this.db.query(
        `INSERT INTO drive_asset_queue (
          workspace_id, file_name, file_url, asset_type, vision_tags, dish_name, flavor_notes, generated_caption, status
        ) VALUES (
          $1::uuid, $2::varchar, $3::text, 'destination_photo', $4::jsonb, $5::varchar, $6::text, $7::text, 'staged'
        ) RETURNING *`,
        [
          workspaceId,
          data.file_name,
          data.file_url,
          JSON.stringify(tags),
          data.spot_name,
          data.spot_notes || 'Thông tin địa điểm thực tế từ Google Drive',
          caption,
        ]
      );

      return this.mapAssetRow(res.rows[0]);
    } catch {
      const newAsset: DriveAsset = {
        id: `asset_${Date.now()}`,
        workspace_id: workspaceId,
        file_name: data.file_name,
        file_url: data.file_url,
        asset_type: 'destination_photo',
        vision_tags: tags,
        dish_name: data.spot_name,
        flavor_notes: data.spot_notes || 'Thông tin địa điểm thực tế từ Google Drive',
        generated_caption: caption,
        suggested_channels: ['google_maps', 'facebook'],
        status: 'staged',
        created_at: new Date().toISOString(),
      };
      const cur = memoryDrive.get(workspaceId) || this.getDemoDriveAssets(workspaceId);
      memoryDrive.set(workspaceId, [newAsset, ...cur]);
      return newAsset;
    }
  }

  async publishAsset(
    workspaceId: string,
    assetId: string,
    channels: string[] = ['facebook', 'google_maps', 'tiktok']
  ): Promise<DriveAsset | null> {
    try {
      const res = await this.db.query(
        `UPDATE drive_asset_queue
         SET status = 'published',
             suggested_channels = $3::text[],
             updated_at = NOW()
         WHERE workspace_id = $1::uuid AND id = $2::uuid
         RETURNING *`,
        [workspaceId, assetId, channels]
      );

      if (res.rows.length === 0) return null;
      return this.mapAssetRow(res.rows[0]);
    } catch {
      const cur = memoryDrive.get(workspaceId) || [];
      const item = cur.find((a) => a.id === assetId);
      if (item) {
        item.status = 'published';
        item.suggested_channels = channels;
        return item;
      }
      return null;
    }
  }

  private async seedDemoDriveAssets(workspaceId: string): Promise<DriveAsset[]> {
    const demo = this.getDemoDriveAssets(workspaceId);
    try {
      const results: DriveAsset[] = [];
      for (const d of demo) {
        const res = await this.db.query(
          `INSERT INTO drive_asset_queue (
            workspace_id, file_name, file_url, asset_type, vision_tags, dish_name, flavor_notes, generated_caption, status
          ) VALUES (
            $1::uuid, $2::varchar, $3::text, 'destination_photo', $4::jsonb, $5::varchar, $6::text, $7::text, 'staged'
          ) RETURNING *`,
          [workspaceId, d.file_name, d.file_url, JSON.stringify(d.vision_tags), d.dish_name, d.flavor_notes, d.generated_caption]
        );
        results.push(this.mapAssetRow(res.rows[0]));
      }
      return results;
    } catch {
      memoryDrive.set(workspaceId, demo);
      return demo;
    }
  }

  private getDemoDriveAssets(workspaceId: string): DriveAsset[] {
    return [
      {
        id: '10000000-0000-4000-8000-000000000031',
        workspace_id: workspaceId,
        file_name: 'IMG_BaiBien_MyKhe_DaNang.jpg',
        file_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
        asset_type: 'destination_photo',
        dish_name: 'Bình Minh Bãi Biển Mỹ Khê — Top Bãi Biển Quyến Rũ Nhất Hành Tinh',
        vision_tags: ['Biển Mỹ Khê', 'Du lịch tự túc', 'Check-in sống ảo', 'Trải nghiệm du lịch'],
        flavor_notes: 'Cát trắng mịn màng, sóng êm và làn nước trong xanh màu ngọc bích.',
        generated_caption:
          '🌊 Bình minh Mỹ Khê sáng nay rực rỡ như một bức tranh! Nếu bạn đang lên kế hoạch cho chuyến đi Đà Nẵng sắp tới, đừng quên dậy sớm đón những tia nắng đầu tiên bên bờ biển nhé. Nhắn tin cho tụi mình để nhận cẩm nang du lịch bản địa miễn phí nha! ✨ #DuLichDaNang #MyKheBeach #TravelDanang',
        suggested_channels: ['google_maps', 'facebook', 'tiktok'],
        status: 'staged',
        created_at: new Date().toISOString(),
      },
      {
        id: '10000000-0000-4000-8000-000000000032',
        workspace_id: workspaceId,
        file_name: 'IMG_Tour_SonTra_KhamPha.jpg',
        file_url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
        asset_type: 'destination_photo',
        dish_name: 'Hành Trình Khám Phá Rừng Nguyên Sinh & Vọoc Chà Vá Bán Đảo Sơn Trà',
        vision_tags: ['Bán đảo Sơn Trà', 'Tour trải nghiệm', 'Thiên nhiên hoang sơ', 'Chụp ảnh du lịch'],
        flavor_notes: 'Cung đường ven biển uốn lượn, không khí mát lành giữa đại ngàn và biển cả.',
        generated_caption:
          '🌿 Thả mình giữa cung đường biển Sơn Trà lộng gió, ngắm trọn toàn cảnh vịnh Đà Nẵng từ trên cao. Trải nghiệm du lịch không thể bỏ lỡ khi ghé thăm thành phố đáng sống! 🛵🏔️ #SonTraPeninsula #KhamPhaDaNang #CheckinVietnam',
        suggested_channels: ['google_maps', 'facebook'],
        status: 'published',
        created_at: new Date().toISOString(),
      },
    ];
  }

  private mapAssetRow(row: any): DriveAsset {
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      file_name: row.file_name,
      file_url: row.file_url,
      drive_file_id: row.drive_file_id || undefined,
      asset_type: row.asset_type || 'destination_photo',
      vision_tags: Array.isArray(row.vision_tags)
        ? row.vision_tags
        : typeof row.vision_tags === 'string'
        ? JSON.parse(row.vision_tags)
        : ['Du lịch trải nghiệm Đà Nẵng'],
      dish_name: row.dish_name || 'Điểm đến & Hoạt động trải nghiệm',
      flavor_notes: row.flavor_notes || 'Khung cảnh thiên nhiên ngoạn mục',
      generated_caption: row.generated_caption || undefined,
      suggested_channels: row.suggested_channels || ['facebook', 'google_maps'],
      status: row.status || 'staged',
      created_at: new Date(row.created_at).toISOString(),
    };
  }
}
