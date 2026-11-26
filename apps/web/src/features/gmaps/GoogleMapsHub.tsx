'use client';

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';

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
    asset_id?: string;
    spot_name?: string;
    folder_name?: string;
    drive_file_id?: string;
    file_name?: string;
    maps_query?: string;
    google_maps_url?: string;
    seo_tags?: string[];
    auto_published?: boolean;
    real_bot_posted?: boolean;
    real_posted_at?: string;
    real_place_url?: string;
    contributions_url?: string;
    written_by_agent?: string;
    source_artifact_id?: string | null;
    source_artifact_title?: string | null;
  };
}

interface DriveAsset {
  id: string;
  file_name: string;
  file_url: string;
  drive_file_id?: string;
  folder_name?: string;
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
  const [isClearingMock, setIsClearingMock] = useState(false);
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [driveSyncNotice, setDriveSyncNotice] = useState<string | null>(null);
  const [selectedDriveFolder, setSelectedDriveFolder] = useState<string>('ALL');
  const [driveSearchQuery, setDriveSearchQuery] = useState<string>('');
  const [drivePageSize, setDrivePageSize] = useState<number>(6);
  const [folderPages, setFolderPages] = useState<Record<string, number>>({});
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
  const [previewPost, setPreviewPost] = useState<GMapsItem | null>(null);
  const [gmapsBotStatus, setGmapsBotStatus] = useState<{
    isLoggedIn: boolean;
    detail: string;
  }>({
    isLoggedIn: false,
    detail: 'Đang kiểm tra trạng thái trình duyệt Google Maps Bot...',
  });
  const [isRunningBotLogin, setIsRunningBotLogin] = useState(false);
  const [runningBotAssetId, setRunningBotAssetId] = useState<string | null>(null);
  const [botActionNotice, setBotActionNotice] = useState<string | null>(null);
  const [botNeedsLoginPrompt, setBotNeedsLoginPrompt] = useState(false);
  const [copiedLoginCmd, setCopiedLoginCmd] = useState(false);
  const [agentArtifacts, setAgentArtifacts] = useState<
    Array<{ id: string; role: string; operation: string; title: string; excerpt: string; created_at: string }>
  >([]);
  const [selectedAgentArtifactId, setSelectedAgentArtifactId] = useState<string>('');
  const [selectedAgentDriveAssetId, setSelectedAgentDriveAssetId] = useState<string>('');
  const [isCreatingFromAgent, setIsCreatingFromAgent] = useState(false);
  const [rewritingPostId, setRewritingPostId] = useState<string | null>(null);
  const [postStatusFilter, setPostStatusFilter] = useState<'all' | 'pending' | 'published'>('all');
  const [localPostsPageSize, setLocalPostsPageSize] = useState<number>(6);
  const [pendingPostsPage, setPendingPostsPage] = useState<number>(1);
  const [publishedPostsPage, setPublishedPostsPage] = useState<number>(1);

  const GMAPS_LOGIN_CMD =
    'cd "F:\\luu vao day di\\Thuc_Tap\\AI_GROWTH_OS\\apps\\worker"; npm run gmaps-bot:login';

  const handleCopyLoginCommand = () => {
    navigator.clipboard?.writeText(GMAPS_LOGIN_CMD).catch(() => {});
    setCopiedLoginCmd(true);
    setTimeout(() => setCopiedLoginCmd(false), 3000);
  };

  const handleCreateFromExistingAgent = async () => {
    if (!selectedAgentArtifactId) return;
    setIsCreatingFromAgent(true);
    setBotActionNotice('Đang lấy bài gốc từ Agent hệ thống (SEO / Content / Research) để biên tập thành bài Google Maps...');
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/gmaps/reputation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_from_agent_artifact',
          source_artifact_id: selectedAgentArtifactId,
          asset_id: selectedAgentDriveAssetId || undefined,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setBotActionNotice('Đã tạo bài Google Maps mới từ bài viết gốc của Agent hệ thống.');
        await loadData();
      } else {
        setBotActionNotice(json.error || 'Không thể tạo bài từ Agent có sẵn.');
      }
    } catch {
      setBotActionNotice('Lỗi kết nối khi tạo bài từ Agent có sẵn.');
    } finally {
      setIsCreatingFromAgent(false);
    }
  };

  const handleRewriteWithExistingAgent = async (params: {
    postId?: string;
    rewriteAllTemplates?: boolean;
  }) => {
    const key = params.postId || 'all_templates';
    setRewritingPostId(key);
    setBotActionNotice(
      params.rewriteAllTemplates
        ? 'Các Agent có sẵn đang viết lại toàn bộ các bài cũ thành văn phong đánh giá Google Maps tự nhiên (không dùng template cứng)...'
        : 'Agent có sẵn đang viết lại bài đánh giá theo đúng chủ đề tư liệu gốc...'
    );
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/gmaps/reputation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rewrite_with_agent',
          post_id: params.postId,
          rewrite_all_templates: Boolean(params.rewriteAllTemplates),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setBotActionNotice(
          `Đã viết lại thành công ${json.updated_count ?? 1} bài bằng các Agent có sẵn trong hệ thống.`
        );
        await loadData();
      } else {
        setBotActionNotice(json.error || 'Không thể viết lại bài.');
      }
    } catch {
      setBotActionNotice('Lỗi khi gọi Agent viết lại bài.');
    } finally {
      setRewritingPostId(null);
    }
  };

  const handleOpenMapsInCurrentChrome = (spotName?: string, reviewText?: string) => {
    const query = (spotName || selectedSpot.name || 'Sun World Ba Na Hills, Đà Nẵng')
      .replace(/^\[[^\]]+\]\s*/, '')
      .trim();
    const content =
      reviewText ||
      localPosts[0]?.content ||
      `Trải nghiệm tuyệt vời tại ${query}! Không gian đẹp và dịch vụ chu đáo.`;
    navigator.clipboard?.writeText(content).catch(() => {});
    setBotActionNotice(
      `Đã copy sẵn bài đánh giá vào Clipboard và đang mở Google Maps "${query}" trên tab Chrome hiện tại — bạn chỉ cần bấm tab "Bài đánh giá" -> "Viết bài đánh giá" -> chọn 5 sao -> Ctrl+V là đăng ngay.`
    );
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&hl=vi`,
      '_blank',
      'noopener,noreferrer'
    );
  };

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

  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      // Load bot status in background so spawning tsx never blocks items/assets/agentArtifacts
      fetch(`${API_BASE_URL}/workspaces/${workspaceId}/gmaps/bot`)
        .then((r) => r.json())
        .then((botJson) => {
          if (botJson) {
            setGmapsBotStatus({
              isLoggedIn: Boolean(botJson.isLoggedIn),
              detail: botJson.detail || '',
            });
          }
        })
        .catch(() => {});

      const [gmapsRes, driveRes] = await Promise.all([
        fetch(`${API_BASE_URL}/workspaces/${workspaceId}/gmaps/reputation`),
        fetch(`${API_BASE_URL}/workspaces/${workspaceId}/assets/drive/queue`),
      ]);

      const gmapsJson = await gmapsRes.json();
      if (gmapsJson.ok) {
        if (gmapsJson.overview) setOverview(gmapsJson.overview);
        if (Array.isArray(gmapsJson.items)) setItems(gmapsJson.items);
        if (Array.isArray(gmapsJson.agent_artifacts)) {
          setAgentArtifacts(gmapsJson.agent_artifacts);
          if (!selectedAgentArtifactId && gmapsJson.agent_artifacts.length > 0) {
            setSelectedAgentArtifactId(gmapsJson.agent_artifacts[0].id);
          }
        }
      }

      const driveJson = await driveRes.json();
      if (driveJson.ok) {
        if (Array.isArray(driveJson.assets)) setAssets(driveJson.assets);
        if (typeof driveJson.folder_url === 'string' && driveJson.folder_url) {
          setDriveFolderUrl(driveJson.folder_url);
        }
      }
    } catch {
      // Fallback in-memory
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const handleBotLogin = async () => {
    setIsRunningBotLogin(true);
    setBotNeedsLoginPrompt(false);
    setBotActionNotice(
      'Đang mở cửa sổ Microsoft Edge để đăng nhập tài khoản Google (1 lần duy nhất). Nếu không thấy ngay, hãy nhìn biểu tượng Edge nhấp nháy trên thanh Taskbar Windows.'
    );
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/gmaps/bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login' }),
      });
      const json = await res.json();
      setGmapsBotStatus({
        isLoggedIn: Boolean(json.isLoggedIn),
        detail: json.detail || '',
      });
      setBotNeedsLoginPrompt(!json.isLoggedIn);
      setBotActionNotice(json.detail || json.error || 'Đã hoàn tất phiên trình duyệt Google Maps Bot.');
    } catch {
      setBotActionNotice('Không thể kết nối Google Maps Bot.');
    } finally {
      setIsRunningBotLogin(false);
    }
  };

  const handleRunRealGoogleMapsReviewBot = async (params: {
    assetId?: string;
    postId?: string;
    spotName?: string;
  }) => {
    const key = params.assetId || params.postId || 'bot_run';
    setRunningBotAssetId(key);
    setBotNeedsLoginPrompt(false);
    setBotActionNotice(
      `Bot đang xử lý đăng bài đánh giá Google Maps (${params.spotName || 'Địa điểm'})...`
    );
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/gmaps/bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'post-review',
          asset_id: params.assetId,
          post_id: params.postId,
          spot_name: params.spotName,
        }),
      });
      const json = await res.json();
      if (json.needsLogin) {
        setBotNeedsLoginPrompt(true);
        setGmapsBotStatus((prev) => ({ ...prev, isLoggedIn: false }));
      }
      if (json.updated_post && previewPost) {
        if (previewPost.id === json.updated_post.id || previewPost.metadata?.asset_id === params.assetId) {
          setPreviewPost((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'replied',
                  metadata: {
                    ...prev.metadata,
                    ...(json.updated_post.metadata || {}),
                    real_bot_posted: true,
                    published_to_maps: true,
                  },
                }
              : null
          );
        }
      }
      setBotActionNotice(
        json.detail ||
          json.error ||
          (json.submitted
            ? `Đã chạy Bot đăng bài đánh giá thực tế lên Google Maps cho "${params.spotName || 'Địa điểm'}".`
            : 'Bot chưa thể đăng bài lên Google Maps — vui lòng kiểm tra đăng nhập Google ở Bước 1.')
      );
      await loadData();
    } catch {
      setBotActionNotice('Lỗi khi gọi Bot đăng đánh giá Google Maps.');
    } finally {
      setRunningBotAssetId(null);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'drive_assets' || tabParam === 'local_posts' || tabParam === 'reviews' || tabParam === 'map') {
        setActiveTab(tabParam);
      }
    }
    loadData();
    const pollTimer = setInterval(() => {
      loadData(true);
    }, 20_000);
    return () => clearInterval(pollTimer);
  }, [workspaceId]);

  const handleReplyReview = async (reviewId: string) => {
    setIsReplying(reviewId);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/gmaps/reviews/reply`, {
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
    setDriveSyncNotice(null);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/assets/drive/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_url: driveFolderUrl.trim() }),
      });
      const json = await res.json();
      if (json.ok) {
        if (Array.isArray(json.queued_assets)) {
          setAssets(json.queued_assets);
        }
        setSelectedDriveFolder('ALL');
        setFolderPages({});
        if (json.message) {
          setDriveSyncNotice(json.message);
        }
      }
    } catch {
      // Handled silently
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const handleClearMockDrive = async () => {
    setIsClearingMock(true);
    setDriveSyncNotice(null);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/assets/drive/queue`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.ok) {
        setAssets(Array.isArray(json.assets) ? json.assets : []);
        setDriveSyncNotice(`Đã xóa ${json.deleted_count ?? 0} ảnh mẫu (Mock Unsplash). Bạn hãy dán link Thư mục hoặc File Google Drive thật vào ô bên trên rồi bấm "Quét Thư Mục Drive".`);
      }
    } catch {
      // Handled silently
    } finally {
      setIsClearingMock(false);
    }
  };

  const handlePublishFromAsset = async (assetId: string) => {
    setIsPublishingAsset(assetId);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/gmaps/posts`, {
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
          setPreviewPost(json.post);
        }
      }
    } catch {
      // Handled silently
    } finally {
      setIsPublishingAsset(null);
    }
  };

  const getGoogleMapsUrlForSpot = (spotTitle?: string, folderName?: string) => {
    const clean = (spotTitle || 'TripC Đà Nẵng')
      .replace(/^\[[^\]]+\]\s*/, '')
      .split('—')[0]
      .trim();
    const q = `${clean}, ${folderName || 'Đà Nẵng'}, Việt Nam`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  };

  const openPublishedPostForAsset = (asset: DriveAsset) => {
    const found = items.find(
      (i) =>
        i.item_type === 'local_post' &&
        (i.metadata?.asset_id === asset.id ||
          i.metadata?.image_url === asset.file_url ||
          i.metadata?.spot_name === asset.dish_name)
    );
    if (found) {
      setPreviewPost(found);
      return;
    }
    const cleanNotes = (asset.flavor_notes || '').replace(/\s*\(File gốc Google Drive:[^)]+\)\.?/i, '').trim();
    const folderName = asset.folder_name || 'Đà Nẵng';
    const cleanLocation = (asset.dish_name || asset.file_name)
      .replace(/^\[[^\]]+\]\s*/, '')
      .split('—')[0]
      .trim();
    const mapsQuery = `${cleanLocation}, ${folderName}, Việt Nam`;
    const isAssetAlreadyPosted = asset.status === 'published';
    setPreviewPost({
      id: `preview_${asset.id}`,
      item_type: 'local_post',
      author_name: 'TripC — Google Business Profile',
      rating: 5,
      content:
        `[CẬP NHẬT ĐIỂM ĐẾN GOOGLE MAPS]: ${asset.dish_name || asset.file_name}\n\n` +
        `${cleanNotes}\n\n` +
        `Tư liệu hình ảnh thực tế được đồng bộ trực tiếp từ kho Google Drive (Mục: ${folderName}).\n\n` +
        `${asset.vision_tags.map((t) => `#${t.replace(/^Thư mục:\s*/i, '').replace(/\s+/g, '')}`).join(' ')} #TripC #GoogleMapsLocalSEO`,
      status: isAssetAlreadyPosted ? 'replied' : 'pending',
      created_at: new Date().toISOString(),
      metadata: {
        image_url: asset.file_url,
        published_to_maps: isAssetAlreadyPosted,
        real_bot_posted: isAssetAlreadyPosted,
        asset_id: asset.id,
        spot_name: asset.dish_name || asset.file_name,
        folder_name: folderName,
        drive_file_id: asset.drive_file_id,
        maps_query: mapsQuery,
        google_maps_url: getGoogleMapsUrlForSpot(asset.dish_name, folderName),
        seo_tags: asset.vision_tags,
      },
    });
  };

  const focusMapOnPost = (post: GMapsItem) => {
    const spotTitle = post.metadata?.spot_name || 'Điểm đến Google Maps';
    const cleanName = spotTitle.replace(/^\[[^\]]+\]\s*/, '').split('—')[0].trim();
    const folder = post.metadata?.folder_name || 'Đà Nẵng';
    const query = post.metadata?.maps_query || `${cleanName}, ${folder}, Việt Nam`;
    const existing = spots.find((s) => s.name.toLowerCase().includes(cleanName.toLowerCase()));
    if (existing) {
      setSelectedSpot(existing);
    } else {
      const newSpot: MapSpot = {
        id: `spot-post-${post.id}`,
        name: cleanName,
        category: `Điểm Đã Xuất Bản (${folder})`,
        address: `${cleanName}, ${folder}, Việt Nam`,
        query,
        lat: 16.0544,
        lng: 108.2022,
        rating: 5.0,
        reviewsCount: 18,
        highlight: post.content,
        imageUrl: post.metadata?.image_url || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
        drivePhotosCount: 1,
        seoKeywords: post.metadata?.seo_tags || [cleanName, folder],
        status: 'verified',
      };
      setSpots((prev) => [newSpot, ...prev]);
      setSelectedSpot(newSpot);
    }
    setPreviewPost(null);
    setActiveTab('map');
  };

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingAsset(true);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/assets/drive/sync`, {
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
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/gmaps/posts`, {
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

  const isPostPublished = (post?: GMapsItem | null): boolean =>
    Boolean(post?.metadata?.real_bot_posted);

  const publishedLocalPosts = localPosts.filter((p) => isPostPublished(p));
  const pendingLocalPosts = localPosts.filter((p) => !isPostPublished(p));
  const nextPendingPost = pendingLocalPosts[0] || null;

  const getMatchedPostForAsset = (asset: DriveAsset): GMapsItem | undefined =>
    localPosts.find(
      (lp) =>
        lp.metadata?.asset_id === asset.id ||
        (asset.drive_file_id && lp.metadata?.drive_file_id === asset.drive_file_id)
    );

  const isAssetPublished = (asset: DriveAsset): boolean => {
    const matched = getMatchedPostForAsset(asset);
    return matched ? isPostPublished(matched) : asset.status === 'published';
  };

  const renderLocalPostCard = (post: GMapsItem) => {
    const spotTitle = post.metadata?.spot_name || 'Bài cập nhật điểm đến Google Maps';
    const folderLabel = post.metadata?.folder_name;
    const externalMapsUrl =
      post.metadata?.real_place_url ||
      post.metadata?.google_maps_url ||
      getGoogleMapsUrlForSpot(spotTitle, folderLabel);
    const isPublished = isPostPublished(post);

    return (
      <div
        key={post.id}
        className="rounded-xl border border-slate-200 bg-white overflow-hidden transition-colors hover:border-blue-400 flex flex-col"
      >
        {post.metadata?.image_url && (
          <div
            onClick={() => setPreviewPost(post)}
            className="relative h-44 bg-slate-100 cursor-pointer group border-b border-slate-100"
          >
            <img
              src={post.metadata.image_url}
              alt={spotTitle}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1">
              {folderLabel && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white/95 text-slate-800 border border-slate-200">
                  Mục: {folderLabel}
                </span>
              )}
            </div>
            <div className="absolute top-2 right-2">
              {isPublished ? (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                  Đã đăng lên Google Maps
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-800">
                  Chưa đăng (Chờ Bot)
                </span>
              )}
            </div>
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="px-2.5 py-1 rounded-md bg-white text-slate-900 text-xs font-semibold">
                Xem chi tiết &amp; Bản đồ
              </span>
            </div>
          </div>
        )}

        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {!post.metadata?.image_url && (
                <span
                  className={`px-2 py-0.5 rounded-md font-semibold ${
                    isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {isPublished ? 'Đã đăng lên Google Maps' : 'Chưa đăng (Chờ Bot)'}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-md font-medium bg-slate-100 text-slate-700">
                5 sao &amp; Local Post
              </span>
              {post.metadata?.written_by_agent && (
                <span className="px-2 py-0.5 rounded-md font-medium bg-slate-100 text-slate-700">
                  {post.metadata.written_by_agent}
                </span>
              )}
              <span className="text-slate-500">
                ·{' '}
                {isPublished && post.metadata?.real_posted_at
                  ? `Đăng: ${new Date(post.metadata.real_posted_at).toLocaleString('vi-VN')}`
                  : `Soạn: ${new Date(post.created_at).toLocaleString('vi-VN')}`}
              </span>
            </div>

            <h5 className="font-semibold text-sm text-slate-900 line-clamp-2">{spotTitle}</h5>

            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line line-clamp-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
              {post.content}
            </p>
          </div>

          {/* Thanh nút hành động theo đúng trạng thái Đã đăng / Chưa đăng */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            {!isPublished ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    handleRunRealGoogleMapsReviewBot({
                      postId: post.id,
                      assetId: post.metadata?.asset_id,
                      spotName: spotTitle,
                    })
                  }
                  disabled={runningBotAssetId === post.id}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {runningBotAssetId === post.id
                    ? 'Bot đang mở Google Maps & đăng Đánh giá...'
                    : 'Đăng thật lên Đánh giá Google Maps (5 sao + Ảnh)'}
                </button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRewriteWithExistingAgent({ postId: post.id })}
                    disabled={rewritingPostId === post.id}
                    className="py-1.5 px-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-center"
                  >
                    {rewritingPostId === post.id ? 'Đang viết lại...' : 'Viết lại bằng Agent'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPost(post)}
                    className="py-1.5 px-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-center"
                  >
                    Xem nháp &amp; Bản đồ
                  </button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <a
                  href="https://www.google.com/maps/contrib/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-1.5 px-2 rounded-lg text-xs font-semibold border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-center"
                >
                  Xem bài trên Maps
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewPost(post)}
                  className="py-1.5 px-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-center"
                >
                  Chi tiết &amp; Bản đồ
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => focusMapOnPost(post)}
                className="py-1.5 px-2 rounded-lg text-[11px] font-semibold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 text-center"
              >
                Ghim lên bản đồ
              </button>
              <a
                href={externalMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-1.5 px-2 rounded-lg text-[11px] font-semibold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 text-center"
              >
                Mở điểm Google Maps
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const embedMapUrl = `https://maps.google.com/maps?q=${encodeURIComponent(
    selectedSpot.query
  )}&t=${mapType === 'satellite' ? 'k' : 'm'}&z=${zoom}&ie=UTF8&iwloc=&output=embed`;

  const officialGoogleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    selectedSpot.query
  )}`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header theo đúng Template Điều khiển tự động (Ảnh 1) */}
      <div className="p-5 border-b border-slate-200">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h2 className="font-bold text-slate-900">
              Agent 5: Google Maps Specialist (Bản đồ vị trí &amp; Tối ưu Local SEO)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Đánh giá trung bình: {overview.average_rating} sao · Tỷ lệ phản hồi: {overview.response_rate_percent}% · Vị trí bản đồ: Top #{overview.local_pack_rank}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Tích hợp bản đồ Google Maps tương tác trực tiếp. Tải ảnh và thông tin địa điểm lên Google Drive; AI Agent tự động gắn thẻ Gemini Vision, tối ưu thứ hạng Local Pack và xuất bản bài cập nhật lên Google Maps.
            </p>
          </div>
          <span className="self-start rounded-md bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Tự động 24/7 đã bật
          </span>
        </div>

        {/* Khung Điều khiển Bot Google Maps theo đúng hộp xanh nhạt của Ảnh 1 */}
        <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900 text-sm">
              Quy trình tự động đăng thật lên mục Đánh giá Google Maps
            </h3>
            <span
              className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${
                gmapsBotStatus.isLoggedIn
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {gmapsBotStatus.isLoggedIn
                ? 'Đã kết nối phiên Google Maps Bot'
                : 'Chưa đăng nhập tài khoản Google cho Bot'}
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Bước 1: Đăng nhập Google 1 lần trên trình duyệt → Bước 2: Chạy Bot tự động đánh giá 5 sao kèm ảnh từ Google Drive → Bước 3: Kiểm tra toàn bộ đánh giá thật tại trang đóng góp Google Maps (google.com/maps/contrib).
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleBotLogin}
              disabled={isRunningBotLogin}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {isRunningBotLogin
                ? 'Đang mở Edge đăng nhập Google...'
                : 'Bước 1: Mở Edge đăng nhập Google (1 lần)'}
            </button>

            {nextPendingPost ? (
              <button
                type="button"
                onClick={() =>
                  handleRunRealGoogleMapsReviewBot({
                    postId: nextPendingPost.id,
                    assetId: nextPendingPost.metadata?.asset_id,
                    spotName: nextPendingPost.metadata?.spot_name || selectedSpot.name,
                  })
                }
                disabled={Boolean(runningBotAssetId)}
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {runningBotAssetId
                  ? 'Bot đang đăng lên Google Maps...'
                  : `Bước 2: Đăng bài chờ tiếp theo (${pendingLocalPosts.length} bài chưa đăng)`}
              </button>
            ) : (
              <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800">
                Bước 2: Đã đăng hết toàn bộ bài trong hàng chờ ({publishedLocalPosts.length} bài)
              </span>
            )}

            <a
              href="https://www.google.com/maps/contrib/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Bước 3: Xem bài đã đăng trên Google Maps
            </a>

            <button
              type="button"
              onClick={() =>
                handleOpenMapsInCurrentChrome(
                  (nextPendingPost || localPosts[0])?.metadata?.spot_name || selectedSpot.name,
                  (nextPendingPost || localPosts[0])?.content
                )
              }
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Mở Maps trên Chrome này &amp; Copy bài
            </button>
          </div>

          {!gmapsBotStatus.isLoggedIn && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
              <div className="font-semibold">
                Nếu bấm Bước 1 không thấy cửa sổ Edge bật lên màn hình:
              </div>
              <p className="text-amber-800 leading-relaxed">
                Do Backend API đang chạy trong phiên terminal tách biệt, cửa sổ Edge có thể bị ẩn khỏi màn hình chính. Hãy mở PowerShell hoặc Terminal trên Windows, dán lệnh dưới đây để mở Edge đăng nhập Google 1 lần duy nhất — sau khi lưu cookie <code>.gmaps-session.json</code>, Bước 2 sẽ tự động đăng hoàn toàn:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 min-w-[260px] px-2.5 py-1.5 rounded-lg bg-white border border-amber-200 text-[11px] text-slate-800 select-all">
                  {GMAPS_LOGIN_CMD}
                </code>
                <button
                  type="button"
                  onClick={handleCopyLoginCommand}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 bg-white text-amber-900 hover:bg-amber-100 shrink-0"
                >
                  {copiedLoginCmd ? 'Đã copy lệnh' : 'Copy lệnh PowerShell'}
                </button>
              </div>
            </div>
          )}

          {botActionNotice && (
            <div className="rounded-lg border border-blue-200 bg-white p-3 text-xs font-medium text-slate-800">
              {botActionNotice}
            </div>
          )}
        </div>

        {/* Từ khóa Local SEO & Mở bản đồ */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Từ khóa Local SEO lồng ghép tự động:</span>
            {overview.top_seo_keywords.map((kw, idx) => (
              <span
                key={idx}
                className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                {kw}
              </span>
            ))}
          </div>

          <a
            href={officialGoogleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Mở vị trí trên Google Maps
          </a>
        </div>
      </div>

      {/* Tabs Header (không icon) */}
      <div className="px-5 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 sm:gap-4">
          <button
            onClick={() => setActiveTab('map')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'map'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Bản đồ trực quan ({spots.length} địa điểm)
          </button>

          <button
            onClick={() => setActiveTab('drive_assets')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'drive_assets'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Tư liệu ảnh Drive ({assets.length})
          </button>

          <button
            onClick={() => setActiveTab('local_posts')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'local_posts'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Bài cập nhật Maps ({localPosts.length})
          </button>

          <button
            onClick={() => setActiveTab('reviews')}
            className={`py-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'reviews'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Đánh giá ({reviews.length})
          </button>
        </div>

        <div className="flex items-center gap-2 py-2">
          <button
            onClick={() => setShowAddAssetModal(true)}
            className="text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-blue-700 text-white hover:bg-blue-800"
          >
            Tải lên ảnh địa điểm mới (Drive Ingestion)
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
                  placeholder="Nhập tên địa điểm hoặc địa chỉ để tìm và ghim lên Google Maps (ví dụ: Bà Nà Hills, Bãi Rạng...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white shrink-0"
                >
                  Tìm &amp; Ghim
                </button>
              </form>

              <div className="flex items-center gap-2 justify-end">
                {/* Switch Chế độ bản đồ */}
                <div className="flex items-center bg-white rounded-lg border border-slate-300 p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setMapType('roadmap')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      mapType === 'roadmap' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bản đồ
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapType('satellite')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      mapType === 'satellite' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Vệ tinh
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
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                >
                  Mở tab mới
                </a>
              </div>
            </div>

            {/* Layout Grid 2 cột: Cột Trái là Bản Đồ Trực Quan, Cột Phải là Thẻ Chi Tiết & Danh Sách Ghim */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* CỘT TRÁI: KHUNG GOOGLE MAPS EMBED LIVE (7/12) */}
              <div className="lg:col-span-7 flex flex-col space-y-3">
                <div className="relative w-full h-[450px] sm:h-[520px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  <iframe
                    title={`Google Maps - ${selectedSpot.name}`}
                    src={embedMapUrl}
                    className="w-full h-full border-0"
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                  />

                  {/* Badge Vị Trí Đang Ghim Trên Bản Đồ */}
                  <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-lg shadow-sm border border-slate-200 max-w-sm pointer-events-auto">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                        Vị trí trực tiếp trên bản đồ
                      </span>
                    </div>
                    <div className="font-bold text-slate-900 text-xs mt-0.5 truncate">{selectedSpot.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {selectedSpot.lat.toFixed(4)}° N, {selectedSpot.lng.toFixed(4)}° E
                    </div>
                  </div>

                  {/* Nút Chuyển nhanh chế độ xem góc rộng */}
                  <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-700 border border-slate-200">
                    Thu phóng: {zoom}x
                  </div>
                </div>

                <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200 text-xs text-slate-700">
                  Bản đồ đang ghim điểm: <strong>{selectedSpot.name}</strong>. Bạn có thể kéo, phóng to hoặc nhấp vào địa điểm khác bên phải để đổi vị trí.
                </div>
              </div>

              {/* CỘT PHẢI: THÔNG TIN ĐỊA ĐIỂM ĐANG CHỌN & DANH SÁCH GHIM (5/12) */}
              <div className="lg:col-span-5 flex flex-col space-y-4">
                {/* Thẻ Chi Tiết Điểm Đang Chọn */}
                <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/60">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                        {selectedSpot.category}
                      </span>
                      <h4 className="font-bold text-base text-slate-900 mt-1.5 leading-snug">
                        {selectedSpot.name}
                      </h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {selectedSpot.address}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-slate-900 font-bold text-xs">
                        {selectedSpot.rating}/5.0 sao
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {selectedSpot.reviewsCount} đánh giá
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 mt-2.5 leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
                    {selectedSpot.highlight}
                  </p>

                  {/* Hành động nhanh cho điểm này */}
                  <div className="mt-3.5 pt-3 border-t border-blue-200/70 space-y-2">
                    {(() => {
                      const cleanSelectedName = selectedSpot.name
                        .replace(/^\[[^\]]+\]\s*/, '')
                        .split('—')[0]
                        .trim()
                        .toLowerCase();
                      const matchingSpotPosts = localPosts.filter((lp) =>
                        (lp.metadata?.spot_name || '').toLowerCase().includes(cleanSelectedName)
                      );
                      const pendingSpotPost = matchingSpotPosts.find((lp) => !isPostPublished(lp));
                      const publishedSpotPost = matchingSpotPosts.find((lp) => isPostPublished(lp));
                      const isSpotAlreadyPublished = Boolean(publishedSpotPost && !pendingSpotPost);

                      if (isSpotAlreadyPublished) {
                        return (
                          <div className="w-full px-3 py-2 text-center text-xs font-semibold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800">
                            Địa điểm này đã đăng đánh giá lên Google Maps
                          </div>
                        );
                      }

                      return (
                        <button
                          type="button"
                          onClick={() =>
                            handleRunRealGoogleMapsReviewBot({
                              postId: pendingSpotPost?.id,
                              assetId: pendingSpotPost?.metadata?.asset_id,
                              spotName: pendingSpotPost?.metadata?.spot_name || selectedSpot.name,
                            })
                          }
                          disabled={Boolean(runningBotAssetId)}
                          className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
                        >
                          {runningBotAssetId
                            ? 'Bot đang đăng lên Google Maps...'
                            : 'Đăng thật lên Đánh giá Google Maps (5 sao + Ảnh)'}
                        </button>
                      );
                    })()}
                    <a
                      href="https://www.google.com/maps/contrib/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full px-3 py-1.5 text-center text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      Xem đánh giá đã đăng (maps/contrib)
                    </a>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => openDriveUploadForSpot(selectedSpot)}
                        className="px-2.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      >
                        Tải ảnh Drive cho điểm này
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCustomPostContent(
                            `Check-in tuyệt đẹp tại ${selectedSpot.name} cùng TripC! ${selectedSpot.highlight}`
                          );
                          setShowNewPostModal(true);
                        }}
                        className="px-2.5 py-2 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800"
                      >
                        Đăng bài Local Post
                      </button>
                    </div>
                  </div>
                </div>

                {/* Danh sách các địa điểm đã ghim trên Google Maps */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-bold text-xs text-slate-700">
                      Danh sách địa điểm đã ghim ({spots.length})
                    </h5>
                    <span className="text-[11px] text-slate-500">
                      Nhấp để chọn địa điểm
                    </span>
                  </div>

                  <div className="space-y-2 max-h-[290px] overflow-y-auto pr-1">
                    {spots.map((spot) => {
                      const isCurrent = selectedSpot.id === spot.id;
                      return (
                        <div
                          key={spot.id}
                          onClick={() => setSelectedSpot(spot)}
                          className={`p-3 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                            isCurrent
                              ? 'border-blue-600 bg-blue-50/50'
                              : 'border-slate-200 bg-white hover:border-slate-300'
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
                              <div className="font-semibold text-xs text-slate-900 truncate">
                                {spot.name}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {spot.address}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                              {spot.rating} sao
                            </span>
                            <div className="text-[11px] text-slate-500 mt-1">
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
            <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/60 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-sm text-slate-900">
                      Kết nối kho ảnh Google Drive thật (Agent 2: Drive Asset Ingestion &amp; Gemini Vision)
                    </h4>
                    {assets.some((a) => a.drive_file_id) ? (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">
                        Đang dùng ảnh Google Drive thật ({assets.filter((a) => a.drive_file_id).length} file)
                      </span>
                    ) : assets.length > 0 ? (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-800">
                        Đang hiển thị {assets.length} ảnh mẫu — Chưa nhập link Drive thật
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-200 text-slate-700">
                        Kho trống — Hãy dán link Google Drive bên dưới
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Dán link Thư mục Google Drive (<code>https://drive.google.com/drive/folders/...</code>) hoặc link File ảnh Google Drive (đã bật quyền chia sẻ &ldquo;Bất kỳ ai có đường liên kết đều có thể xem&rdquo;). Agent 2 sẽ tự động quét file thật và phân tích bằng Gemini Vision.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {assets.some((a) => !a.drive_file_id) && (
                    <button
                      type="button"
                      onClick={handleClearMockDrive}
                      disabled={isClearingMock}
                      className="px-3 py-1.5 rounded-lg border border-rose-300 bg-white text-rose-700 text-xs font-semibold hover:bg-rose-50"
                    >
                      {isClearingMock ? 'Đang xóa...' : 'Xóa ảnh mẫu (Mock)'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAddAssetModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                  >
                    Thêm 1 link ảnh Drive
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="url"
                  value={driveFolderUrl}
                  onChange={(e) => setDriveFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/1ABC... hoặc https://drive.google.com/file/d/1XYZ.../view?usp=sharing"
                  className="flex-1 text-xs px-3.5 py-2 rounded-lg border border-slate-300 bg-white font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSyncDrive}
                  disabled={isSyncingDrive}
                  className="shrink-0 px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-60"
                >
                  {isSyncingDrive ? 'Đang quét Google Drive...' : 'Quét thư mục Drive'}
                </button>
                {driveFolderUrl.trim().startsWith('http') && (
                  <a
                    href={driveFolderUrl.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 text-center"
                  >
                    Mở Drive
                  </a>
                )}
              </div>

              {driveSyncNotice && (
                <div className="p-3 rounded-lg bg-white border border-blue-200 text-xs font-medium text-slate-800">
                  {driveSyncNotice}
                </div>
              )}

              {/* Bộ lọc Thư mục con & Tìm kiếm & Chọn số ảnh mỗi trang */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-blue-200/60">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Chia theo mục (Thư mục Drive):</span>
                  <button
                    type="button"
                    onClick={() => setSelectedDriveFolder('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      selectedDriveFolder === 'ALL'
                        ? 'bg-blue-700 text-white'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Tất cả các mục ({assets.length})
                  </button>
                  {Array.from(
                    new Set(assets.map((a) => a.folder_name || 'Thư mục gốc'))
                  )
                    .sort((a, b) => a.localeCompare(b, 'vi'))
                    .map((folderName) => {
                      const count = assets.filter((a) => (a.folder_name || 'Thư mục gốc') === folderName).length;
                      return (
                        <button
                          key={folderName}
                          type="button"
                          onClick={() => {
                            setSelectedDriveFolder(folderName);
                            setFolderPages((prev) => ({ ...prev, [folderName]: 1 }));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            selectedDriveFolder === folderName
                              ? 'bg-blue-700 text-white'
                              : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          Mục: {folderName} ({count})
                        </button>
                      );
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={driveSearchQuery}
                    onChange={(e) => {
                      setDriveSearchQuery(e.target.value);
                      setFolderPages({});
                    }}
                    placeholder="Tìm kiếm ảnh trong mục..."
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
                  />
                  <select
                    aria-label="Số ảnh mỗi trang"
                    value={drivePageSize}
                    onChange={(e) => {
                      setDrivePageSize(Number(e.target.value));
                      setFolderPages({});
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700"
                  >
                    <option value={3}>3 ảnh / trang</option>
                    <option value={6}>6 ảnh / trang</option>
                    <option value={9}>9 ảnh / trang</option>
                    <option value={12}>12 ảnh / trang</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Danh sách chia theo từng Mục (Thư mục con trên Google Drive) kèm Phân trang riêng */}
            {(() => {
              const q = driveSearchQuery.trim().toLowerCase();
              const filteredAssets = assets.filter((a) => {
                if (!q) return true;
                return (
                  (a.dish_name || '').toLowerCase().includes(q) ||
                  (a.file_name || '').toLowerCase().includes(q) ||
                  (a.flavor_notes || '').toLowerCase().includes(q) ||
                  a.vision_tags.some((t) => t.toLowerCase().includes(q))
                );
              });

              const allFolders = Array.from(
                new Set(filteredAssets.map((a) => a.folder_name || 'Thư mục gốc'))
              ).sort((a, b) => a.localeCompare(b, 'vi'));

              const visibleFolders =
                selectedDriveFolder === 'ALL'
                  ? allFolders
                  : allFolders.filter((f) => f === selectedDriveFolder);

              if (visibleFolders.length === 0) {
                return (
                  <div className="p-8 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
                    Không tìm thấy tư liệu ảnh nào phù hợp với bộ lọc hiện tại.
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  {visibleFolders.map((folderName) => {
                    const folderItems = filteredAssets.filter(
                      (a) => (a.folder_name || 'Thư mục gốc') === folderName
                    );
                    const totalItems = folderItems.length;
                    const totalPages = Math.max(1, Math.ceil(totalItems / drivePageSize));
                    const currentPage = Math.min(folderPages[folderName] || 1, totalPages);
                    const startIdx = (currentPage - 1) * drivePageSize;
                    const pageItems = folderItems.slice(startIdx, startIdx + drivePageSize);
                    const publishedCount = folderItems.filter((a) => isAssetPublished(a)).length;
                    const readyCount = totalItems - publishedCount;

                    const setPageForFolder = (page: number) => {
                      const next = Math.max(1, Math.min(totalPages, page));
                      setFolderPages((prev) => ({ ...prev, [folderName]: next }));
                    };

                    return (
                      <section
                        key={folderName}
                        className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                      >
                        {/* Header của từng Mục */}
                        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="px-2.5 py-1 rounded-md bg-blue-100 text-xs font-bold text-blue-800">
                              Mục: {folderName}
                            </span>
                            <span className="text-xs text-slate-600">
                              Tổng: <strong>{totalItems}</strong> ảnh từ Google Drive
                            </span>
                            {readyCount > 0 && (
                              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-800">
                                {readyCount} chưa đăng (chờ Bot)
                              </span>
                            )}
                            {publishedCount > 0 && (
                              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">
                                {publishedCount} đã đăng lên Maps
                              </span>
                            )}
                          </div>

                          {/* Điều khiển Phân trang nhanh trên Header của Mục */}
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-600 mr-1">
                              Hiển thị <strong>{startIdx + 1}–{Math.min(startIdx + drivePageSize, totalItems)}</strong> / {totalItems} (Trang {currentPage}/{totalPages})
                            </span>
                            <button
                              type="button"
                              onClick={() => setPageForFolder(currentPage - 1)}
                              disabled={currentPage <= 1}
                              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                            >
                              Trước
                            </button>
                            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => (
                              <button
                                key={pNum}
                                type="button"
                                onClick={() => setPageForFolder(pNum)}
                                className={`w-7 h-7 rounded-lg font-semibold transition-colors ${
                                  pNum === currentPage
                                    ? 'bg-blue-700 text-white'
                                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {pNum}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setPageForFolder(currentPage + 1)}
                              disabled={currentPage >= totalPages}
                              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                            >
                              Sau
                            </button>
                          </div>
                        </div>

                        {/* Lưới ảnh trong trang hiện tại của Mục */}
                        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {pageItems.map((asset) => {
                            const matchedPost = getMatchedPostForAsset(asset);
                            const isRealBotPosted = isAssetPublished(asset);

                            return (
                              <div
                                key={asset.id}
                                className="rounded-lg border border-slate-200 bg-white overflow-hidden transition-colors hover:border-blue-400 flex flex-col"
                              >
                                <div className="relative h-44 bg-slate-100">
                                  <img
                                    src={asset.file_url}
                                    alt={asset.file_name}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1">
                                    {asset.drive_file_id ? (
                                      <a
                                        href={`https://drive.google.com/file/d/${asset.drive_file_id}/view`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white/95 text-slate-800 border border-slate-200 hover:bg-white"
                                      >
                                        Mục: {folderName}
                                      </a>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-800">
                                        Ảnh mẫu
                                      </span>
                                    )}
                                  </div>
                                  <div className="absolute top-2 right-2">
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                        isRealBotPosted
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {isRealBotPosted
                                        ? 'Đã đăng lên Google Maps'
                                        : 'Chưa đăng (Đã soạn nháp)'}
                                    </span>
                                  </div>
                                </div>

                                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                                  <div>
                                    <div className="font-semibold text-sm text-slate-900">{asset.dish_name}</div>
                                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                                      {asset.flavor_notes}
                                    </p>

                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {asset.vision_tags.map((tag, idx) => (
                                        <span
                                          key={idx}
                                          className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                                    {!isRealBotPosted ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRunRealGoogleMapsReviewBot({
                                              assetId: asset.id,
                                              postId: matchedPost?.id,
                                              spotName: asset.dish_name,
                                            })
                                          }
                                          disabled={runningBotAssetId === asset.id}
                                          className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
                                        >
                                          {runningBotAssetId === asset.id
                                            ? 'Bot đang mở Google Maps & đăng Đánh giá...'
                                            : 'Đăng thật lên Đánh giá Google Maps (5 sao + Ảnh)'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => openPublishedPostForAsset(asset)}
                                          className="w-full py-1.5 px-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-center"
                                        >
                                          Xem bản nháp &amp; Bản đồ
                                        </button>
                                      </>
                                    ) : (
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => openPublishedPostForAsset(asset)}
                                          className="py-1.5 px-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-center"
                                        >
                                          Xem bài &amp; Bản đồ
                                        </button>
                                        <a
                                          href="https://www.google.com/maps/contrib/"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="py-1.5 px-2 rounded-lg text-xs font-semibold border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-center"
                                        >
                                          Xem trên Maps
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Thanh Phân trang dưới chân từng Mục */}
                        {totalPages > 1 && (
                          <div className="px-5 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <span className="text-slate-600 font-medium">
                              Đang xem trang <strong>{currentPage} / {totalPages}</strong> (Ảnh {startIdx + 1}–{Math.min(startIdx + drivePageSize, totalItems)} trong tổng số {totalItems} ảnh của mục <strong>{folderName}</strong>)
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPageForFolder(1)}
                                disabled={currentPage <= 1}
                                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                              >
                                « Đầu
                              </button>
                              <button
                                type="button"
                                onClick={() => setPageForFolder(currentPage - 1)}
                                disabled={currentPage <= 1}
                                className="px-3 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                              >
                                ‹ Trang trước
                              </button>
                              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => (
                                <button
                                  key={pNum}
                                  type="button"
                                  onClick={() => setPageForFolder(pNum)}
                                  className={`w-7 h-7 rounded-lg font-bold transition-colors ${
                                    pNum === currentPage
                                      ? 'bg-blue-600 text-white'
                                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  {pNum}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setPageForFolder(currentPage + 1)}
                                disabled={currentPage >= totalPages}
                                className="px-3 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                              >
                                Trang sau ›
                              </button>
                              <button
                                type="button"
                                onClick={() => setPageForFolder(totalPages)}
                                disabled={currentPage >= totalPages}
                                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                              >
                                Cuối »
                              </button>
                            </div>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: BÀI CẬP NHẬT GOOGLE MAPS (LOCAL POSTS)             */}
        {/* ========================================================= */}
        {activeTab === 'local_posts' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <h4 className="font-semibold text-sm text-slate-900">Bài đăng tin tức &amp; đánh giá Google Maps (Viết bởi các Agent có sẵn)</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chủ đề lấy trực tiếp từ các Agent có sẵn (SEO Worker, Content Marketing, Research) và tư liệu ảnh Google Drive — không tự bịa chủ đề và không dùng mẫu câu cứng.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRewriteWithExistingAgent({ rewriteAllTemplates: true })}
                  disabled={Boolean(rewritingPostId)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                >
                  {rewritingPostId === 'all_templates'
                    ? 'Agent đang viết lại...'
                    : 'Viết lại các bài cũ bằng Agent có sẵn'}
                </button>
                <button
                  onClick={() => setShowNewPostModal(true)}
                  className="px-3.5 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
                >
                  Tạo bài viết mới
                </button>
              </div>
            </div>

            {agentArtifacts.length > 0 && (
              <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/60 space-y-2.5">
                <div className="text-xs font-semibold text-slate-900">
                  Tạo bài Google Maps từ chủ đề &amp; bài viết của các Agent có sẵn ({agentArtifacts.length} bài)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                  <select
                    value={selectedAgentArtifactId}
                    onChange={(e) => setSelectedAgentArtifactId(e.target.value)}
                    className="md:col-span-6 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800"
                  >
                    {agentArtifacts.map((art) => (
                      <option key={art.id} value={art.id}>
                        [{art.role.toUpperCase()} / {art.operation}] {art.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedAgentDriveAssetId}
                    onChange={(e) => setSelectedAgentDriveAssetId(e.target.value)}
                    className="md:col-span-3 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-800"
                  >
                    <option value="">-- Kèm ảnh Drive (tuỳ chọn) --</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.dish_name || a.file_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleCreateFromExistingAgent}
                    disabled={isCreatingFromAgent || !selectedAgentArtifactId}
                    className="md:col-span-3 px-3 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50"
                  >
                    {isCreatingFromAgent ? 'Agent đang biên tập...' : 'Tạo bài từ Agent có sẵn'}
                  </button>
                </div>
              </div>
            )}

            {/* Bộ lọc trạng thái bài đăng: Tất cả / Chưa đăng / Đã đăng + Chọn số bài mỗi trang */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">Trạng thái bài viết:</span>
                <button
                  type="button"
                  onClick={() => {
                    setPostStatusFilter('all');
                    setPendingPostsPage(1);
                    setPublishedPostsPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    postStatusFilter === 'all'
                      ? 'bg-blue-700 text-white'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Tất cả ({localPosts.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPostStatusFilter('pending');
                    setPendingPostsPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    postStatusFilter === 'pending'
                      ? 'bg-blue-700 text-white'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Chưa đăng ({pendingLocalPosts.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPostStatusFilter('published');
                    setPublishedPostsPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    postStatusFilter === 'published'
                      ? 'bg-blue-700 text-white'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Đã đăng ({publishedLocalPosts.length})
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">
                  Hiển thị lưới 3 cột có phân trang · Tự động ẩn nút đăng thật với bài đã đăng
                </span>
                <select
                  aria-label="Số bài mỗi trang"
                  value={localPostsPageSize}
                  onChange={(e) => {
                    setLocalPostsPageSize(Number(e.target.value));
                    setPendingPostsPage(1);
                    setPublishedPostsPage(1);
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700"
                >
                  <option value={3}>3 bài / trang</option>
                  <option value={6}>6 bài / trang</option>
                  <option value={9}>9 bài / trang</option>
                  <option value={12}>12 bài / trang</option>
                </select>
              </div>
            </div>

            {(postStatusFilter === 'all' || postStatusFilter === 'pending') && (() => {
              const totalPendPages = Math.max(1, Math.ceil(pendingLocalPosts.length / localPostsPageSize));
              const currentPendPage = Math.min(Math.max(1, pendingPostsPage), totalPendPages);
              const startIdx = (currentPendPage - 1) * localPostsPageSize;
              const pagedPending = pendingLocalPosts.slice(startIdx, startIdx + localPostsPageSize);

              return (
                <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 text-xs font-bold">
                        Bài chưa đăng — Hàng đợi Agent tự động đăng lên Google Maps ({pendingLocalPosts.length})
                      </span>
                    </div>
                    {pendingLocalPosts.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-600 mr-1">
                          Hiển thị <strong>{startIdx + 1}–{Math.min(startIdx + localPostsPageSize, pendingLocalPosts.length)}</strong> / {pendingLocalPosts.length} (Trang {currentPendPage}/{totalPendPages})
                        </span>
                        <button
                          type="button"
                          onClick={() => setPendingPostsPage(Math.max(1, currentPendPage - 1))}
                          disabled={currentPendPage <= 1}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                        >
                          Trước
                        </button>
                        {Array.from({ length: totalPendPages }, (_, idx) => idx + 1).map((pNum) => (
                          <button
                            key={pNum}
                            type="button"
                            onClick={() => setPendingPostsPage(pNum)}
                            className={`w-7 h-7 rounded-lg font-semibold transition-colors ${
                              pNum === currentPendPage
                                ? 'bg-blue-700 text-white'
                                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {pNum}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setPendingPostsPage(Math.min(totalPendPages, currentPendPage + 1))}
                          disabled={currentPendPage >= totalPendPages}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                        >
                          Sau
                        </button>
                      </div>
                    )}
                  </div>
                  {pendingLocalPosts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Tất cả bài viết trong hàng chờ đều đã được đăng lên Google Maps.
                    </div>
                  ) : (
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {pagedPending.map((post) => renderLocalPostCard(post))}
                    </div>
                  )}
                </section>
              );
            })()}

            {(postStatusFilter === 'all' || postStatusFilter === 'published') && (() => {
              const totalPubPages = Math.max(1, Math.ceil(publishedLocalPosts.length / localPostsPageSize));
              const currentPubPage = Math.min(Math.max(1, publishedPostsPage), totalPubPages);
              const startIdx = (currentPubPage - 1) * localPostsPageSize;
              const pagedPublished = publishedLocalPosts.slice(startIdx, startIdx + localPostsPageSize);

              return (
                <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold">
                        Bài đã đăng lên Google Maps ({publishedLocalPosts.length})
                      </span>
                    </div>
                    {publishedLocalPosts.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-600 mr-1">
                          Hiển thị <strong>{startIdx + 1}–{Math.min(startIdx + localPostsPageSize, publishedLocalPosts.length)}</strong> / {publishedLocalPosts.length} (Trang {currentPubPage}/{totalPubPages})
                        </span>
                        <button
                          type="button"
                          onClick={() => setPublishedPostsPage(Math.max(1, currentPubPage - 1))}
                          disabled={currentPubPage <= 1}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                        >
                          Trước
                        </button>
                        {Array.from({ length: totalPubPages }, (_, idx) => idx + 1).map((pNum) => (
                          <button
                            key={pNum}
                            type="button"
                            onClick={() => setPublishedPostsPage(pNum)}
                            className={`w-7 h-7 rounded-lg font-semibold transition-colors ${
                              pNum === currentPubPage
                                ? 'bg-blue-700 text-white'
                                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {pNum}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setPublishedPostsPage(Math.min(totalPubPages, currentPubPage + 1))}
                          disabled={currentPubPage >= totalPubPages}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                        >
                          Sau
                        </button>
                      </div>
                    )}
                  </div>
                  {publishedLocalPosts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Chưa có bài viết nào được Bot đăng lên Google Maps.
                    </div>
                  ) : (
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {pagedPublished.map((post) => renderLocalPostCard(post))}
                    </div>
                  )}
                </section>
              );
            })()}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: ĐÁNH GIÁ DU KHÁCH & ĐĂNG ĐÁNH GIÁ 5★ LÊN GOOGLE MAPS */}
        {/* ========================================================= */}
        {activeTab === 'reviews' && (
          <div className="space-y-6">
            {/* Phần 1: Các bài Đánh giá 5 sao + Ảnh Google Drive ĐÃ ĐĂNG THẬT lên Google Maps */}
            <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/60 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-sm text-slate-900">
                    Đánh giá 5 sao &amp; Ảnh Google Drive đã đăng lên Google Maps ({publishedLocalPosts.length} đã đăng / {pendingLocalPosts.length} chờ đăng)
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Danh sách dưới đây chỉ hiển thị các bài đánh giá đã được Bot đăng thật lên Google Maps. Để đăng các bài đang chờ ({pendingLocalPosts.length} bài), hãy chuyển sang tab <strong>Bài cập nhật Maps</strong>.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {pendingLocalPosts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('local_posts');
                        setPostStatusFilter('pending');
                      }}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      Mở {pendingLocalPosts.length} bài chờ đăng
                    </button>
                  )}
                  <a
                    href="https://www.google.com/maps/contrib/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-700 text-white hover:bg-blue-800"
                  >
                    Xem bài đã đăng trên Google Maps (maps/contrib)
                  </a>
                </div>
              </div>

              {publishedLocalPosts.length === 0 ? (
                <div className="p-4 rounded-lg border border-slate-200 bg-white text-xs text-slate-600">
                  Hiện chưa có bài đánh giá nào từ Drive được đăng lên Google Maps. Hãy sang tab <strong>Bài cập nhật Maps</strong> để chạy Bot đăng bài.
                </div>
              ) : (
                <div className="space-y-3">
                  {publishedLocalPosts.map((post) => {
                    const spotTitle = post.metadata?.spot_name || 'Điểm đến du lịch Google Maps';
                    return (
                      <div
                        key={`rev_${post.id}`}
                        className="p-4 rounded-lg border border-slate-200 bg-white flex flex-col md:flex-row gap-4 justify-between"
                      >
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-800">
                              5/5 sao
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">
                              Đã đăng thật lên Google Maps
                            </span>
                            <span className="font-semibold text-xs text-slate-900">{spotTitle}</span>
                            {post.metadata?.real_posted_at && (
                              <span className="text-xs text-slate-500">
                                · Đăng lúc: {new Date(post.metadata.real_posted_at).toLocaleString('vi-VN')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-700 whitespace-pre-line line-clamp-3">
                            {post.content}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <a
                              href="https://www.google.com/maps/contrib/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                            >
                              Xem trên Google Maps Contributions
                            </a>
                            <a
                              href={
                                post.metadata?.real_place_url ||
                                post.metadata?.google_maps_url ||
                                getGoogleMapsUrlForSpot(spotTitle, post.metadata?.folder_name)
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            >
                              Mở đúng địa điểm đã đăng trên Maps
                            </a>
                          </div>
                        </div>
                        {post.metadata?.image_url && (
                          <img
                            src={post.metadata.image_url}
                            alt={spotTitle}
                            referrerPolicy="no-referrer"
                            className="w-full md:w-32 h-24 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Phần 2: Đánh giá của du khách & Phản hồi tự động từ AI Agent 5 */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-slate-900">
                Đánh giá từ du khách trên Google Maps &amp; Phản hồi tự động ({reviews.length})
              </h4>
              {reviews.map((item) => (
              <div key={item.id} className="p-4 rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                      {item.author_name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-slate-900">{item.author_name}</div>
                      <div className="text-slate-600 text-xs font-medium">
                        {item.rating}/5 sao
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(item.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                <p className="text-xs text-slate-700 mt-2.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  &ldquo;{item.content}&rdquo;
                </p>

                {item.reply_text ? (
                  <div className="mt-3 p-3 rounded-lg bg-blue-50/60 border border-blue-200 text-xs text-slate-800">
                    <div className="font-semibold text-blue-900 mb-1">
                      Phản hồi tự động từ AI Agent 5 (Chuẩn Local SEO):
                    </div>
                    {item.reply_text}
                  </div>
                ) : (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => handleReplyReview(item.id)}
                      disabled={isReplying === item.id}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      {isReplying === item.id ? 'AI đang trả lời...' : 'AI trả lời ngay'}
                    </button>
                  </div>
                )}
              </div>
            ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Tải lên ảnh địa điểm mới vào Drive */}
      {showAddAssetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              Tải lên ảnh địa điểm mới vào thư mục Google Drive
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Bạn trực tiếp cung cấp ảnh chụp thực tế và ghi chú thông tin về địa điểm trên Google Maps. AI sẽ dùng Gemini Vision để phân tích và hỗ trợ xuất bản lên Google Maps.
            </p>

            <form onSubmit={handleAddAsset} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  1. Tên địa điểm trên Google Maps:
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  2. Thông tin thực tế về địa điểm (Ghi chú của bạn):
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  3. Đường dẫn / URL ảnh chụp thực tế:
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
                  className="px-4 py-2 text-xs font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
                >
                  {isAddingAsset ? 'Đang phân tích Gemini Vision...' : 'Tải lên Drive & Ghim lên Maps'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Đăng bài viết Local Post mới */}
      {showNewPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              Tạo bài viết cập nhật Local Post trên Google Maps
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Bài viết sẽ xuất hiện trực tiếp trong hồ sơ Google Business Profile của bạn.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nội dung bài đăng:</label>
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
                  className="px-4 py-2 text-xs font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
                >
                  {isPosting ? 'Đang đăng...' : 'Đăng lên Google Maps'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Xem Trực Tiếp Bài Viết Đã Xuất Bản Trên Google Maps (Google Business Profile Live Preview) */}
      {previewPost && (() => {
        const spotTitle = previewPost.metadata?.spot_name || 'Điểm đến du lịch TripC';
        const folderStr = previewPost.metadata?.folder_name || 'Đà Nẵng';
        const isPreviewPublished = isPostPublished(previewPost);
        const baseSpot = spotTitle
          .replace(/^\[[^\]]+\]\s*/, '')
          .replace(/\([^)]*\)/g, '')
          .split('—')[0]
          .replace(/\s+/g, ' ')
          .trim();
        const regionStr = folderStr.toLowerCase().includes('bà nà')
          ? 'Bà Nà Hills, Đà Nẵng, Việt Nam'
          : folderStr.toLowerCase().includes('hội an')
          ? 'Phố cổ Hội An, Việt Nam'
          : `${folderStr}, Đà Nẵng, Việt Nam`;
        const cleanQuery = `${baseSpot}, ${regionStr}`;
        const liveEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(cleanQuery)}&t=m&z=15&ie=UTF8&iwloc=&output=embed`;
        const directMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}`;

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-3 sm:p-6 flex items-start sm:items-center justify-center">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[88vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col my-auto">
              {/* Header (Sticky top inside modal) */}
              <div className="shrink-0 px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {isPreviewPublished
                        ? 'Chi tiết bài viết đã đăng trên Google Maps'
                        : 'Xem trước bản nháp Google Maps (Chưa đăng)'}
                    </h3>
                    {isPreviewPublished ? (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">
                        Đã đăng thật lên Google Maps
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-800">
                        Chưa đăng — Chờ Bot đăng
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Địa điểm ghim: <strong>{cleanQuery}</strong> ·{' '}
                    {isPreviewPublished && previewPost.metadata?.real_posted_at
                      ? `Đăng lúc ${new Date(previewPost.metadata.real_posted_at).toLocaleString('vi-VN')}`
                      : `Soạn lúc ${new Date(previewPost.created_at).toLocaleString('vi-VN')}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewPost(null)}
                  className="shrink-0 px-3 py-1 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>

              {/* Scrollable Body Wrapper */}
              <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Cột Trái: Thẻ Google Maps Local Post / Đánh Giá (6/12) */}
                  <div className="lg:col-span-6 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden">
                    <div>
                      <div className="p-3.5 bg-white border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-700 text-white font-bold text-xs flex items-center justify-center">
                            G
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-slate-900">{spotTitle}</div>
                            <div className="text-[11px] text-slate-500">
                              Đánh giá &amp; Cập nhật điểm đến · 5.0 sao
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-100 text-blue-800">
                          Google Maps 5 sao
                        </span>
                      </div>

                      {previewPost.metadata?.image_url && (
                        <div className="h-52 bg-slate-200 overflow-hidden border-b border-slate-200">
                          <img
                            src={previewPost.metadata.image_url}
                            alt={spotTitle}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      <div className="p-4 space-y-3">
                        <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-line">
                          {previewPost.content}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-white border-t border-slate-200 space-y-2">
                      {!isPreviewPublished ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleRunRealGoogleMapsReviewBot({
                              assetId: previewPost.metadata?.asset_id,
                              postId: previewPost.id.startsWith('preview_') ? undefined : previewPost.id,
                              spotName: spotTitle,
                            })
                          }
                          disabled={Boolean(runningBotAssetId)}
                          className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
                        >
                          {runningBotAssetId
                            ? 'Bot đang mở Google Maps & đăng Đánh giá...'
                            : 'Đăng thật lên Đánh giá Google Maps (5 sao + Ảnh Drive)'}
                        </button>
                      ) : (
                        <a
                          href="https://www.google.com/maps/contrib/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full py-2 px-4 rounded-lg text-xs font-semibold border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-center"
                        >
                          Xem bài đã đăng trên Google Maps (maps/contrib)
                        </a>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => focusMapOnPost(previewPost)}
                          className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-center"
                        >
                          Mở bản đồ trực quan
                        </button>
                        <a
                          href={directMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-blue-700 text-white hover:bg-blue-800 text-center"
                        >
                          Xem vị trí trên Google Maps
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Cột Phải: Khung Google Maps Live Embed định vị đúng địa điểm bài viết (6/12) */}
                  <div className="lg:col-span-6 flex flex-col space-y-3">
                    <div className="relative flex-1 min-h-[340px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                      <iframe
                        title={`Google Maps Preview - ${spotTitle}`}
                        src={liveEmbedUrl}
                        className="w-full h-full min-h-[340px] border-0"
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-200 text-xs text-slate-800 flex items-center justify-between gap-2">
                      <span>
                        Vị trí Google Maps đang định vị trực tiếp tại: <strong>{cleanQuery}</strong>
                      </span>
                      {previewPost.metadata?.drive_file_id && (
                        <a
                          href={`https://drive.google.com/file/d/${previewPost.metadata.drive_file_id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 font-semibold text-blue-700 hover:underline"
                        >
                          Ảnh gốc Drive
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Floating Fixed Bot Feedback Banner */}
      {(botActionNotice || isRunningBotLogin || runningBotAssetId) && (
        <div
          data-testid="gmaps-bot-floating-toast"
          className={`fixed bottom-5 right-5 z-[60] max-w-md rounded-xl border p-4 shadow-xl transition-all ${
            botNeedsLoginPrompt
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-white border-slate-300 text-slate-900'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 text-xs leading-relaxed">
              <div className="font-bold">
                {botNeedsLoginPrompt
                  ? 'Cần đăng nhập Google ở Bước 1 để Bot đăng bài thật'
                  : isRunningBotLogin || runningBotAssetId
                  ? 'Google Maps Bot đang chạy...'
                  : 'Trạng thái Google Maps Bot'}
              </div>
              <p className="text-slate-700">{botActionNotice}</p>
              {botNeedsLoginPrompt && (
                <div className="pt-1 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleCopyLoginCommand}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                    >
                      {copiedLoginCmd ? 'Đã copy lệnh PowerShell' : 'Copy lệnh mở Edge ở PowerShell'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenMapsInCurrentChrome(
                          localPosts[0]?.metadata?.spot_name || selectedSpot.name,
                          localPosts[0]?.content
                        )
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-700 text-white hover:bg-blue-800"
                    >
                      Mở Maps trên Chrome này
                    </button>
                  </div>
                  <code className="block px-2 py-1 rounded bg-white border border-amber-200 text-[10px] text-slate-800 select-all break-all">
                    {GMAPS_LOGIN_CMD}
                  </code>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setBotActionNotice(null);
                setBotNeedsLoginPrompt(false);
              }}
              className="text-slate-500 hover:text-slate-900 text-xs font-semibold px-1"
              aria-label="Đóng thông báo"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
