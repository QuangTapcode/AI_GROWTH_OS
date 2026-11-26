import React from 'react';
import type { Metadata } from 'next';
import OfficeClient from '@/features/office/OfficeClient';

export const metadata: Metadata = {
  title: 'AI Autonomous 3D Office 2026 | AI Growth OS',
  description: 'Không gian văn phòng 3D tương tác của 8 Autonomous AI Agents',
};

export default function OfficePage() {
  return <OfficeClient />;
}
