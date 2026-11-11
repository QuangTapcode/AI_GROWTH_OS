import { TripCHome } from '@/features/site/home';
import { homeMetadata } from '@/lib/metadata';
export const dynamic = "force-dynamic";
export const metadata=homeMetadata('en');
export default function HomePage(){return <TripCHome locale="en"/>;}
