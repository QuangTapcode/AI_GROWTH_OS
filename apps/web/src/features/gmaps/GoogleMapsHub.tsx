'use client';

import React, { useState, useEffect } from 'react';

interface GMapsItem {
  id: string;
  item_type: 'review' | 'local_post';
  author_name: string;
  rating: number;
  content: string;
  reply_text?: string;
  status: 'pending' | 'replied';
  created_at: string;
  metadata?: {
    image_url?: string;
    published_to_maps?: boolean;
  };
}

interface DriveAsset {
  id: string;
  file_name: string;
  file_url: string;
  dish_name?: string; // Tên địa điểm du lịch trên Google Maps
  flavor_notes?: string; // Thông tin thực tế & Điểm nhấn địa điểm
  vision_tags: string[];
  generated_caption?: string;
  status: 'staged' | 'published';
}

interface MapSpot {
  id: string;
  name: string;
  category: string;
  address: string;
  query: string;
  lat: number;
  lng: number;
  rating: number;
  reviewsCount: number;
  highlight: string;
  imageUrl: string;
  drivePhotosCount: number;
  seoKeywords: string[];
  status: 'verified' | 'managed';
}

interface GoogleMapsHubProps {
  workspaceId: string;
}

const INITIAL_SPOTS: MapSpot[] = [
  {
    id: 'spot-1',
    name: 'TripC Experience Hub Đà Nẵng',
    category: 'Trụ Sở Chính & Điểm Hẹn Tour',
    address: '258 Võ Nguyên Giáp, Phước Mỹ, Sơn Trà, Đà Nẵng',
    query: '258 Võ Nguyên Giáp, Phước Mỹ, Sơn Trà, Đà Nẵng, Việt Nam',
    lat: 16.0594,
    lng: 108.2435,
    rating: 4.9,
    reviewsCount: 52,
    highlight: 'Trung tâm tư vấn tour, thuê xe máy và hỗ trợ du khách 24/7 trực tiếp tại bãi biển Mỹ Khê.',
    imageUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
    drivePhotosCount: 12,
    seoKeywords: ['Du lịch trải nghiệm Đà Nẵng', 'Check-in Mỹ Khê', 'Tour xe máy Sơn Trà'],
    status: 'verified',
  },
  {
    id: 'spot-2',
    name: 'Chùa Linh Ứng - Bán Đảo Sơn Trà',
    category: 'Cảnh Quan & Văn Hóa Tâm Linh',
    address: 'Hoàng Sa, Thọ Quang, Sơn Trà, Đà Nẵng',
    query: 'Chùa Linh Ứng Bán Đảo Sơn Trà Đà Nẵng',
    lat: 16.1009,
    lng: 108.2778,
    rating: 4.8,
    reviewsCount: 1240,
    highlight: 'Tượng Phật Bà Quán Thế Âm cao 67m hướng ra biển, không khí trong lành, view ngắm trọn vẹn thành phố.',
    imageUrl: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800',
    drivePhotosCount: 8,
    seoKeywords: ['Bán đảo Sơn Trà', 'Chùa Linh Ứng', 'Cảnh đẹp Đà Nẵng'],
    status: 'managed',
  },
  {
    id: 'spot-3',
    name: 'Bãi Biển Mỹ Khê - Bãi Tắm Du Lịch',
    category: 'Biển & Hoạt Động Thể Thao Nước',
    address: 'Võ Nguyên Giáp, Ngũ Hành Sơn, Đà Nẵng',
    query: 'Bãi biển Mỹ Khê Đà Nẵng',
    lat: 16.0645,
    lng: 108.2475,
    rating: 4.8,
    reviewsCount: 2890,
    highlight: 'Top bãi biển quyến rũ nhất hành tinh do Forbes bình chọn, bờ cát trắng mịn, thích hợp tắm biển và lướt sóng.',
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
    drivePhotosCount: 20,
    seoKeywords: ['Biển Mỹ Khê', 'Tắm biển Đà Nẵng', 'Hải sản Mỹ Khê'],
    status: 'managed',
  },
  {
    id: 'spot-4',
    name: 'Cầu Rồng & Chợ Đêm Sơn Trà',
    category: 'Biểu Tượng Đêm & Ẩm Thực Phố',
    address: 'Đường Trần Hưng Đạo, An Hải Tây, Sơn Trà, Đà Nẵng',
    query: 'Cầu Rồng Đà Nẵng',
    lat: 16.061,
    lng: 108.2272,
    rating: 4.9,
    reviewsCount: 3500,
    highlight: 'Biểu tượng Đà Nẵng với màn trình diễn phun lửa & phun nước vào 21h tối thứ 7 và Chủ nhật hàng tuần.',
    imageUrl: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800',
    drivePhotosCount: 15,
    seoKeywords: ['Cầu Rồng', 'Chợ đêm Sơn Trà', 'Check-in đêm Đà Nẵng'],
    status: 'managed',
  },
  {
    id: 'spot-5',
    name: 'Quần Thể Danh Thắng Ngũ Hành Sơn',
    category: 'Di Tích & Hang Động Tự Nhiên',
    address: '81 Huyền Trân Công Chúa, Hòa Hải, Ngũ Hành Sơn, Đà Nẵng',
    query: 'Ngũ Hành Sơn Đà Nẵng',
    lat: 16.0028,
    lng: 108.2635,
    rating: 4.7,
    reviewsCount: 980,
    highlight: '5 ngọn núi đá vôi kỳ vĩ với hệ thống hang động Huyền Không, Động Tàng Chơn và làng nghề đá Non Nước.',
    imageUrl: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=800',
    drivePhotosCount: 6,
    seoKeywords: ['Ngũ Hành Sơn', 'Làng đá Non Nước', 'Khám phá hang động'],
    status: 'managed',
  },
];

export function GoogleMapsHub({ workspaceId }: GoogleMapsHubProps) {
  const [overview, setOverview] = useState({
    average_rating: 4.9,
    total_reviews: 52,
    response_rate_percent: 100,
    top_seo_keywords: [
      'Du lịch trải nghiệm Đà Nẵng',
      'Tour khám phá Bán đảo Sơn Trà',
      'Check-in bãi biển Mỹ Khê',
      'Hải sản tươi sống Đà Nẵng',
    ],
    local_pack_rank: 2,
  });

  const [items, setItems] = useState<GMapsItem[]>([]);
  const [assets, setAssets] = useState<DriveAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReplying, setIsReplying] = useState<string | null>(null);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [isPublishingAsset, setIsPublishingAsset] = useState<string | null>(null);

  // Tab: 'map' là tab mặc định đầu tiên để hiển thị bản đồ trực quan
  const [activeTab, setActiveTab] = useState<'map' | 'drive_assets' | 'local_posts' | 'reviews'>('map');

  // Bản đồ trực quan tương tác
  const [spots, setSpots] = useState<MapSpot[]>(INITIAL_SPOTS);
  const [selectedSpot, setSelectedSpot] = useState<MapSpot>(INITIAL_SPOTS[0]);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap');
  const [zoom, setZoom] = useState(14);
  const [searchQuery, setSearchQuery] = useState('');

  const [customPostContent, setCustomPostContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [showNewPostModal, setShowNewPostModal] = useState(false);

  // Modal thêm ảnh địa điểm mới vào Drive
  const [showAddAssetModal, setShowAddAssetModal] = useState(false);
  const [newSpotName, setNewSpotName] = useState('Chùa Linh Ứng Bán Đảo Sơn Trà');
  const [newSpotNotes, setNewSpotNotes] = useState(
    'Cung đường râm mát, view nhìn trọn vẹn biển Mỹ Khê và thành phố Đà Nẵng. Thích hợp đi sáng sớm ngắm bình minh.'
  );
  const [newFileUrl, setNewFileUrl] = useState(
    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800'
  );
  const [isAddingAsset, setIsAddingAsset] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [gmapsRes, driveRes] = await Promise.all([
        fetch(`/v1/workspaces/${workspaceId}/gmaps/reputation`),
        fetch(`/v1/workspaces/${workspaceId}/assets/drive/queue`),
      ]);

      const gmapsJson = await gmapsRes.json();
      if (gmapsJson.ok) {
        if (gmapsJson.overview) setOverview(gmapsJson.overview);
        if (Array.isArray(gmapsJson.items)) setItems(gmapsJson.items);
      }

      const driveJson = await driveRes.json();
      if (driveJson.ok && Array.isArray(driveJson.assets)) {
        setAssets(driveJson.assets);
      }
    } catch {
      // Fallback in-memory
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  const handleReplyReview = async (reviewId: string) => {
    setIsReplying(reviewId);
    try {
      const res = await fetch(`/v1/workspaces/${workspaceId}/gmaps/reviews/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: reviewId,
          tone: 'warm_professional',
        }),
      });
      const json = await res.json();
      if (json.ok && json.item) {
        setItems((prev) => prev.map((item) => (item.id === reviewId ? json.item : item)));
      }
    } catch {
      // Handled silently
    } finally {
      setIsReplying(null);
    }
  };

  const handleSyncDrive = async () => {
    setIsSyncingDrive(true);
    try {
      const res = await fetch(`/v1/workspaces/${workspaceId}/assets/drive/sync`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.ok && Array.isArray(json.queued_assets)) {
        setAssets(json.queued_assets);
      }
    } catch {
      // Handled silently
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const handlePublishFromAsset = async (assetId: string) => {
    setIsPublishingAsset(assetId);
    try {
      const res = await fetch(`/v1/workspaces/${workspaceId}/gmaps/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: assetId,
          post_type: 'STANDARD',
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setAssets((prev) =>
          prev.map((a) => (a.id === assetId ? { ...a, status: 'published' } : a))
        );
        if (json.post) {
          setItems((prev) => [json.post, ...prev]);
        }
      }
    } catch {
      // Handled silently
    } finally {
      setIsPublishingAsset(null);
    }
  };

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingAsset(true);
    try {
      const res = await fetch(`/v1/workspaces/${workspaceId}/assets/drive/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spot_name: newSpotName,
          spot_notes: newSpotNotes,
          file_url: newFileUrl,
        }),
      });
      const json = await res.json();
      if (json.ok && json.asset) {
        setAssets((prev) => [json.asset, ...prev]);

        // Nếu điểm này chưa có trong danh sách ghim thì tự động thêm vào bản đồ
        if (!spots.some((s) => s.name.toLowerCase().includes(newSpotName.toLowerCase()))) {
          const newSpot: MapSpot = {
            id: `spot-${Date.now()}`,
            name: newSpotName,
            category: 'Điểm Khám Phá Mới',
            address: `${newSpotName}, Đà Nẵng`,
            query: `${newSpotName} Đà Nẵng`,
            lat: 16.0544,
            lng: 108.2022,
            rating: 5.0,
            reviewsCount: 1,
            highlight: newSpotNotes,
            imageUrl: newFileUrl,
            drivePhotosCount: 1,
            seoKeywords: [newSpotName, 'Đà Nẵng'],
            status: 'managed',
          };
          setSpots((prev) => [newSpot, ...prev]);
          setSelectedSpot(newSpot);
        }

        setShowAddAssetModal(false);
      }
    } catch {
      // Handled silently
    } finally {
      setIsAddingAsset(false);
    }
  };

  const handleSearchSpot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Tìm trong danh sách hiện tại
    const found = spots.find((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.address.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (found) {
      setSelectedSpot(found);
    } else {
      // Tạo điểm ghim tạm thời theo truy vấn tìm kiếm
      const customSpot: MapSpot = {
        id: `custom-${Date.now()}`,
        name: searchQuery,
        category: 'Địa Điểm Tìm Kiếm',
        address: `${searchQuery}, Đà Nẵng, Việt Nam`,
        query: `${searchQuery} Đà Nẵng`,
        lat: 16.0544,
        lng: 108.2022,
        rating: 4.8,
        reviewsCount: 100,
        highlight: `Vị trí tìm kiếm thực tế trên Google Maps cho ${searchQuery}`,
        imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
        drivePhotosCount: 0,
        seoKeywords: [searchQuery, 'Đà Nẵng'],
        status: 'managed',
      };
      setSpots((prev) => [customSpot, ...prev]);
      setSelectedSpot(customSpot);
    }
  };

  const openDriveUploadForSpot = (spot: MapSpot) => {
    setNewSpotName(spot.name);
    setNewSpotNotes(spot.highlight);
    setShowAddAssetModal(true);
  };

  const handleCreateCustomPost = async () => {
    if (!customPostContent.trim()) return;
    setIsPosting(true);
    try {
      const res = await fetch(`/v1/workspaces/${workspaceId}/gmaps/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: customPostContent,
          post_type: 'CUSTOM',
        }),
      });
      const json = await res.json();
      if (json.ok && json.post) {
        setItems((prev) => [json.post, ...prev]);
        setCustomPostContent('');
        setShowNewPostModal(false);
        setActiveTab('local_posts');
      }
    } catch {
      // Handled silently
    } finally {
      setIsPosting(false);
    }
  };

  const reviews = items.filter((i) => i.item_type === 'review');
  const localPosts = items.filter((i) => i.item_type === 'local_post');

  const embedMapUrl = `https://maps.google.com/maps?q=${encodeURIComponent(
    selectedSpot.query
  )}&t=${mapType === 'satellite' ? 'k' : 'm'}&z=${zoom}&ie=UTF8&iwloc=&output=embed`;

  const officialGoogleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    selectedSpot.query
  )}`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Overview Scorecard */}
      <div className="p-6 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🗺️</span>
              <h3 className="text-lg font-bold">
                Agent 5: Google Maps Specialist (Bản Đồ Vị Trí & Tối Ưu Local SEO)
              </h3>
            </div>
            <p className="text-xs text-blue-200 mt-1 max-w-2xl">
              Tích hợp bản đồ Google Maps tương tác trực tiếp. Bạn tải ảnh và thông tin địa điểm lên Google Drive; AI Agent tự động gắn thẻ Gemini Vision, tối ưu thứ hạng Local Pack và xuất bản bài cập nhật lên Google Maps.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-center px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
              <div className="text-xl font-extrabold text-amber-400">{overview.average_rating} ★</div>
              <div className="text-[10px] text-slate-300 uppercase tracking-wider font-semibold">Đánh Giá TB</div>
            </div>

            <div className="text-center px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
              <div className="text-xl font-extrabold text-emerald-400">{overview.response_rate_percent}%</div>
              <div className="text-[10px] text-slate-300 uppercase tracking-wider font-semibold">Tỷ Lệ Phản Hồi</div>
            </div>

            <div className="text-center px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
              <div className="text-xl font-extrabold text-blue-400">Top #{overview.local_pack_rank}</div>
              <div className="text-[10px] text-slate-300 uppercase tracking-wider font-semibold">Vị Trí Bản Đồ</div>
            </div>
          </div>
        </div>

        {/* SEO Keywords tags */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-blue-300 font-semibold">Từ khóa Local SEO lồng ghép tự động:</span>
            {overview.top_seo_keywords.map((kw, idx) => (
              <span
                key={idx}
                className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/20 text-blue-200 border border-blue-400/30"
              >
                #{kw}
              </span>
            ))}
          </div>

          <a
            href={officialGoogleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors flex items-center gap-1.5"
          >
            <span>📍</span> Mở Vị Trí Trên Google Maps App ↗
          </a>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="px-6 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 sm:gap-4">
          <button
            onClick={() => setActiveTab('map')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'map'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>🗺️</span> Bản Đồ Trực Quan ({spots.length} Địa Điểm)
          </button>

          <button
            onClick={() => setActiveTab('drive_assets')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'drive_assets'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>📸</span> Tư Liệu Ảnh Drive ({assets.length})
          </button>

          <button
            onClick={() => setActiveTab('local_posts')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'local_posts'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>📝</span> Bài Cập Nhật Maps ({localPosts.length})
          </button>

          <button
            onClick={() => setActiveTab('reviews')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'reviews'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>💬</span> Đánh Giá ({reviews.length})
          </button>
        </div>

        <div className="flex items-center gap-2 py-2">
          <button
            onClick={() => setShowAddAssetModal(true)}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm flex items-center gap-1.5"
          >
            <span>➕</span> Tải Lên Ảnh Địa Điểm Mới (Drive Ingestion)
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {/* ========================================================= */}
        {/* TAB 1: GOOGLE MAPS TRỰC QUAN (INTERACTIVE LIVE MAP)       */}
        {/* ========================================================= */}
        {activeTab === 'map' && (
          <div className="space-y-6">
            {/* Thanh công cụ tìm kiếm và điều khiển bản đồ */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <form onSubmit={handleSearchSpot} className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="🔍 Nhập tên địa điểm hoặc địa chỉ để tìm và ghim lên Google Maps (ví dụ: Bà Nà Hills, Bãi Rạng...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shrink-0 shadow-sm"
                >
                  Tìm & Ghim
                </button>
              </form>

              <div className="flex items-center gap-2 justify-end">
                {/* Switch Chế độ bản đồ */}
                <div className="flex items-center bg-white rounded-lg border border-slate-300 p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setMapType('roadmap')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      mapType === 'roadmap' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bản Đồ
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapType('satellite')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      mapType === 'satellite' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Vệ Tinh
                  </button>
                </div>

                {/* Điều khiển Zoom */}
                <div className="flex items-center bg-white rounded-lg border border-slate-300 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(z + 1, 19))}
                    className="px-2.5 py-1 hover:bg-slate-100 border-r border-slate-200"
                    title="Phóng to"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(z - 1, 10))}
                    className="px-2.5 py-1 hover:bg-slate-100"
                    title="Thu nhỏ"
                  >
                    -
                  </button>
                </div>

                <a
                  href={officialGoogleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1 shadow-xs"
                >
                  <span>↗</span> Mở Tab Mới
                </a>
              </div>
            </div>

            {/* Layout Grid 2 cột: Cột Trái là Bản Đồ Trực Quan, Cột Phải là Thẻ Chi Tiết & Danh Sách Ghim */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* CỘT TRÁI: KHUNG GOOGLE MAPS EMBED LIVE (7/12) */}
              <div className="lg:col-span-7 flex flex-col space-y-3">
                <div className="relative w-full h-[450px] sm:h-[520px] rounded-2xl overflow-hidden border-2 border-slate-300 shadow-md bg-slate-100">
                  <iframe
                    title={`Google Maps - ${selectedSpot.name}`}
                    src={embedMapUrl}
                    className="w-full h-full border-0"
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                  />

                  {/* Badge Vị Trí Đang Ghim Trên Bản Đồ */}
                  <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl shadow-lg border border-slate-200/90 max-w-sm pointer-events-auto">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-800">
                        Live Google Map Position
                      </span>
                    </div>
                    <div className="font-bold text-slate-900 text-xs mt-0.5 truncate">{selectedSpot.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      📍 {selectedSpot.lat.toFixed(4)}° N, {selectedSpot.lng.toFixed(4)}° E
                    </div>
                  </div>

                  {/* Nút Chuyển nhanh chế độ xem góc rộng */}
                  <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-700 shadow-sm border border-slate-200">
                    Thu phóng: {zoom}x
                  </div>
                </div>

                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/80 flex items-center justify-between text-xs text-blue-900">
                  <div className="flex items-center gap-2">
                    <span className="text-base">💡</span>
                    <span>
                      Bản đồ đang ghim điểm: <strong>{selectedSpot.name}</strong>. Bạn có thể kéo, phóng to hoặc nhấp vào địa điểm khác bên phải để đổi vị trí.
                    </span>
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI: THÔNG TIN ĐỊA ĐIỂM ĐANG CHỌN & DANH SÁCH GHIM (5/12) */}
              <div className="lg:col-span-5 flex flex-col space-y-4">
                {/* Thẻ Chi Tiết Điểm Đang Chọn */}
                <div className="p-4 rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50/60 to-white shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white uppercase">
                        {selectedSpot.category}
                      </span>
                      <h4 className="font-bold text-base text-slate-900 mt-1.5 leading-snug">
                        {selectedSpot.name}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <span>📍</span> {selectedSpot.address}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-amber-500 font-bold text-sm">
                        {'★'.repeat(Math.round(selectedSpot.rating))}
                      </div>
                      <div className="text-[10px] text-slate-400 font-semibold">
                        {selectedSpot.rating}/5.0 ({selectedSpot.reviewsCount} review)
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 mt-2.5 leading-relaxed bg-white/80 p-2.5 rounded-lg border border-slate-100">
                    {selectedSpot.highlight}
                  </p>

                  {/* Hành động nhanh cho điểm này */}
                  <div className="mt-3.5 pt-3 border-t border-slate-200/80 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openDriveUploadForSpot(selectedSpot)}
                      className="px-2.5 py-2 text-[11px] font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs flex items-center justify-center gap-1"
                    >
                      <span>📸</span> Tải Ảnh Drive Cho Điểm Này
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCustomPostContent(
                          `Check-in tuyệt đẹp tại ${selectedSpot.name} cùng TripC! ${selectedSpot.highlight}`
                        );
                        setShowNewPostModal(true);
                      }}
                      className="px-2.5 py-2 text-[11px] font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-xs flex items-center justify-center gap-1"
                    >
                      <span>✍️</span> Đăng Bài Local Post
                    </button>
                  </div>
                </div>

                {/* Danh sách các địa điểm đã ghim trên Google Maps */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-bold text-xs uppercase tracking-wider text-slate-600">
                      Danh Sách Địa Điểm Đã Ghim ({spots.length})
                    </h5>
                    <span className="text-[11px] text-blue-600 font-semibold">
                      Nhấp để focus bản đồ
                    </span>
                  </div>

                  <div className="space-y-2 max-h-[290px] overflow-y-auto pr-1">
                    {spots.map((spot) => {
                      const isCurrent = selectedSpot.id === spot.id;
                      return (
                        <div
                          key={spot.id}
                          onClick={() => setSelectedSpot(spot)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isCurrent
                              ? 'border-blue-500 bg-blue-50/50 shadow-xs ring-1 ring-blue-400'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                              <img
                                src={spot.imageUrl}
                                alt={spot.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-900 truncate">
                                {spot.name}
                              </div>
                              <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                {spot.address}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800">
                              ★ {spot.rating}
                            </span>
                            <div className="text-[10px] text-emerald-700 font-semibold mt-1">
                              {spot.drivePhotosCount} ảnh Drive
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: TƯ LIỆU ẢNH DRIVE & GẮN THẺ AI VISION              */}
        {/* ========================================================= */}
        {activeTab === 'drive_assets' && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900">
                  Thư Mục Ảnh Google Drive: /TripC-Da-Nang-Real-Photos
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bạn tự chụp và tải ảnh lên Google Drive. Gemini Vision tự động phân tích cảnh quan, nhận diện không gian và gán từ khóa SEO trước khi xuất bản lên Google Maps.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddAssetModal(true)}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm"
                >
                  ➕ Thêm Ảnh Mới
                </button>
                <button
                  onClick={handleSyncDrive}
                  disabled={isSyncingDrive}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-sm"
                >
                  {isSyncingDrive ? 'Đang quét...' : 'Quét Thư Mục Drive'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col"
                >
                  <div className="relative h-44 bg-slate-100">
                    <img
                      src={asset.file_url}
                      alt={asset.file_name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          asset.status === 'published'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-amber-500 text-white'
                        }`}
                      >
                        {asset.status === 'published' ? 'Đã Xuất Bản' : 'Sẵn Sàng Đăng'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="font-bold text-sm text-slate-900">{asset.dish_name}</div>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                        {asset.flavor_notes}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {asset.vision_tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handlePublishFromAsset(asset.id)}
                      disabled={isPublishingAsset === asset.id}
                      className="w-full py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-95 transition-opacity shadow-sm flex items-center justify-center gap-1.5"
                    >
                      {isPublishingAsset === asset.id ? (
                        'Đang cập nhật lên Google Maps...'
                      ) : (
                        <>
                          <span>🚀</span> Xuất Bản Lên Google Maps Ngay
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: BÀI CẬP NHẬT GOOGLE MAPS (LOCAL POSTS)             */}
        {/* ========================================================= */}
        {activeTab === 'local_posts' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <h4 className="font-bold text-sm text-slate-900">Bài Đăng Tin Tức & Khuyến Mãi Local Posts</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tự động hiển thị nổi bật trên Google Search và Google Maps khi du khách tìm kiếm địa điểm tại Đà Nẵng.
                </p>
              </div>
              <button
                onClick={() => setShowNewPostModal(true)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-sm"
              >
                ✍️ Tạo Bài Viết Mới
              </button>
            </div>

            {localPosts.map((post) => (
              <div key={post.id} className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                      Google Maps Local Post
                    </span>
                    <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-line">
                      {post.content}
                    </p>
                    <div className="text-[11px] text-slate-400">
                      Đăng lúc: {new Date(post.created_at).toLocaleString('vi-VN')}
                    </div>
                  </div>

                  {post.metadata?.image_url && (
                    <div className="w-24 h-24 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                      <img
                        src={post.metadata.image_url}
                        alt="Post media"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: ĐÁNH GIÁ DU KHÁCH (REVIEWS AUTO-REPLY)              */}
        {/* ========================================================= */}
        {activeTab === 'reviews' && (
          <div className="space-y-4">
            {reviews.map((item) => (
              <div key={item.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                      {item.author_name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900">{item.author_name}</div>
                      <div className="text-amber-500 text-xs font-bold">
                        {'★'.repeat(item.rating)}
                        <span className="text-slate-400 font-normal ml-1">({item.rating}/5)</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {new Date(item.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                <p className="text-xs text-slate-700 mt-2.5 bg-white p-3 rounded-lg border border-slate-200">
                  &ldquo;{item.content}&rdquo;
                </p>

                {item.reply_text ? (
                  <div className="mt-3 p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-900">
                    <div className="font-bold flex items-center gap-1.5 text-blue-800 mb-1">
                      <span>🤖</span> Phản hồi chính thức của Quán (Đã xuất bản lên Maps):
                    </div>
                    {item.reply_text}
                  </div>
                ) : (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => handleReplyReview(item.id)}
                      disabled={isReplying === item.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isReplying === item.id ? 'AI Đang Trả Lời...' : 'AI Trả Lời Ngay (100% Rate)'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Tải lên ảnh địa điểm mới vào Drive */}
      {showAddAssetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>📸</span> Tải Lên Ảnh Địa Điểm Mới Vào Thư Mục Google Drive
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Bạn trực tiếp cung cấp ảnh chụp thực tế và ghi chú thông tin về địa điểm trên Google Maps. AI sẽ dùng Gemini Vision để phân tích và hỗ trợ xuất bản lên Google Maps.
            </p>

            <form onSubmit={handleAddAsset} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  1. Tên Địa Điểm Trên Google Maps:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Chùa Linh Ứng Bán Đảo Sơn Trà, Bãi Rạng, Biển Mỹ Khê..."
                  value={newSpotName}
                  onChange={(e) => setNewSpotName(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  2. Thông Tin Thực Tế Về Địa Điểm (Ghi chú của bạn):
                </label>
                <textarea
                  rows={3}
                  placeholder="Ví dụ: Thời tiết hôm nay trời trong xanh, chùa mở cửa đón khách từ 6h sáng, có bãi đỗ xe rộng rãi, view nhìn trọn vẹn vịnh biển Đà Nẵng..."
                  value={newSpotNotes}
                  onChange={(e) => setNewSpotNotes(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  3. Đường Dẫn / URL Ảnh Chụp Thực Tế:
                </label>
                <input
                  type="url"
                  required
                  value={newFileUrl}
                  onChange={(e) => setNewFileUrl(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddAssetModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isAddingAsset}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isAddingAsset ? 'Đang phân tích Gemini Vision...' : 'Tải Lên Drive & Ghim Lên Maps'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Đăng bài viết Local Post mới */}
      {showNewPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>✍️</span> Tạo Bài Viết Cập Nhật Local Post Trên Google Maps
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Bài viết sẽ xuất hiện trực tiếp trong hồ sơ Google Business Profile của bạn.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nội Dung Bài Đăng:</label>
                <textarea
                  rows={4}
                  placeholder="Nhập nội dung chia sẻ trải nghiệm, kinh nghiệm du lịch hoặc ưu đãi..."
                  value={customPostContent}
                  onChange={(e) => setCustomPostContent(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowNewPostModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  onClick={handleCreateCustomPost}
                  disabled={isPosting || !customPostContent.trim()}
                  className="px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isPosting ? 'Đang đăng...' : 'Đăng Lên Google Maps'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
