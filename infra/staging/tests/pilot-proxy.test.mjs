import assert from 'node:assert/strict';
import test from 'node:test';
import { proxyPilotRequest } from '../tripc-pages/public-proxy.mjs';
const env={PUBLIC_SITE_ID:'tripc-pilot',PUBLIC_API_ORIGIN:'https://api.example.test'};

test('chat forwards anonymously and preserves rate-limit retry guidance',async()=>{
  const request=new Request('https://pilot.example.test/public/v1/sites/tripc-pilot/chat',{method:'POST',headers:{authorization:'Bearer private',cookie:'private'},body:'{}'});
  const response=await proxyPilotRequest(request,env,async(url,init)=>{
    assert.equal(url.pathname,'/public/v1/sites/tripc-pilot/chat');assert.equal(init.method,'POST');
    assert.equal(init.headers.get('authorization'),null);assert.equal(init.headers.get('cookie'),null);
    return Response.json({error:{code:'RATE_LIMITED'}},{status:429,headers:{'retry-after':'60'}});
  });
  assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');assert.equal(response.headers.get('cache-control'),'no-store');
});
test('pilot proxy only serves the configured public site and permitted methods',async()=>{
  let called=false;const fetcher=async()=>{called=true;return Response.json({});};
  for(const path of ['/v1/auth/login','/internal/metrics/group','/public/v1/sites/other-site/posts','/public/v1/sites/tripc-pilot/admin']){
    assert.equal((await proxyPilotRequest(new Request('https://pilot.example.test'+path),env,fetcher)).status,404);
  }
  assert.equal((await proxyPilotRequest(new Request('https://pilot.example.test/public/v1/sites/tripc-pilot/leads'),env,fetcher)).status,405);
  assert.equal(called,false);
});
test('lead retries keep the idempotency key, but browser credentials and spoofed IPs are removed',async()=>{
  const r=new Request('https://pilot.example.test/public/v1/sites/tripc-pilot/leads',{method:'POST',headers:{authorization:'Bearer private',cookie:'private',origin:'https://pilot.example.test','x-forwarded-for':'spoofed','cf-connecting-ip':'203.0.113.10','idempotency-key':'same-attempt','content-type':'application/json'},body:'{}'});
  const response=await proxyPilotRequest(r,env,async(url,init)=>{
    assert.equal(url.origin,env.PUBLIC_API_ORIGIN);assert.equal(init.headers.get('idempotency-key'),'same-attempt');
    assert.equal(init.headers.get('authorization'),null);assert.equal(init.headers.get('cookie'),null);
    assert.equal(init.headers.get('x-forwarded-for'),'203.0.113.10');return Response.json({id:'lead'},{status:201});
  });assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('upstream redirects and HTML failures cannot leak into the customer form',async()=>{
  const r=()=>new Request('https://pilot.example.test/public/v1/sites/tripc-pilot/posts');
  assert.equal((await proxyPilotRequest(r(),env,async()=>new Response('',{status:302,headers:{location:'https://other.example'}}))).status,502);
  assert.equal((await proxyPilotRequest(r(),env,async()=>new Response('<html>offline</html>',{status:503}))).status,502);
});
