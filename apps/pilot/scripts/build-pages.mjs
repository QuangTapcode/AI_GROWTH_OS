import { cpSync,existsSync,mkdirSync,readFileSync,readdirSync,realpathSync,rmSync,symlinkSync,writeFileSync } from 'node:fs';
import { dirname,join,resolve,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),repo=resolve(root,'../..');
const require=createRequire(join(root,'package.json'));
require('@next/env').loadEnvConfig(root,false);
const preview=process.env.PILOT_ALLOW_LOCAL_PREVIEW==='true';
const siteId=process.env.NEXT_PUBLIC_SITE_ID??'tripc-pilot';
if(!/^[a-z0-9-]{1,100}$/.test(siteId))throw Error('NEXT_PUBLIC_SITE_ID must contain lowercase letters, numbers and hyphens');
function publicOrigin(value,label){
  let url;try{url=new URL(value);}catch{throw Error(`${label} must be an absolute URL`);}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||(!preview&&(url.protocol!=='https:'||local)))throw Error(`${label} must be a public HTTPS origin`);
  if(!['http:','https:'].includes(url.protocol))throw Error(`${label} must be HTTP(S)`);
  return url.origin;
}
const siteOrigin=publicOrigin(process.env.NEXT_PUBLIC_SITE_URL,'NEXT_PUBLIC_SITE_URL');
const apiOrigin=publicOrigin(process.env.PILOT_API_ORIGIN,'PILOT_API_ORIGIN');
const work=join(repo,'infra/staging/.runtime/tripc-pages-build');mkdirSync(work,{recursive:true});
const realWork=realpathSync(work),realRepo=realpathSync(repo);
if(!realWork.startsWith(realRepo+sep))throw Error('Build workspace resolves outside the repository');
// Only generated folders within this exact workspace are replaced. No env, source or active build is removed.
for(const name of ['src','public','.next','out']){
  const target=resolve(work,name);if(!target.startsWith(resolve(work)+sep))throw Error('Unsafe build directory');
  if(existsSync(target)&&!realpathSync(target).startsWith(realWork+sep))throw Error('Generated directory resolves outside the build workspace');
  rmSync(target,{recursive:true,force:true});
}
for(const name of ['src','public','package.json','package-lock.json','tsconfig.json','next-env.d.ts'])if(existsSync(join(root,name)))cpSync(join(root,name),join(work,name),{recursive:true});
const dependencies=join(work,'node_modules');
if(!existsSync(dependencies))symlinkSync(join(root,'node_modules'),dependencies,'junction');
else if(realpathSync(dependencies)!==realpathSync(join(root,'node_modules')))throw Error('Unexpected build dependencies');
function files(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(join(directory,item.name)):[join(directory,item.name)]);}
for(const path of files(join(work,'src'))){
  if(!/\.tsx?$/.test(path))continue;
  let source=readFileSync(path,'utf8').replace(/export const dynamic = "force-dynamic";/g,'export const dynamic = "force-static";');
  if(path.includes('[slug]')&&path.endsWith('page.tsx'))source+='\nexport const dynamicParams = false;\n';
  writeFileSync(path,source);
}
// Next export requires a concrete parameter for each dynamic route. An empty
// publication has no article routes: omit only those copied route directories.
const catalogResponse=await fetch(`${apiOrigin}/public/v1/sites/${siteId}/posts`,{signal:AbortSignal.timeout(10000)});
if(!catalogResponse.ok)throw Error('Published content API is unavailable');
const catalog=await catalogResponse.json();
const initialPosts=Array.isArray(catalog)?catalog:catalog.items??catalog.posts;
if(!Array.isArray(initialPosts))throw Error('Invalid public content response');
if(initialPosts.length===0&&!catalog.next_cursor){
  for(const relative of ['src/app/posts/[slug]','src/app/vi/posts/[slug]']){
    const target=join(work,relative);
    if(existsSync(target)){
      if(!realpathSync(target).startsWith(realWork+sep))throw Error('Unsafe generated article directory');
      rmSync(target,{recursive:true});
    }
  }
}
writeFileSync(join(work,'next.config.ts'),`export default {output:'export',trailingSlash:true,images:{unoptimized:true},experimental:{cpus:1}};\n`);
const child=spawnSync(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:work,stdio:'inherit',env:{...process.env,
  PILOT_EXPORT:'true',PILOT_BUILD_API_BASE_URL:`${apiOrigin}/public/v1/sites/${siteId}`,NEXT_PUBLIC_API_BASE_URL:'/v1',NEXT_PUBLIC_SITE_URL:siteOrigin,NEXT_PUBLIC_SITE_ID:siteId,NEXT_BUILD_DIR:'.next',NEXT_TELEMETRY_DISABLED:'1'}});
if(child.status!==0)throw Error('Cloudflare Pages export failed');
const out=join(work,'out');
for(const path of files(out).filter(p=>p.endsWith('.html')&&p.startsWith(join(out,'vi')+sep)))writeFileSync(path,readFileSync(path,'utf8').replace('<html lang="en"','<html lang="vi"'));
const proxy=readFileSync(join(repo,'infra/staging/tripc-pages/public-proxy.mjs'),'utf8');
writeFileSync(join(out,'_worker.js'),proxy+`\nexport default {fetch(request,env){return proxyPilotRequest(request,{...env,PUBLIC_SITE_ID:${JSON.stringify(siteId)}});}};\n`);
writeFileSync(join(out,'_routes.json'),JSON.stringify({version:1,include:['/public/v1/sites/*'],exclude:[]}));
writeFileSync(join(out,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
console.log(`\nPages build ready: ${out}\nSet PUBLIC_API_ORIGIN=${apiOrigin} in the Cloudflare Pages project environment.\nNo deployment was performed.`);
