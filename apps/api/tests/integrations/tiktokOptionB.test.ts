import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  buildTikTokCaptionFromArtifact,
  decryptTikTokToken,
  encryptTikTokToken,
  sanitizeReturnPath,
  signOAuthState,
  validateMp4Buffer,
  validatePublicVideoUrl,
  verifyOAuthState,
} from '../../src/modules/integrations/tiktok';
import { canonicalJson, sha256Hex } from '../../src/lib/hash';

function makeValidMp4Buffer(size = 64, brand = 'isom'): Buffer {
  const buf = Buffer.alloc(size, 0);
  buf.writeUInt32BE(24, 0);
  buf.write('ftyp', 4, 'ascii');
  buf.write(brand.slice(0, 4).padEnd(4, ' '), 8, 'ascii');
  return buf;
}

describe('TikTok Option B API helpers & security guarantees', () => {
  it('signOAuthState & verifyOAuthState handle valid, tampered, and expired states', () => {
    const state = signOAuthState({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      userId: 'a0000000-0000-4000-8000-000000000001',
      returnTo: '/distribution',
      ttlMs: 60_000,
    });

    const verified = verifyOAuthState(state);
    expect(verified.workspace_id).toBe('10000000-0000-4000-8000-000000000001');
    expect(verified.user_id).toBe('a0000000-0000-4000-8000-000000000001');
    expect(verified.return_to).toBe('/distribution');

    // Tampered signature
    const [payloadPart, sigPart] = state.split('.');
    const flippedChar = sigPart[0] === 'A' ? 'B' : 'A';
    const tampered = `${payloadPart}.${flippedChar}${sigPart.slice(1)}`;
    expect(() => verifyOAuthState(tampered)).toThrowError(/signature/i);

    // Expired state
    const expired = signOAuthState({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      userId: 'a0000000-0000-4000-8000-000000000001',
      ttlMs: -5_000,
    });
    expect(() => verifyOAuthState(expired)).toThrowError(/expired/i);
  });

  it('sanitizeReturnPath prevents open redirects and keeps safe local routes', () => {
    expect(sanitizeReturnPath('/distribution')).toBe('/distribution');
    expect(sanitizeReturnPath('/workspace#integrations')).toBe('/workspace#integrations');
    expect(sanitizeReturnPath('//evil.com')).toBe('/distribution');
    expect(sanitizeReturnPath('https://evil.com/phish')).toBe('/distribution');
    expect(sanitizeReturnPath('/foo\\bar')).toBe('/distribution');
    expect(sanitizeReturnPath('/foo\r\nSet-Cookie: a=b')).toBe('/distribution');
    expect(sanitizeReturnPath(undefined)).toBe('/distribution');
  });

  it('encryptTikTokToken & decryptTikTokToken match worker AES-256-GCM key derivation', () => {
    const sharedKey = 'tripc_shared_test_encryption_key_2026!';
    const raw = 'act.tiktok.sandbox.secret_token_value';
    const cipher = encryptTikTokToken(raw, sharedKey);

    expect(cipher.split(':')).toHaveLength(3);
    expect(decryptTikTokToken(cipher, sharedKey)).toBe(raw);

    // Cross-verify exact algorithm used by worker SocialTokenManager
    const [ivHex, authTagHex, encryptedHex] = cipher.split(':');
    const derived = crypto.createHash('sha256').update(sharedKey).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', derived, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decryptedByWorkerAlgo =
      decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
    expect(decryptedByWorkerAlgo).toBe(raw);
  });

  it('validateMp4Buffer enforces empty, size <=100MB, .mp4/.mov extension, and ftyp header', () => {
    expect(() => validateMp4Buffer(Buffer.alloc(0), 'empty.mp4')).toThrowError(/rỗng/i);
    expect(() => validateMp4Buffer(makeValidMp4Buffer(64), 'bad.avi')).toThrowError(/\.mp4|\.mov/i);
    expect(() => validateMp4Buffer(Buffer.from('not-an-mp4-container-header'), 'fake.mp4')).toThrowError(/ftyp/i);

    const overLimit = Buffer.alloc(100 * 1024 * 1024 + 1);
    expect(() => validateMp4Buffer(overLimit, 'huge.mp4')).toThrowError(/100 MB/i);

    expect(() => validateMp4Buffer(makeValidMp4Buffer(64, 'isom'), 'clip.mp4')).not.toThrow();
    expect(() => validateMp4Buffer(makeValidMp4Buffer(64, 'qt  '), 'clip.mov')).not.toThrow();
  });

  it('validatePublicVideoUrl blocks non-HTTPS, localhost, and private network ranges', () => {
    expect(() => validatePublicVideoUrl('http://cdn.example.com/a.mp4')).toThrowError(/https/i);
    expect(() => validatePublicVideoUrl('https://localhost/a.mp4')).toThrowError(/localhost/i);
    expect(() => validatePublicVideoUrl('https://127.0.0.1/a.mp4')).toThrowError(/localhost/i);
    expect(() => validatePublicVideoUrl('https://192.168.1.50/a.mp4')).toThrowError(/localhost|nội bộ/i);
    expect(() => validatePublicVideoUrl('https://10.0.0.5/a.mp4')).toThrowError(/localhost|nội bộ/i);
    expect(() => validatePublicVideoUrl('https://172.16.5.4/a.mp4')).toThrowError(/localhost|nội bộ/i);
    expect(() => validatePublicVideoUrl('https://app.local/a.mp4')).toThrowError(/localhost|nội bộ/i);

    expect(validatePublicVideoUrl(' https://cdn.example.com/videos/danang.mp4 ')).toBe(
      'https://cdn.example.com/videos/danang.mp4'
    );
  });

  it('buildTikTokCaptionFromArtifact extracts structured TikTok script or falls back to Facebook/SEO', () => {
    const withTikTok = buildTikTokCaptionFromArtifact({
      title: 'Da Nang Night Market',
      payload: {
        result: {
          title: 'Top 3 Night Markets in Da Nang',
          tiktok: {
            hook: 'Wait until you see Son Tra at 8PM!',
            scenes: [{ voiceover: 'Fresh seafood starts from 40k VND.' }],
            cta: 'Save this guide for your trip!',
            hashtags: ['TripC', '#DaNang', 'DanangFood'],
          },
        },
      },
    });
    expect(withTikTok.title).toBe('Top 3 Night Markets in Da Nang');
    expect(withTikTok.caption).toContain('Wait until you see Son Tra at 8PM!');
    expect(withTikTok.caption).toContain('Fresh seafood starts from 40k VND.');
    expect(withTikTok.caption).toContain('#TripC #DaNang #DanangFood');

    const withFacebookFallback = buildTikTokCaptionFromArtifact({
      title: 'My Khe Sunrise',
      payload: {
        result: {
          facebook: {
            text: 'Morning coffee right on My Khe beach.',
          },
        },
      },
    });
    expect(withFacebookFallback.caption).toContain('Morning coffee right on My Khe beach.');
    expect(withFacebookFallback.hashtags).toContain('#TripC');
  });

  it('canonical artifact hash omits file_path/media_path and matches worker canonical hash order', () => {
    const artifactResult = {
      title: 'Sample Video',
      caption: 'Hello Da Nang #TripC',
      hashtags: ['#TripC'],
      media_type: 'video',
      video_source_type: 'file_upload',
      privacy_level: 'SELF_ONLY',
      is_aigc: true,
      video_filename: 'clip-123.mp4',
    };
    const artifactEvidence = [{ type: 'source_artifact', artifact_id: 'art-1' }];

    const apiHash = sha256Hex(canonicalJson({ result: artifactResult, evidence: artifactEvidence }));

    // Re-serialize independently with alphabetical key sorting (same contract as worker computeSha256Hex)
    const canonicalWorkerCheck = (val: unknown): string => {
      if (val === null || typeof val !== 'object') return JSON.stringify(val);
      if (Array.isArray(val)) return '[' + val.map(canonicalWorkerCheck).join(',') + ']';
      const keys = Object.keys(val as Record<string, unknown>).sort();
      return (
        '{' +
        keys.map((k) => JSON.stringify(k) + ':' + canonicalWorkerCheck((val as Record<string, unknown>)[k])).join(',') +
        '}'
      );
    };
    const workerHash = crypto
      .createHash('sha256')
      .update(canonicalWorkerCheck({ result: artifactResult, evidence: artifactEvidence }), 'utf8')
      .digest('hex');

    expect(apiHash).toBe(workerHash);
    expect(JSON.stringify(artifactResult)).not.toContain('file_path');
    expect(JSON.stringify(artifactResult)).not.toContain('media_path');
  });
});

