import { TripCHome } from '@/features/site/home';
import { homeMetadata } from '@/lib/metadata';
export const dynamic = "force-dynamic";
export const metadata=homeMetadata('vi');
export default function VietnameseHome(){return <TripCHome locale="vi"/>;}
