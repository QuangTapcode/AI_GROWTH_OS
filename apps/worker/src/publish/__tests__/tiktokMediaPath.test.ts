import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveTikTokMediaPath } from '../TikTokPublisher';

const WS = '10000000-0000-4000-8000-000000000001';

describe("finding an uploaded TikTok video on this worker's disk", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
  const uploads = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktok-uploads-'));
    dirs.push(root);
    fs.mkdirSync(path.join(root, WS));
    fs.writeFileSync(path.join(root, WS, 'clip.mp4'), 'x');
    return root;
  };

  it('finds a video the API saved inside its container, under the same workspace folder here', () => {
    const root = uploads();
    expect(resolveTikTokMediaPath(`/data/tiktok-uploads/${WS}/clip.mp4`, root)).toBe(path.join(root, WS, 'clip.mp4'));
  });

  it('keeps a path that already exists on this machine', () => {
    const root = uploads();
    const here = path.join(root, WS, 'clip.mp4');
    expect(resolveTikTokMediaPath(here, path.join(root, 'elsewhere'))).toBe(here);
  });

  it('never leaves the upload folder, and gives back the stored path when nothing matches', () => {
    const root = uploads();
    expect(resolveTikTokMediaPath(`/data/tiktok-uploads/../${WS}/clip.mp4`, root)).toBe(`/data/tiktok-uploads/../${WS}/clip.mp4`);
    expect(resolveTikTokMediaPath(`/data/tiktok-uploads/${WS}/missing.mp4`, root)).toBe(`/data/tiktok-uploads/${WS}/missing.mp4`);
    expect(resolveTikTokMediaPath(`/data/tiktok-uploads/not-a-workspace/clip.mp4`, root)).toBe('/data/tiktok-uploads/not-a-workspace/clip.mp4');
    expect(resolveTikTokMediaPath(undefined, root)).toBeUndefined();
  });
});
