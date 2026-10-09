export interface WorkspaceItem {
  id: string;
  name: string;
  type: string;
  website: string;
  primaryLanguage: string;
  organization: string;
  industry: string;
  overview: string;
  brandVoice: string;
  tone: string;
  guidelines: string;
  forbiddenTerms: string[];
}

export const SAMPLE_WORKSPACES: WorkspaceItem[] = [
  {
    id: "tripc-danang",
    name: "TripC Da Nang",
    type: "Workspace",
    website: "tripc.vn",
    primaryLanguage: "English",
    organization: "TripC Global",
    industry: "Travel & Hospitality",
    overview:
      "TripC is a travel and hospitality platform focused on helping international visitors discover local experiences, services and trusted businesses in Da Nang.",
    brandVoice: "Helpful local expert, modern, trustworthy",
    tone: "Informative and welcoming",
    guidelines:
      "Use clear and practical language. Prioritize useful local information and avoid exaggerated claims. Content should feel trustworthy, approachable and helpful to international visitors.",
    forbiddenTerms: ["Cheap", "Guaranteed", "Best in Da Nang", "100% authentic"],
  },
  {
    id: "tripc-saigon",
    name: "TripC Sai Gon",
    type: "Workspace",
    website: "saigon.tripc.vn",
    primaryLanguage: "English",
    organization: "TripC Global",
    industry: "Urban Tourism & Lifestyle",
    overview:
      "TripC Sai Gon delivers curated lifestyle guides, specialty coffee spots, coworking spaces, and boutique stay discoveries for digital nomads and expat travelers in Ho Chi Minh City.",
    brandVoice: "Vibrant urban explorer, modern, savvy",
    tone: "Energetic, stylish and authentic",
    guidelines:
      "Highlight distinctive urban culture, authentic neighborhood insights, and quality service standards. Avoid clichés and unsubstantiated superlatives.",
    forbiddenTerms: ["Cheapest", "Number 1 in Saigon", "Top 1 guaranteed", "Crazy deals"],
  },
  {
    id: "ecostay-vietnam",
    name: "EcoStay Vietnam",
    type: "Workspace",
    website: "ecostay.vn",
    primaryLanguage: "English",
    organization: "EcoStay Hospitality",
    industry: "Sustainable Tourism & Eco-Resorts",
    overview:
      "EcoStay Vietnam connects conscious travelers with eco-certified retreats, organic farm stays, and zero-waste hospitality operators throughout Vietnam.",
    brandVoice: "Conscious explorer, serene, eco-authentic",
    tone: "Inspiring, calm and mindful",
    guidelines:
      "Focus on real environmental impact, community heritage, and mindful leisure. Never use misleading greenwashing claims or false certifications.",
    forbiddenTerms: ["100% Green", "Zero impact guaranteed", "Eco luxury cheap", "Certified greenest"],
  },
];
