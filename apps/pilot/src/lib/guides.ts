export type Category='housing'|'work'|'life'|'travel';
export type GuideCard={slug:string;title:string;description:string;published_at:string;category:Category;minutes:number;image?:string};
export function safeImage(value?:string):string|undefined{
  if(!value)return undefined;
  if(value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\'))return value;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}
}
export function guideCategory(title:string):Category{
  if(/hous|rent|home|neighbou|apartment|nhà|thuê|căn hộ/i.test(title))return 'housing';
  if(/work|office|nomad|việc|văn phòng/i.test(title))return 'work';
  if(/travel|visit|trip|beach|tour|du lịch|biển|khám phá/i.test(title))return 'travel';
  return 'life';
}
export function guideCard(post:{slug:string;title:string;body:string;published_at:string;meta:{description?:string;og_image?:string}}):GuideCard{
  return {slug:post.slug,title:post.title,description:post.meta.description??'',published_at:post.published_at,image:safeImage(post.meta.og_image),
    category:guideCategory(post.title),minutes:Math.max(1,Math.ceil(post.body.split(/\s+/).filter(Boolean).length/200))};
}
export function filterGuides(posts:GuideCard[],query:string,category:Category|'all'){
  const normalize=(s:string)=>s.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
  const words=normalize(query.trim()).split(/\s+/).filter(Boolean);
  return posts.filter(p=>(category==='all'||p.category===category)&&words.every(w=>normalize(`${p.title} ${p.description}`).includes(w)));
}
