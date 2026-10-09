import type {
  ProductItem,
  ServiceItem,
  AudienceData,
  LocationItem,
  CompetitorItem,
  BrandContextData,
  BusinessContextData,
} from "./types";

export const INITIAL_BUSINESS: BusinessContextData = {
  industry: "Travel & Hospitality",
  overview:
    "TripC is a travel and hospitality platform focused on helping international visitors discover local experiences, services and trusted businesses in Da Nang.",
};

export const INITIAL_PRODUCTS: ProductItem[] = [
  {
    id: "p-1",
    type: "Product",
    price: "From $25",
    title: "TripC Local Experience Pass",
    description: "Access curated local experiences and activities across Da Nang.",
    usps: ["Local recommendations", "Easy booking", "Verified partners"],
  },
];

export const INITIAL_SERVICES: ServiceItem[] = [
  {
    id: "s-1",
    type: "Service",
    title: "Local tour booking",
    description: "Book curated tours and experiences with local providers.",
    targetPersona: "International travelers staying in Da Nang",
  },
];

export const INITIAL_AUDIENCE: AudienceData = {
  title: "Expats & Nomads in Da Nang",
  demographics: "International residents and digital nomads, primarily 25–45.",
  painPoints: [
    "Finding trustworthy local services",
    "Discovering relevant experiences",
    "Understanding local options",
  ],
  interests: [
    "Travel",
    "Food",
    "Local experiences",
    "Remote work",
    "Lifestyle",
  ],
};

export const INITIAL_LOCATIONS: LocationItem[] = [
  { id: "loc-1", name: "Da Nang, Ngu Hanh Son, Vietnam", isPrimary: true },
  { id: "loc-2", name: "Da Nang, Son Tra, Vietnam", isPrimary: false },
];

export const INITIAL_COMPETITORS: CompetitorItem[] = [
  {
    id: "c-1",
    name: "Klook",
    url: "klook.com",
    description:
      "Large international travel marketplace with strong activity discovery and booking capabilities.",
  },
  {
    id: "c-2",
    name: "Traveloka",
    url: "traveloka.com",
    description:
      "Major travel platform with strong regional presence and broad travel services.",
  },
];

export const INITIAL_BRAND: BrandContextData = {
  brandVoice: "Helpful local expert, modern, trustworthy",
  tone: "Informative and welcoming",
  guidelines:
    "Use clear and practical language. Prioritize useful local information and avoid exaggerated claims. Content should feel trustworthy, approachable and helpful to international visitors.",
  forbiddenTerms: [
    '"Cheap"',
    '"Guaranteed"',
    '"Best in Da Nang"',
    '"100% authentic"',
  ],
};
