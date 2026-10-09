import type { KnowledgeSource, RagChunk } from "./types";

export function getSourceRagChunks(source: KnowledgeSource): RagChunk[] {
  // TripC company overview
  if (source.name.toLowerCase().includes("company overview")) {
    return [
      {
        id: "c-1",
        name: "Chunk 01",
        text: '"TripC is a travel and hospitality platform focused on helping international visitors discover local experiences, services and trusted businesses in Da Nang."',
        locator: "p. 1, § 2",
        model: "embeddinggemma",
      },
      {
        id: "c-2",
        name: "Chunk 02",
        text: '"Core operations cover premium tour facilitation, concierge booking for verified hotels and restaurants, and AI-assisted personalized itineraries."',
        locator: "p. 1, § 3",
        model: "embeddinggemma",
      },
    ];
  }

  // Pricing
  if (source.name.toLowerCase().includes("pricing") || source.category === "Pricing") {
    return [
      {
        id: "c-1",
        name: "Chunk 01",
        text: '"TripC commission rates are structured at 12% for verified tour operators and 8% for boutique hotel partners with quarterly volume rebates."',
        locator: "p. 1, § 1",
        model: "embeddinggemma",
      },
      {
        id: "c-2",
        name: "Chunk 02",
        text: '"Seasonal promotional discounts and bundled Da Nang passes are subsidized up to 5% by the TripC growth co-marketing budget."',
        locator: "p. 2, § 3",
        model: "embeddinggemma",
      },
    ];
  }

  // FAQ
  if (source.name.toLowerCase().includes("faq") || source.category === "FAQ") {
    return [
      {
        id: "c-1",
        name: "Chunk 01",
        text: '"Q: How does TripC AI retrieve recommendations? A: User queries are matched against indexed local knowledge embeddings with hybrid keyword reranking."',
        locator: "https://tripc.vn/faq#search",
        model: "embeddinggemma",
      },
      {
        id: "c-2",
        name: "Chunk 02",
        text: '"Q: Can international guests pay in foreign currencies? A: Multi-currency conversion is handled dynamically via Stripe and VNPay checkout."',
        locator: "https://tripc.vn/faq#payment",
        model: "embeddinggemma",
      },
    ];
  }

  // Brand
  if (source.name.toLowerCase().includes("brand") || source.category === "Brand") {
    return [
      {
        id: "c-1",
        name: "Chunk 01",
        text: '"Brand tone: Warm, authentic, deeply knowledgeable about Central Vietnam, and enthusiastic without being overly promotional."',
        locator: "Tone of Voice, § 1",
        model: "embeddinggemma",
      },
      {
        id: "c-2",
        name: "Chunk 02",
        text: '"Primary brand colors: Deep Slate (#0f172a), Azure Growth (#2563eb), and Emerald Emerald (#10b981) for verified partner badges."',
        locator: "Color Guide, § 2",
        model: "embeddinggemma",
      },
    ];
  }

  // Policy
  if (source.name.toLowerCase().includes("policy") || source.category === "Policy") {
    return [
      {
        id: "c-1",
        name: "Chunk 01",
        text: '"Cancellations submitted more than 48 hours prior to scheduled departure receive a 100% refund minus payment processing fees."',
        locator: "p. 1, § 3",
        model: "embeddinggemma",
      },
      {
        id: "c-2",
        name: "Chunk 02",
        text: '"Severe weather advisories issued by Da Nang port authorities trigger automatic free rescheduling or instant credit refund vouchers."',
        locator: "p. 2, § 1",
        model: "embeddinggemma",
      },
    ];
  }

  // Default / dynamic for any other sources (including newly added files)
  return [
    {
      id: "c-1",
      name: "Chunk 01",
      text: `"TripC AI Knowledge Base: Ingested segment for ${source.name}. Contains primary business concepts, keywords, and operational guidance."`,
      locator: source.type === "URL" ? `${source.name}#section-1` : "p. 1, § 1",
      model: "embeddinggemma",
    },
    {
      id: "c-2",
      name: "Chunk 02",
      text: `"Semantic vectors optimized for AI customer assistance, trip curation, and merchant discovery under the ${source.category} category."`,
      locator: source.type === "URL" ? `${source.name}#section-2` : "p. 1, § 2",
      model: "embeddinggemma",
    },
  ];
}
