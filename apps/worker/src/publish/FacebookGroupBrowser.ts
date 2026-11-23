import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function groupUrl(groupId: string) {
  if (!/^\d{5,30}$/.test(groupId)) throw new Error('INVALID_GROUP_ID');
  return `https://www.facebook.com/groups/${groupId}`;
}
export function visibleInteger(text: string, label: string): number | null {
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=text.match(new RegExp(`(?:^|[\\s\\n])([0-9]+)\\s+${escaped}(?=$|[\\s\\n])`,'iu'));
  return match ? Number(match[1]) : null;
}
export function vietnamesePeriod(text: string) {
  const found=text.match(/(\d{1,2}) Tháng (\d{1,2}), (\d{4})\s*[-–]\s*(\d{1,2}) Tháng (\d{1,2}), (\d{4})/u);
  if(!found)return null;
  const iso=(d:string,m:string,y:string)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  const from=iso(found[1],found[2],found[3]),to=iso(found[4],found[5],found[6]);
  try { if(from>to||new Date(from+'T00:00:00Z').toISOString().slice(0,10)!==from||new Date(to+'T00:00:00Z').toISOString().slice(0,10)!==to)return null; }
  catch {return null;}
  return {from,to};
}
export function visibleShares(text:string,labels:string=''):number|null {
  return visibleInteger(text,'lượt chia sẻ')??visibleInteger(text,'chia sẻ')
    ??visibleInteger(labels,'lượt chia sẻ')??visibleInteger(labels,'shares');
}
export async function openGroupSession(sessionPath: string,options:{headless?:boolean}={}) {
  if(!existsSync(sessionPath))throw new Error('GROUP_SESSION_REQUIRED');
  let state:{cookies?:{name:string;value?:string;expires?:number}[]};
  try{state=JSON.parse(readFileSync(sessionPath,'utf8'));}catch{throw new Error('GROUP_SESSION_INVALID');}
  const now=Date.now()/1000;
  for(const name of ['c_user','xs']) {
    const cookie=state.cookies?.find((c:{name:string;value?:string;expires?:number})=>c.name===name);
    if(!cookie?.value||(cookie.expires!==undefined&&cookie.expires>0&&cookie.expires<now))throw new Error('GROUP_SESSION_EXPIRED');
  }
  const browser=await chromium.launch({channel:'chrome',headless:options.headless??false});
  try { return {browser,context:await browser.newContext({storageState:sessionPath,viewport:{width:1440,height:1000}})}; }
  catch {await browser.close();throw new Error('GROUP_SESSION_INVALID');}
}
export async function requireGroupLogin(page: Page) {
  if(/\/login|\/checkpoint|two_step_verification/.test(new URL(page.url()).pathname)
    ||await page.locator('input[name="email"],input[name="pass"]').first().isVisible().catch(()=>false))
    throw new Error('GROUP_LOGIN_REQUIRED');
}

export async function readGroupInsights(context: BrowserContext, groupId: string) {
  const page=await context.newPage();
  try {
    await page.goto(groupUrl(groupId)+'/insights/?section=engagement',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(2500);await requireGroupLogin(page);
    const main=page.getByRole('main');
    const initial=(await main.allInnerTexts()).join('\n').split('Ngày cao điểm')[0];
    const period=vietnamesePeriod(initial);
    if(!period)throw new Error('GROUP_INSIGHT_PERIOD_NOT_VISIBLE');
    const metrics:Record<string,number|null>={posts:visibleInteger(initial,'bài viết'),comments:null,reactions:null,new_members:null};
    for(const [metric,label,countLabel] of [['comments','Bình luận','bình luận'],['reactions','Cảm xúc','cảm xúc']]) {
      const control=page.getByText(label,{exact:true}).first();
      if(await control.isVisible().catch(()=>false)) {
        await control.click();await page.waitForTimeout(1200);
        const text=(await main.allInnerTexts()).join('\n').split('Ngày cao điểm')[0];
        const selected=vietnamesePeriod(text);
        if(selected?.from!==period.from||selected?.to!==period.to)throw new Error('GROUP_INSIGHT_PERIOD_CHANGED');
        metrics[metric]=visibleInteger(text,countLabel);
      }
    }
    const totalMembers=visibleInteger(await page.locator('body').innerText(),'thành viên');
    return {group_id:groupId,source:'facebook_group_browser' as const,captured_at:new Date().toISOString(),
      period_from:period.from,period_to:period.to,timezone:'provider_unspecified' as const,metrics,total_members:totalMembers,
      source_url:groupUrl(groupId)+'/insights/?section=engagement',
      missing_reasons:Object.fromEntries(Object.entries(metrics).filter(([,v])=>v===null).map(([k])=>[k,'COUNTER_NOT_VISIBLE']))};
  }finally{await page.close();}
}

/** A durable intent prevents a second click after a timeout/unknown result. An operator must reconcile it. */
export async function publishGroupPost(context: BrowserContext,input:{groupId:string;text:string;expectedHash:string;intentPath:string}) {
  if(createHash('sha256').update(input.text).digest('hex')!==input.expectedHash)throw new Error('GROUP_TEXT_HASH_MISMATCH');
  if(existsSync(input.intentPath))throw new Error('GROUP_PUBLISH_INTENT_EXISTS_RECONCILE_FIRST');
  const page=await context.newPage();
  try {
    await page.goto(groupUrl(input.groupId),{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(2500);await requireGroupLogin(page);
    const prior=page.getByText(input.text,{exact:true});
    if(await prior.count())throw new Error('GROUP_POST_ALREADY_VISIBLE_RECONCILE_FIRST');
    let entry=page.getByRole('button',{name:/^(Viết gì đó|Bạn viết gì đi|Write something|Tạo bài viết|Create post|Write a post)/i}).first();
    if(!await entry.isVisible().catch(()=>false))entry=page.getByText(/^(Viết gì đó|Bạn viết gì đi|Write something)[.…]*$/i).first();
    await entry.click();const dialog=page.getByRole('dialog').filter({has:page.locator('[contenteditable="true"]')}).last();
    const editor=dialog.locator('[contenteditable="true"]').first();
    await editor.fill(input.text);await page.waitForTimeout(1000);
    if((await editor.innerText()).trim()!==input.text.trim())throw new Error('GROUP_COMPOSER_TEXT_MISMATCH');
    const button=dialog.getByRole('button',{name:/^(Đăng|Post)$/i,exact:true}).first();
    if(!await button.isEnabled())throw new Error('GROUP_POST_BUTTON_DISABLED');
    writeFileSync(input.intentPath,JSON.stringify({group_id:input.groupId,text_hash:input.expectedHash,status:'click_intent',created_at:new Date().toISOString()}),{flag:'wx'});
    await button.click();
    await page.waitForTimeout(7000);
    const published=page.getByText(input.text,{exact:true}).first();
    const article=published.locator(`xpath=ancestor::div[.//a[contains(@href,"/groups/${input.groupId}") and not(contains(@href,"/user/"))]][1]`);
    const links=await article.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>(n as HTMLAnchorElement).href)).catch(()=>[] as string[]);
    let url=links.find(url=>new RegExp(`/groups/${input.groupId}/(?:posts|permalink)/\\d+`).test(url));
    if(!url){
      const time=article.locator('a').filter({hasText:/^(Vừa xong|\d+ (giây|phút|giờ)|Just now|\d+\s*[smh])/i}).first();
      if(await time.isVisible().catch(()=>false)){
        await time.click();await page.waitForTimeout(1500);
        if(new RegExp(`/groups/${input.groupId}/(?:posts|permalink)/\\d+`).test(page.url())
          &&await page.getByText(input.text,{exact:true}).first().isVisible().catch(()=>false))url=page.url();
      }
    }
    if(!url)throw new Error('GROUP_PUBLISH_OUTCOME_UNKNOWN_CHECK_GROUP_NO_RETRY');
    const postId=url.match(/\/(?:posts|permalink)\/(\d+)/)![1];
    const result={post_id:postId,url:`${groupUrl(input.groupId)}/posts/${postId}/`,published_at:new Date().toISOString()};
    writeFileSync(input.intentPath,JSON.stringify({...result,status:'published',text_hash:input.expectedHash}));
    return result;
  }finally{await page.close();}
}

export async function readGroupPost(context: BrowserContext,groupId:string,postId:string,expectedText:string) {
  if(!/^\d+$/.test(postId))throw new Error('INVALID_GROUP_POST_ID');
  const page=await context.newPage();
  try {
    const url=`${groupUrl(groupId)}/posts/${postId}/`;
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(2500);await requireGroupLogin(page);
    const content=page.getByText(expectedText,{exact:true}).filter({visible:true}).first();
    if(!await content.isVisible().catch(()=>false))throw new Error('GROUP_POST_SCOPE_NOT_FOUND');
    // Facebook also renders post details in a dialog without role=article.
    const dialog=page.getByRole('dialog').filter({has:content}).last();
    let article=page.getByRole('article').filter({has:content}).first();
    if(await dialog.isVisible().catch(()=>false))article=dialog;
    if(!await article.isVisible().catch(()=>false))throw new Error('GROUP_POST_COUNTER_SCOPE_NOT_FOUND');
    const text=await article.innerText();
    const reactionLabel=await article.locator('[aria-label]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')).join('\n'));
    const reaction=(text+'\n'+reactionLabel).match(/Tất cả cảm xúc:\s*([0-9]+)(?:\s|$)/u);
    const compact=await article.locator('[role="button"][aria-label*="khỏi bài viết"]').allInnerTexts();
    const compactTotal=compact.map(v=>v.trim()).find(v=>/^\d+$/.test(v));
    return {post_id:postId,source_url:url,captured_at:new Date().toISOString(),counters:{reactions:reaction?Number(reaction[1]):compactTotal?Number(compactTotal):null,
      comments:/Chưa có bình luận nào/u.test(text)?0:visibleInteger(text,'bình luận'),shares:visibleShares(text,reactionLabel)}};
  }finally{await page.close();}
}
