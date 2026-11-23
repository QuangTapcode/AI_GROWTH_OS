/** Local-only, synthetic public API for browser tests. Never deploy this server. */
import { createServer } from 'node:http';
const posts=[{title:'Finding a home in Da Nang',slug:'fixture-home',body:'## Finding your neighbourhood\n\nControlled synthetic test content, not a travel recommendation.\n\n[source:fixture](https://example.test/source)',meta:{description:'A controlled housing guide for browser testing.',locale:'en'},published_at:'2026-11-01T00:00:00Z'},
  {title:'Coworking and connection',slug:'fixture-work',body:'## A place to work\n\nControlled synthetic test content.',meta:{description:'A controlled work guide for browser testing.',locale:'en'},published_at:'2026-11-02T00:00:00Z'}];
let failNext=false;const keys=[],leads=new Map();
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4017');const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':'http://127.0.0.1:3017','access-control-allow-headers':'Content-Type,Idempotency-Key','access-control-allow-methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(data));};
  if(req.method==='OPTIONS')return json({});
  if(url.pathname==='/health')return json({status:'ok'});
  if(url.pathname==='/control/fail-next'){failNext=true;return json({});}
  if(url.pathname==='/control/reset'){failNext=false;keys.length=0;leads.clear();return json({});}
  if(url.pathname==='/control/state')return json({keys,lead_count:leads.size});
  if(url.pathname==='/public/v1/sites/tripc-pilot/posts')return json(url.searchParams.get('cursor')?{items:[posts[1]],next_cursor:null}:{items:[posts[0]],next_cursor:'next'});
  if(url.pathname.startsWith('/public/v1/sites/tripc-pilot/posts/')){
    const post=posts.find(p=>p.slug===url.pathname.split('/').at(-1));return json(post??{error:{code:'NOT_FOUND'}},post?200:404);
  }
  if(url.pathname.endsWith('/experiment'))return json(null);
  if(url.pathname.endsWith('/chat')&&req.method==='POST'){
    let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);
    if(input.question==='FAIL CHAT')return json({error:{code:'AI_UNAVAILABLE'}},503);
    return json({reply:'Synthetic QA advice: please clarify your dates and budget.',basis:'general_guidance',sources:[]});
  }
  if(url.pathname.endsWith('/events'))return json({accepted:true});
  if(url.pathname==='/public/v1/sites/tripc-pilot/leads'&&req.method==='POST'){
    let body='';for await(const chunk of req)body+=chunk;
    const payload=JSON.parse(body),key=req.headers['idempotency-key'];
    if(!key||payload.consent?.accepted!==true||!payload.email?.endsWith('@example.test'))return json({error:{code:'INVALID_FIXTURE_REQUEST'}},422);
    keys.push(key);if(!leads.has(key))leads.set(key,{id:crypto.randomUUID()});
    if(failNext){failNext=false;return json({error:{code:'SIMULATED_RESPONSE_FAILURE'}},503);}
    return json(leads.get(key),201);
  }
  return json({error:{code:'NOT_FOUND'}},404);
});
server.listen(4017,'127.0.0.1');
process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());
