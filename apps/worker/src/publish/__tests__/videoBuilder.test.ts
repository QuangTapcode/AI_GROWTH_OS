import { describe, expect, it } from 'vitest';
import { VideoBuilder, videoBuilderCommand } from '../VideoBuilder';

describe('VideoBuilder', () => {
  it('starts one build at a time: a tick while a video is rendering does nothing', async () => {
    let finish!: () => void, runs = 0;
    const builder = new VideoBuilder(() => { runs++; return new Promise<number>((r) => { finish = () => r(0); }); });
    expect(builder.tick()).toBe('started');
    expect(builder.tick()).toBe('busy');
    expect(runs).toBe(1);
    finish();
    await builder.idle();
    expect(builder.tick()).toBe('started');
    expect(runs).toBe(2);
  });

  it('runs the renderer project\'s auto-videos script with the worker\'s own settings, only when its folder is set', () => {
    expect(videoBuilderCommand({})).toBeNull();
    const cmd = videoBuilderCommand({ VIDEO_BUILDER_DIR: 'D:/Hoc/Video3D/tripc-playbook', GROQ_API_KEY: 'g' })!;
    expect(cmd.cwd).toBe('D:/Hoc/Video3D/tripc-playbook');
    expect(cmd.args).toEqual(['scripts/auto-videos.mjs']);
    expect(cmd.env.GROQ_API_KEY).toBe('g');
    // Render a week of the calendar ahead, so every new post finds its video ready.
    expect(cmd.env.VIDEO_LOOKAHEAD).toBe('7');
    expect(videoBuilderCommand({ VIDEO_BUILDER_DIR: 'x', VIDEO_LOOKAHEAD: '3' })!.env.VIDEO_LOOKAHEAD).toBe('3');
  });
});
