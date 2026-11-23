import { NextRequest,NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { answerPublicChat,boundedChat,generatePublicReply,chatInput } from '@/modules/community/publicChat';
import { listPublishedPosts } from '@/modules/publicContent/service';
import { globalPublicContentRepo } from '@/lib/public-service';
export async function POST(req:NextRequest,{params}:{params:{site_id:string}}){
  const headers={'Cache-Control':'no-store'};
  try{
    const text=await req.text();if(text.length>16000)return NextResponse.json({error:{code:'MESSAGE_TOO_LARGE'}},{status:413,headers});
    let body;try{body=JSON.parse(text);}catch{return NextResponse.json({error:{code:'INVALID_MESSAGE'}},{status:422,headers});}
    if(!chatInput.safeParse(body).success)return NextResponse.json({error:{code:'INVALID_MESSAGE'}},{status:422,headers});
    const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'local';
    const identity=createHash('sha256').update(`${params.site_id}:${ip}`).digest('hex');
    const result=await boundedChat(identity,()=>answerPublicChat(params.site_id,body,{posts:site=>listPublishedPosts({repo:globalPublicContentRepo},site),generate:generatePublicReply}));
    return NextResponse.json(result,{headers});
  }catch(error){const code=error instanceof Error?error.message:'AI_UNAVAILABLE';const status=code==='SITE_NOT_FOUND'?404:code==='AI_RATE_LIMIT'?429:503;return NextResponse.json({error:{code:status===404?'SITE_NOT_FOUND':status===429?'AI_RATE_LIMIT':'AI_UNAVAILABLE'}},{status,headers:{...headers,...(status===429?{'Retry-After':'60'}:{})}});}
}
