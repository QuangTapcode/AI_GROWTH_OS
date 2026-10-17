import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGatewayCheck } from '../GatewayRecheckClient';

/**
 * MY-05 — GatewayRecheckClient: nối seam gatewayCheck với gateway TQ-06 qua HTTP.
 * Stub global.fetch; không mở socket thật.
 */
const req = {
  workspaceId: 'ws-1',
  channel: 'Website',
  approvalId: 'appr-1',
  expectedVersion: 3,
  expectedHash: 'hash-abc',
};

describe('GatewayRecheckClient (MY-05)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['API_BASE_URL'];
    delete process.env['WORKER_GATEWAY_TOKEN'];
  });

  it('thiếu API_BASE_URL → null (không bật recheck)', () => {
    expect(createGatewayCheck()).toBeNull();
  });

  it('gateway 200 success → authorized; gửi đúng body/headers', async () => {
    process.env['API_BASE_URL'] = 'http://api.test/';
    process.env['WORKER_GATEWAY_TOKEN'] = 'tok-123';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, audit_id: 'a1', status: 'authorized' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const check = createGatewayCheck()!;
    const res = await check(req);

    expect(res.authorized).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/v1/workspaces/ws-1/tools/execute');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      provider: 'website_cms',
      capability: 'publish_cms_post',
      action_type: 'publish',
      approval_id: 'appr-1',
      expected_version: 3,
      expected_hash: 'hash-abc',
    });
  });

  it('gateway 403 từ API → deny với lý do từ envelope lỗi', async () => {
    process.env['API_BASE_URL'] = 'http://api.test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: { code: 'FORBIDDEN', message: 'APPROVAL_NOT_GRANTED: ...' },
        }),
      }),
    );

    const res = await createGatewayCheck()!(req);
    expect(res.authorized).toBe(false);
    expect(res.denialReason).toContain('APPROVAL_NOT_GRANTED');
  });

  it('network error → fail-closed (deny, không publish mù)', async () => {
    process.env['API_BASE_URL'] = 'http://api.test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );

    const res = await createGatewayCheck()!(req);
    expect(res.authorized).toBe(false);
    expect(res.denialReason).toContain('GATEWAY_UNREACHABLE');
  });

  it('channel không có route → deny UNSUPPORTED_CHANNEL', async () => {
    process.env['API_BASE_URL'] = 'http://api.test';
    vi.stubGlobal('fetch', vi.fn());

    const res = await createGatewayCheck()!({ ...req, channel: 'TikTok' });
    expect(res.authorized).toBe(false);
    expect(res.denialReason).toContain('UNSUPPORTED_CHANNEL');
  });
});
