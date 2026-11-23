import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../cloudflare-api/index.mjs';
test('staging API proxy permits published pilot reads and public submissions only',async()=>{
  const requests=[];const env={LOCAL_API:{fetch:async(url,init)=>{requests.push({path:url.pathname,method:init.method});return Response.json({ok:true});}}};
  for(const [path,method,status] of [
    ['/public/v1/sites/tripc-pilot/posts','GET',200],['/public/v1/sites/tripc-pilot/posts/a-guide','GET',200],
    ['/public/v1/sites/tripc-pilot/leads','POST',200],['/public/v1/sites/tripc-pilot/events','POST',200],
    ['/public/v1/sites/tripc-pilot/chat','POST',200],['/public/v1/sites/tripc-pilot/chat','GET',404],
    ['/public/v1/sites/tripc-pilot/posts','DELETE',404],['/public/v1/sites/tripc-pilot/admin','GET',404],['/internal/metrics/group','POST',404],
  ]){const r=await worker.fetch(new Request('https://api.example.test'+path,{method,...(method==='POST'?{body:'{}'}:{})}),env);assert.equal(r.status,status);}
  assert.equal(requests.length,5);
});
