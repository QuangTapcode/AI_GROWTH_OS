/**
 * Manual pack generator for social channels when live publishing is not available
 * (per MY-02 connector spike decision: FB/IG/GA4/GSC/Meta Ads missing credentials).
 *
 * Independent of other pending tasks. Produces a labeled manual pack that editors
 * can copy-paste to post manually. Ready for MY-04 integration.
 */


export interface ManualPack {
  channel: 'Facebook' | 'TikTok' | 'Instagram';
  contentId: string;
  title: string;
  bodyText: string;
  cta?: string;
  imageRef?: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  label: 'manual-pack'; // UI shows this label to distinguish from live publish
  createdAt: Date;
  instructions: string[];
}

export function generateManualPack(
  job: {
    contentId: string;
    workspaceId?: string;
    workspace_id?: string;
    title?: string;
    bodyMarkdown?: string;
    metaTitle?: string;
    metaDescription?: string;
    slug?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  },
  channel: 'Facebook' | 'TikTok' | 'Instagram'
): ManualPack {
  const workspaceId = job.workspaceId ?? job.workspace_id ?? 'unknown';
  const utmSource = job.utmSource || 'social';
  const utmMedium = job.utmMedium || channel.toLowerCase();
  const utmCampaign = job.utmCampaign || 'manual-pack';

  const instructions: string[] = [
    `1. Open ${channel} business page for workspace ${workspaceId}.`,
    `2. Copy the caption below and paste into a new post.`,
    `3. Attach the image asset if provided (imageRef: ${job.bodyMarkdown?.includes('![') ? 'embedded' : 'missing'}).`,
    `4. Publish manually and record the external post URL.`,
    `5. Return to dashboard and mark job as Published with the external post ID.`,
  ];

  return {
    channel,
    contentId: job.contentId,
    title: job.metaTitle || job.title || 'Untitled',
    bodyText: job.bodyMarkdown || '',
    cta: undefined,
    imageRef: undefined,
    utmSource,
    utmMedium,
    utmCampaign,
    label: 'manual-pack',
    createdAt: new Date(),
    instructions,
  };
}

export function generateManualPacks(
  job: {
    contentId: string;
    workspaceId?: string;
    workspace_id?: string;
    title?: string;
    bodyMarkdown?: string;
    metaTitle?: string;
    metaDescription?: string;
    slug?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  },
  channels: ('Facebook' | 'TikTok' | 'Instagram')[]
): ManualPack[] {
  return channels.map((channel) => generateManualPack(job, channel));
}
