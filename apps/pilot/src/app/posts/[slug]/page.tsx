import { TripCPost,guideMetadata,guideParams } from '@/features/site/post';
export const dynamic = "force-dynamic";
type Props={params:Promise<{slug:string}>};
export async function generateStaticParams(){return guideParams();}
export async function generateMetadata({params}:Props){return guideMetadata((await params).slug);}
export default async function Page({params}:Props){return <TripCPost slug={(await params).slug} locale="en"/>;}
