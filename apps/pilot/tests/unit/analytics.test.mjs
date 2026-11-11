import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsEvent,trackPage } from '../../src/lib/analytics.ts';

test('analytics is opt-in and never sends form or arbitrary URL query values',()=>{
  const original={id:process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,window:globalThis.window,document:globalThis.document,location:globalThis.location,localStorage:globalThis.localStorage};
  let choice='denied';const calls=[];
  try{
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID='G-TESTONLY';
    globalThis.window={gtag:(...args)=>calls.push(args)};globalThis.document={title:'TripC'};
    globalThis.location={origin:'https://fixture.example',search:'?email=private@example.test&token=secret'};
    globalThis.localStorage={getItem:()=>choice};
    trackPage('/');analyticsEvent('generate_lead',null);assert.equal(calls.length,0);
    choice='granted';trackPage('/');trackPage('/');analyticsEvent('generate_lead','published-guide');
    assert.equal(calls.filter(c=>c[0]==='event'&&c[1]==='page_view').length,1);
    assert.equal(calls.find(c=>c[1]==='generate_lead')[2].content_slug,'published-guide');
    assert.ok(!JSON.stringify(calls).includes('private@example.test'));
    assert.ok(!JSON.stringify(calls).includes('secret'));
    choice='denied';const count=calls.length;analyticsEvent('cta_click',null);assert.equal(calls.length,count);
  }finally{
    for(const name of ['window','document','location','localStorage']){if(original[name]===undefined)delete globalThis[name];else globalThis[name]=original[name];}
    if(original.id===undefined)delete process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;else process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID=original.id;
  }
});
