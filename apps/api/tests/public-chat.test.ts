import {describe,it,expect,vi} from 'vitest';
import {answerPublicChat,boundedChat,chatInput,generatePublicReply} from '../src/modules/community/publicChat';
describe('public visitor chat',()=>{
  it('rejects site spoofing, unbounded history and system roles',async()=>{
    const deps={posts:vi.fn(),generate:vi.fn()};
    await expect(answerPublicChat('unknown',{question:'Hello',locale:'en'},deps)).rejects.toThrow('SITE_NOT_FOUND');expect(deps.posts).not.toHaveBeenCalled();
    expect(chatInput.safeParse({question:'Hello',locale:'en',workspace_id:'foreign'}).success).toBe(false);
    expect(chatInput.safeParse({question:'Hello',locale:'en',history:Array(5).fill({question:'Hi',reply:'Hi'})}).success).toBe(false);
  });
  it('only supplies public content and declares generic guidance for an empty collection',async()=>{
    const generate=vi.fn().mockResolvedValue('What dates and budget are you considering?');
    const result=await answerPublicChat('tripc-pilot',{question:'Find me a flat',locale:'en'}, {posts:async()=>[],generate});
    expect(result.basis).toBe('general_guidance');expect(generate.mock.calls[0][0]).toContain('never invent');expect(result.reply).toContain('budget');
  });
  it('does not return a provider empty reply as success',async()=>{
    await expect(answerPublicChat('tripc-pilot',{question:'Hello',locale:'en'}, {posts:async()=>[],generate:async()=>''})).rejects.toThrow('AI_UNAVAILABLE');
  });
  it('bounds repeated provider calls',async()=>{
    const run=vi.fn().mockResolvedValue('ok');for(let i=0;i<5;i++)await boundedChat('qa-limit',run);
    await expect(boundedChat('qa-limit',run)).rejects.toThrow('AI_RATE_LIMIT');expect(run).toHaveBeenCalledTimes(5);
  });
  it('does not fake an AI reply without credentials',async()=>{
    const old=process.env.GEMINI_API_KEY;delete process.env.GEMINI_API_KEY;
    try{await expect(generatePublicReply('system','question')).rejects.toThrow('AI_NOT_CONFIGURED');}finally{if(old)process.env.GEMINI_API_KEY=old;}
  });
});
