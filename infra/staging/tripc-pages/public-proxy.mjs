/** Anonymous pilot endpoints only. No admin, internal, arbitrary URL or cross-site proxying. */
export async function proxyPilotRequest(request,env,fetchUpstream=fetch){
  const url=new URL(request.url),site=env.PUBLIC_SITE_ID;
  if(!/^[a-z0-9-]{1,100}$/.test(site??''))return Response.json({error:{code:'SITE_NOT_CONFIGURED'}},{status:503});
  const prefix=`/public/v1/sites/${site}/`;
  if(!url.pathname.startsWith(prefix))return new Response('Not found',{status:404});
  const action=url.pathname.slice(prefix.length).replace(/\/$/,'');
  const allowed=/^(posts(?:\/[a-z0-9-]{1,160})?|landing)$/.test(action)?['GET','HEAD']:['events','leads','experiment','chat'].includes(action)?['POST']:[];
  if(!allowed.length)return new Response('Not found',{status:404});
  if(!allowed.includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:allowed.join(', ')}});
  let origin;
  try{origin=new URL(env.PUBLIC_API_ORIGIN);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/')throw Error();}catch{return Response.json({error:{code:'API_NOT_CONFIGURED'}},{status:503});}
  const headers=new Headers(request.headers);
  for(const key of ['host','origin','referer','cookie','authorization','x-forwarded-for','x-real-ip','cf-connecting-ip'])headers.delete(key);
  const ip=request.headers.get('cf-connecting-ip');if(ip)headers.set('x-forwarded-for',ip);
  try{
    const response=await fetchUpstream(new URL(url.pathname+url.search,origin),{method:request.method,headers,
      ...(['GET','HEAD'].includes(request.method)?{}:{body:await request.arrayBuffer()}),redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(response.status>=300&&response.status<400)return Response.json({error:{code:'API_REDIRECT_REJECTED'}},{status:502});
    if(request.method!=='HEAD'&&!(response.headers.get('content-type')??'').includes('application/json'))throw Error();
    const output=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
    if(response.headers.has('retry-after'))output.set('retry-after',response.headers.get('retry-after'));
    return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers:output});
  }catch{return Response.json({error:{code:'API_UNAVAILABLE'}},{status:502,headers:{'cache-control':'no-store'}});}
}
