import { spawn } from 'node:child_process';

/**
 * Keeps the Community topics' explainer videos rendered ahead of the calendar, from inside the worker.
 *
 * Every tick runs `scripts/auto-videos.mjs` in the renderer project (VIDEO_BUILDER_DIR, Video3D/tripc-playbook), which
 * makes at most one video: posted topics without one first, then the next VIDEO_LOOKAHEAD topics on the calendar.
 * The script keeps its own model budget (Groq, then OpenRouter, Gemini only without either key).
 */
type Env = Record<string, string | undefined>;

export function videoBuilderCommand(env: Env): { cwd: string; args: string[]; env: Env } | null {
  const cwd = env.VIDEO_BUILDER_DIR?.trim();
  if (!cwd) return null;
  return { cwd, args: ['scripts/auto-videos.mjs'], env: { ...env, VIDEO_LOOKAHEAD: env.VIDEO_LOOKAHEAD || '7' } };
}

export class VideoBuilder {
  private running: Promise<unknown> | null = null;
  constructor(private readonly build: () => Promise<number>) {}

  tick(): 'started' | 'busy' {
    if (this.running) return 'busy';
    this.running = this.build()
      .catch((error) => console.error('[videos]', (error as Error).message))
      .finally(() => { this.running = null; });
    return 'started';
  }

  async idle() { await this.running; }
}

/** The production builder: a child `node` process whose output goes to the worker's log with a [videos] prefix. */
export function defaultVideoBuilder(env: Env = process.env): VideoBuilder | null {
  const cmd = videoBuilderCommand(env);
  if (!cmd) return null;
  return new VideoBuilder(() => new Promise<number>((resolve) => {
    const child = spawn(process.execPath, cmd.args, { cwd: cmd.cwd, env: cmd.env as NodeJS.ProcessEnv, windowsHide: true });
    const relay = (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) console.log('[videos]', line);
    };
    child.stdout.on('data', relay);
    child.stderr.on('data', relay);
    child.on('error', (error) => { console.error('[videos]', error.message); resolve(1); });
    child.on('close', (code) => resolve(code ?? 1));
  }));
}
