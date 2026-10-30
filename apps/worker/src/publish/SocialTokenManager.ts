import crypto from 'node:crypto';

export interface StoredTokenData {
  workspaceId: string;
  channel: 'Facebook' | 'TikTok';
  encryptedAccessToken: string;
  encryptedRefreshToken?: string;
  expiresAt?: Date;
  pageId?: string; // Facebook Page ID
  openId?: string; // TikTok Open ID
  updatedAt: Date;
}

export interface RefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  errorMessage?: string;
}

/**
 * Quản lý token an toàn:
 * 1. Mã hóa AES-256-GCM cho mọi Access Token và Refresh Token khi lưu trữ.
 * 2. Tự động kiểm tra thời hạn và làm mới (Refresh Flow) trước khi gọi API mạng xã hội.
 */
export class SocialTokenManager {
  private readonly encryptionKey: Buffer;
  // Kho lưu trữ in-memory an toàn (hoặc có thể kết nối PostgreSQL)
  private readonly store = new Map<string, StoredTokenData>();

  constructor(customKey?: string) {
    const rawKey = customKey || process.env.TOKEN_ENCRYPTION_KEY || 'default_secret_key_tripc_growth_os_32bytes!!';
    // Đảm bảo đúng 32 bytes (256 bits) cho AES-256-GCM
    this.encryptionKey = crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Mã hóa chuỗi plaintext bằng thuật toán AES-256-GCM.
   * Format xuất ra: iv:authTag:encrypted (hex)
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12); // 96-bit IV khuyến nghị cho GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Giải mã chuỗi AES-256-GCM.
   */
  decrypt(cipherPayload: string): string {
    const parts = cipherPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format. Expected iv:authTag:ciphertext');
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private storageKey(workspaceId: string, channel: 'Facebook' | 'TikTok'): string {
    return `${workspaceId}:${channel.toLowerCase()}`;
  }

  /**
   * Lưu token an toàn (tự động mã hóa trước khi lưu).
   */
  saveToken(params: {
    workspaceId: string;
    channel: 'Facebook' | 'TikTok';
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds?: number;
    pageId?: string;
    openId?: string;
  }): void {
    const key = this.storageKey(params.workspaceId, params.channel);
    const expiresAt = params.expiresInSeconds ? new Date(Date.now() + params.expiresInSeconds * 1000) : undefined;

    this.store.set(key, {
      workspaceId: params.workspaceId,
      channel: params.channel,
      encryptedAccessToken: this.encrypt(params.accessToken),
      encryptedRefreshToken: params.refreshToken ? this.encrypt(params.refreshToken) : undefined,
      expiresAt,
      pageId: params.pageId,
      openId: params.openId,
      updatedAt: new Date(),
    });
  }

  /**
   * Lấy token đã giải mã. Tự động kiểm tra thời hạn và kích hoạt luồng làm mới nếu sắp hết hạn.
   */
  async getValidAccessToken(
    workspaceId: string,
    channel: 'Facebook' | 'TikTok',
    options?: {
      clientId?: string;
      clientSecret?: string;
      fetchFn?: typeof fetch;
    }
  ): Promise<{ accessToken: string; pageId?: string; openId?: string } | null> {
    const key = this.storageKey(workspaceId, channel);
    const stored = this.store.get(key);
    if (!stored) return null;

    // Kiểm tra nếu token sắp hết hạn (trong vòng 5 phút = 300 giây)
    const isExpiringSoon = stored.expiresAt && stored.expiresAt.getTime() - Date.now() < 300 * 1000;

    if (isExpiringSoon && options?.clientId && options?.clientSecret) {
      // Thực hiện luồng làm mới
      const currentAccessToken = this.decrypt(stored.encryptedAccessToken);
      const currentRefreshToken = stored.encryptedRefreshToken ? this.decrypt(stored.encryptedRefreshToken) : undefined;

      const refreshResult = await this.refreshToken({
        channel,
        accessToken: currentAccessToken,
        refreshToken: currentRefreshToken,
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        fetchFn: options.fetchFn,
      });

      if (refreshResult.success && refreshResult.accessToken) {
        this.saveToken({
          workspaceId,
          channel,
          accessToken: refreshResult.accessToken,
          refreshToken: refreshResult.refreshToken ?? currentRefreshToken,
          expiresInSeconds: refreshResult.expiresIn ?? 5184000, // 60 ngày
          pageId: stored.pageId,
          openId: stored.openId,
        });
        return {
          accessToken: refreshResult.accessToken,
          pageId: stored.pageId,
          openId: stored.openId,
        };
      }
    }

    return {
      accessToken: this.decrypt(stored.encryptedAccessToken),
      pageId: stored.pageId,
      openId: stored.openId,
    };
  }

  /**
   * Luồng làm mới token (Refresh Flow) cho Meta Graph API và TikTok API v2.
   */
  async refreshToken(params: {
    channel: 'Facebook' | 'TikTok';
    accessToken: string;
    refreshToken?: string;
    clientId: string;
    clientSecret: string;
    fetchFn?: typeof fetch;
  }): Promise<RefreshResult> {
    const customFetch = params.fetchFn || globalThis.fetch;

    if (params.channel === 'Facebook') {
      // Meta Graph API Token Exchange (Long-Lived User/Page Token)
      const graphVersion = process.env.FACEBOOK_GRAPH_API_VERSION || 'v21.0';
      const url = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
      url.searchParams.set('grant_type', 'fb_exchange_token');
      url.searchParams.set('client_id', params.clientId);
      url.searchParams.set('client_secret', params.clientSecret);
      url.searchParams.set('fb_exchange_token', params.accessToken);

      try {
        const res = await customFetch(url.toString(), { method: 'GET' });
        const data = (await res.json()) as any;
        if (!res.ok || !data.access_token) {
          return {
            success: false,
            errorMessage: data?.error?.message || `Facebook token refresh failed with HTTP ${res.status}`,
          };
        }
        return {
          success: true,
          accessToken: data.access_token,
          expiresIn: data.expires_in ?? 5184000, // Thường là 60 ngày
        };
      } catch (err) {
        return {
          success: false,
          errorMessage: err instanceof Error ? err.message : 'Facebook refresh request failed',
        };
      }
    }

    if (params.channel === 'TikTok') {
      // TikTok OAuth v2 Refresh Flow
      if (!params.refreshToken) {
        return { success: false, errorMessage: 'TikTok token refresh requires refresh_token' };
      }
      const baseUrl = process.env.TIKTOK_API_BASE_URL || 'https://open.tiktokapis.com';
      const endpoint = `${baseUrl}/v2/oauth/token/`;
      const body = new URLSearchParams({
        client_key: params.clientId,
        client_secret: params.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: params.refreshToken,
      });

      try {
        const res = await customFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        const data = (await res.json()) as any;
        if (!res.ok || data.error?.code || !data.data?.access_token) {
          return {
            success: false,
            errorMessage: data.error?.message || `TikTok token refresh failed with HTTP ${res.status}`,
          };
        }
        return {
          success: true,
          accessToken: data.data.access_token,
          refreshToken: data.data.refresh_token,
          expiresIn: data.data.expires_in,
        };
      } catch (err) {
        return {
          success: false,
          errorMessage: err instanceof Error ? err.message : 'TikTok refresh request failed',
        };
      }
    }

    return { success: false, errorMessage: `Unsupported channel ${params.channel}` };
  }
}
