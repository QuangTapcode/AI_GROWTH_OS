import type { IntegrationProvider, MissingReason } from './types';

/**
 * W1-MY-06 — config/access/support matrix GA4/GSC.
 * Mỗi dòng = capability cần cho pilot, scope/permission yêu cầu, cách probe
 * khi PM có quyền, và trạng thái mặc định CHƯA có account/property.
 * Env keys là server-only credential refs — không bao giờ serialize ra public.
 */
export interface IntegrationCapabilityRow {
  provider: IntegrationProvider;
  capability:
    | 'read_property'
    | 'read_stream_events'
    | 'read_realtime_events'
    | 'read_sites'
    | 'read_search_analytics'
    | 'verify_site_ownership'
    | 'read_page_posts'
    | 'publish_page_post'
    | 'read_creator_info'
    | 'publish_tiktok_video'
    | 'publish_tiktok_photo'
    | 'read_tiktok_status'
    | 'read_ig_media'
    | 'publish_ig_media'
    | 'read_ads_insights'
    | 'publish_cms_post';
  required_scope: string;
  required_permission: string;
  /** Cách kiểm chứng thật khi đã có quyền (W1: stub, probe khi PM có account) */
  probe:
    | 'property_lookup'
    | 'site_verification'
    | 'search_analytics_query'
    | 'stream_event_report'
    | 'page_posts_lookup'
    | 'creator_info_lookup'
    | 'publish_video_init'
    | 'publish_status_lookup'
    | 'media_library_lookup'
    | 'ads_insights_query'
    | 'cms_publish_draft';
  /** Credential ref server-only liên quan (không serialize) */
  server_env_key: string;
  /** Trạng thái hiện tại của pilot: chưa có account/URL → not_connected */
  default_status: 'not_connected';
  default_missing_reason: MissingReason;
}

export const INTEGRATION_MATRIX: readonly IntegrationCapabilityRow[] = [
  {
    provider: 'ga4',
    capability: 'read_property',
    required_scope: 'https://www.googleapis.com/auth/analytics.readonly',
    required_permission: 'Viewer (property)',
    probe: 'property_lookup',
    server_env_key: 'GOOGLE_SERVICE_ACCOUNT_JSON',
    default_status: 'not_connected',
    default_missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
  },
  {
    provider: 'ga4',
    capability: 'read_stream_events',
    required_scope: 'https://www.googleapis.com/auth/analytics.readonly',
    required_permission: 'Viewer (property)',
    probe: 'stream_event_report',
    server_env_key: 'GOOGLE_SERVICE_ACCOUNT_JSON',
    default_status: 'not_connected',
    default_missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
  },
  {
    provider: 'ga4',
    capability: 'read_realtime_events',
    required_scope: 'https://www.googleapis.com/auth/analytics.readonly',
    required_permission: 'Viewer (property)',
    probe: 'stream_event_report',
    server_env_key: 'GOOGLE_SERVICE_ACCOUNT_JSON',
    default_status: 'not_connected',
    default_missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
  },
  {
    provider: 'gsc',
    capability: 'read_sites',
    required_scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    required_permission: 'Site owner / full user',
    probe: 'property_lookup',
    server_env_key: 'GSC_SERVICE_ACCOUNT_JSON',
    default_status: 'not_connected',
    default_missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
  },
  {
    provider: 'gsc',
    capability: 'read_search_analytics',
    required_scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    required_permission: 'Site owner / full user',
    probe: 'search_analytics_query',
    server_env_key: 'GSC_SERVICE_ACCOUNT_JSON',
    default_status: 'not_connected',
    default_missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
  },
  {
    provider: 'gsc',
    capability: 'verify_site_ownership',
    // verification là token DNS/HTML file, không phải OAuth scope
    required_scope: 'site_verification_token',
    required_permission: 'Domain/DNS access (PM)',
    probe: 'site_verification',
    server_env_key: 'GSC_SITE_VERIFICATION_TOKEN',
    default_status: 'not_connected',
    default_missing_reason: 'PROPERTY_NOT_VERIFIED',
  },
  // --- MY-02 spike D3: FB/IG/Meta read theo quyền; thiếu → manual pack có nhãn ---
  {
    provider: 'facebook_page',
    capability: 'read_page_posts',
    required_scope: 'pages_read_engagement',
    required_permission: 'Page Admin/Content creator (TripC page)',
    probe: 'page_posts_lookup',
    server_env_key: 'FACEBOOK_PAGE_ACCESS_TOKEN',
    default_status: 'not_connected',
    default_missing_reason: 'FACEBOOK_PAGE_PERMISSION_MISSING',
  },
  // TikTok Content Posting API. Direct posting is fail-closed until OAuth
  // grants video.publish and the app/account has passed TikTok review.
  {
    provider: 'tiktok',
    capability: 'read_creator_info',
    required_scope: 'user.info.basic',
    required_permission: 'TikTok user authorization',
    probe: 'creator_info_lookup',
    server_env_key: 'TIKTOK_ACCESS_TOKEN',
    default_status: 'not_connected',
    default_missing_reason: 'TIKTOK_ACCOUNT_NOT_CONNECTED',
  },
  {
    provider: 'tiktok',
    capability: 'publish_tiktok_video',
    required_scope: 'video.publish',
    required_permission: 'TikTok Content Posting API approval + user consent',
    probe: 'publish_video_init',
    server_env_key: 'TIKTOK_ACCESS_TOKEN',
    default_status: 'not_connected',
    default_missing_reason: 'TIKTOK_ACCOUNT_NOT_CONNECTED',
  },
  {
    provider: 'tiktok',
    capability: 'publish_tiktok_photo',
    required_scope: 'photo.publish',
    required_permission: 'TikTok Content Posting API photo scope + user consent',
    probe: 'publish_video_init',
    server_env_key: 'TIKTOK_ACCESS_TOKEN',
    default_status: 'not_connected',
    default_missing_reason: 'TIKTOK_ACCOUNT_NOT_CONNECTED',
  },
  {
    provider: 'tiktok',
    capability: 'read_tiktok_status',
    required_scope: 'video.publish or video.upload',
    required_permission: 'TikTok user authorization',
    probe: 'publish_status_lookup',
    server_env_key: 'TIKTOK_ACCESS_TOKEN',
    default_status: 'not_connected',
    default_missing_reason: 'TIKTOK_ACCOUNT_NOT_CONNECTED',
  },
  {
    provider: 'facebook_page',
    capability: 'publish_page_post',
    required_scope: 'pages_manage_posts',
    required_permission: 'Page Content creator (publish live)',
    probe: 'page_posts_lookup',
    server_env_key: 'FACEBOOK_PAGE_ACCESS_TOKEN',
    default_status: 'not_connected',
    default_missing_reason: 'FACEBOOK_PAGE_PERMISSION_MISSING',
  },
  {
    provider: 'instagram_business',
    capability: 'read_ig_media',
    required_scope: 'instagram_basic',
    required_permission: 'IG Business account linked to FB Page',
    probe: 'media_library_lookup',
    server_env_key: 'INSTAGRAM_BUSINESS_ACCOUNT_ID',
    default_status: 'not_connected',
    default_missing_reason: 'INSTAGRAM_ACCOUNT_NOT_LINKED',
  },
  {
    provider: 'instagram_business',
    capability: 'publish_ig_media',
    required_scope: 'instagram_content_publish',
    required_permission: 'IG Business + FB Page content_publish',
    probe: 'media_library_lookup',
    server_env_key: 'INSTAGRAM_BUSINESS_ACCOUNT_ID',
    default_status: 'not_connected',
    default_missing_reason: 'INSTAGRAM_ACCOUNT_NOT_LINKED',
  },
  {
    provider: 'meta_ads',
    capability: 'read_ads_insights',
    required_scope: 'ads_read',
    required_permission: 'Ad Account Analyst (read-only theo Level 2)',
    probe: 'ads_insights_query',
    server_env_key: 'META_ADS_ACCESS_TOKEN',
    default_status: 'not_connected',
    default_missing_reason: 'META_ADS_ACCESS_MISSING',
  },
  {
    provider: 'website_cms',
    capability: 'publish_cms_post',
    // Next.js pilot — không cần OAuth; publish cần human approval + version theo contract
    required_scope: 'internal_api_write',
    required_permission: 'Editor/Owen workspace (publish qua approval)',
    probe: 'cms_publish_draft',
    server_env_key: 'PILOT_CMS_API_KEY',
    default_status: 'not_connected',
    default_missing_reason: 'CMS_NOT_PUBLISHED',
  },
] as const;

export function matrixFor(provider: IntegrationProvider): IntegrationCapabilityRow[] {
  return INTEGRATION_MATRIX.filter((row) => row.provider === provider);
}

/** Mọi env key server-only được matrix tham chiếu (guard không leak trong test). */
export function serverEnvKeys(): string[] {
  return [...new Set(INTEGRATION_MATRIX.map((row) => row.server_env_key))];
}
