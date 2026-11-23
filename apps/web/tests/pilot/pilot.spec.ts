import { test,expect } from '@playwright/test';
test('visitor gets immediate AI advice and can save questions with a consented lead',async({page})=>{
  const payloads:Record<string,unknown>[]=[];page.on('request',r=>{if(r.url().endsWith('/leads'))payloads.push(r.postDataJSON());});
  await page.goto('/');await page.getByLabel('What can we help with?',{exact:true}).fill('I need housing for a month');await page.getByRole('button',{name:'Ask AI',exact:true}).click();
  await expect(page.locator('.chat-answer')).toContainText('dates and budget');expect(payloads).toHaveLength(0);
  await page.getByLabel('Name',{exact:true}).fill('Synthetic AI visitor');await page.getByLabel('Email',{exact:true}).fill('ai-visitor@example.test');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Send request',exact:true}).click();await expect(page.locator('.form-success')).toBeVisible();
  expect((payloads[0].context as Record<string,string>).inquiry).toContain('housing for a month');
});
test('AI error keeps the question and does not disable the contact form',async({page})=>{
  await page.goto('/');await page.getByLabel('What can we help with?',{exact:true}).fill('FAIL CHAT');await page.getByRole('button',{name:'Ask AI',exact:true}).click();await expect(page.locator('.chat-form').getByRole('alert')).toContainText('temporarily unavailable');await expect(page.getByLabel('What can we help with?',{exact:true})).toHaveValue('FAIL CHAT');await expect(page.getByLabel('Email',{exact:true})).toBeEnabled();
});
test('discovery photo slideshow advances, pauses and respects reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
  const gallery=page.locator('.discovery-gallery');await gallery.scrollIntoViewIfNeeded();await page.locator('.discovery-card').first().hover();
  await expect(gallery.locator('.discovery-dots')).toHaveCount(0);
  expect(await page.locator('.discovery-work img').evaluateAll(images=>images.map(image=>(image as HTMLImageElement).getAttribute('src')))).toEqual(['/images/danang-cafe-interior.webp','/images/danang-coffee-table.webp']);
  await expect.poll(()=>page.locator('.discovery-housing .discovery-frame').first().locator('img').evaluate(image=>Number(getComputedStyle(image).transform.match(/matrix\(([^,]+)/)?.[1]??1))).toBeGreaterThan(1.08);
  await expect(gallery).toHaveAttribute('data-playing','true');await expect(gallery).toHaveAttribute('data-slide','1',{timeout:10000});
  await expect(page.locator('.discovery-frames').first()).toHaveAttribute('style',/translateX\(-100%\)/);
  await page.getByRole('button',{name:'Pause slideshow',exact:true}).click();await page.mouse.move(0,0);await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();});await expect(gallery).toHaveAttribute('data-playing','false');
  const current=await gallery.getAttribute('data-slide');await page.waitForTimeout(6500);await expect(gallery).toHaveAttribute('data-slide',current!);
  await page.getByRole('button',{name:'Next photos',exact:true}).click();expect(await gallery.getAttribute('data-slide')).not.toBe(current);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(gallery).toHaveAttribute('data-playing','false');
  await expect(page.getByRole('button',{name:/slideshow/})).toHaveCount(0);
  await expect(page.locator('.discovery-card')).toHaveCount(4);
});
test('map links open existing TripC Map without loading a local provider',async({page})=>{
  const providers:string[]=[];page.on('request',r=>{if(/overpass|tile\.openstreetmap/.test(r.url()))providers.push(r.url());});
  await page.goto('/vi/');const links=page.locator('a[href="https://tripc.ai/?cat=all"]');await expect(links).toHaveCount(2);
  for(const link of await links.all()){await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');}
  await page.goto('/vi/map/');await expect(page.getByRole('link',{name:'Mở TripC Map',exact:false})).toHaveAttribute('href','https://tripc.ai/?cat=all');await expect(page.locator('.leaflet-container')).toHaveCount(0);expect(providers).toEqual([]);
});
test('image covers, featured guide, discovery, saved persistence and sharing work',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:async(data:ShareData)=>{sessionStorage.setItem('qa-shared-url',data.url??'');}});});
  await page.goto('/');
  await expect(page.locator('.hero-visual img')).toBeVisible();
  await expect(page.locator('.hero-visual img')).toHaveAttribute('src','/images/my-khe-coast.webp');
  expect(await page.locator('.hero-visual img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
  await expect(page.locator('.featured-guide')).toContainText('Coworking and connection');
  await page.locator('.discovery-housing').click();await expect(page.locator('.guide-card')).toHaveCount(1);
  const card=page.locator('.guide-card');await card.getByRole('button',{name:'Save guide',exact:true}).click();
  await card.getByRole('button',{name:'Share guide',exact:true}).click();
  expect(await page.evaluate(()=>sessionStorage.getItem('qa-shared-url'))).toBe('http://127.0.0.1:3017/posts/fixture-home/');
  await page.reload();await page.getByRole('button',{name:/Saved guides only/}).click();await expect(page.locator('.guide-card')).toHaveCount(1);
  await page.locator('.guide-card').getByRole('link',{name:'Finding a home in Da Nang',exact:true}).click();
  await expect(page.getByRole('button',{name:'Saved',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Saved',exact:true}).click();await expect(page.getByRole('button',{name:'Save guide',exact:true})).toHaveAttribute('aria-pressed','false');
});
test.beforeEach(async({page,request})=>{
  await request.get('http://127.0.0.1:4017/control/reset');
  await page.route('https://www.googletagmanager.com/**',r=>r.fulfill({contentType:'application/javascript',body:'/* isolated analytics loader fixture */'}));
});
test('published guide pagination, filtering, reading and switching language work',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Decline',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your next chapter in Da Nang.',exact:true})).toBeVisible();
  await expect(page.locator('.guide-card')).toHaveCount(2);
  await page.getByRole('searchbox',{name:'Search guides'}).fill('home');await expect(page.locator('.guide-card')).toHaveCount(1);
  await page.getByRole('link',{name:'Finding a home in Da Nang',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Finding your neighbourhood',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Sources & further reading',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Chuyển sang tiếng Việt'}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','vi');
  await expect(page.getByText('Bài viết được hiển thị bằng ngôn ngữ xuất bản gốc.',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:/Tất cả cẩm nang/}).click();
  await expect(page.getByRole('heading',{name:'Chương mới của bạn tại Đà Nẵng.',exact:true})).toBeVisible();
});
test('ambiguous form failure retries with the same key and creates one saved request',async({page,request})=>{
  await page.goto('/');await page.getByRole('button',{name:'Decline',exact:true}).click();
  await request.get('http://127.0.0.1:4017/control/fail-next');
  await page.getByRole('button',{name:'Ask TripC',exact:true}).click();
  await expect(page.getByLabel('Name',{exact:true})).toBeFocused();
  await page.getByLabel('Name',{exact:true}).fill('Synthetic visitor');await page.getByLabel('Email',{exact:true}).fill('visitor@example.test');
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Send request',exact:true}).click();
  await expect(page.locator('.lead-form').getByRole('alert')).toContainText('could not save');
  await expect(page.getByLabel('Email',{exact:true})).toHaveValue('visitor@example.test');
  await page.getByRole('button',{name:'Send request',exact:true}).click();await expect(page.getByRole('status')).toContainText('request has been saved');
  const state=await(await request.get('http://127.0.0.1:4017/control/state')).json();expect(state.lead_count).toBe(1);expect(state.keys.length).toBe(2);expect(state.keys[0]).toBe(state.keys[1]);
});
test('optional analytics waits for consent and both languages fit a small phone',async({page})=>{
  await page.setViewportSize({width:375,height:812});await page.goto('/vi/');
  await expect(page.locator('html')).toHaveAttribute('lang','vi');
  await expect(page.locator('script#tripc-google-tag')).toHaveCount(0);
  await page.getByRole('button',{name:'Cho phép',exact:true}).click();await expect(page.locator('script#tripc-google-tag')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('heading',{name:'Chương mới của bạn tại Đà Nẵng.',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Cài đặt phân tích',exact:true}).click();await page.getByRole('button',{name:'Từ chối',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('tripc_analytics_consent'))).toBe('denied');
  await page.getByRole('link',{name:'Switch to English'}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
