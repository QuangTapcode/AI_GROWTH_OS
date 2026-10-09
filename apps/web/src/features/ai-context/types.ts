export interface ProductItem {
  id: string;
  type: "Product";
  price: string;
  title: string;
  description: string;
  usps: string[];
}

export interface ServiceItem {
  id: string;
  type: "Service";
  title: string;
  description: string;
  targetPersona: string;
}

export interface LocationItem {
  id: string;
  name: string;
  isPrimary: boolean;
}

export interface CompetitorItem {
  id: string;
  name: string;
  url: string;
  description: string;
}

export interface AudienceData {
  title: string;
  demographics: string;
  painPoints: string[];
  interests: string[];
}

export interface BrandContextData {
  brandVoice: string;
  tone: string;
  guidelines: string;
  forbiddenTerms: string[];
}

export interface BusinessContextData {
  industry: string;
  overview: string;
}
