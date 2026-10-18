import { ArtifactDeliverable } from "../types";

export const MOCK_ARTIFACTS: ArtifactDeliverable[] = [
  {
    id: "art-1",
    code: "ART-0317",
    title: "SEO Content Opportunities Report",
    version: "v3",
    category: "STRATEGIC REPORT",
    timeAgo: "14m ago",
    status: "Complete",
    statusText: "Complete",
    aiStatusBadge: "AI Generated · Ready for Review",
    workspaceTag: "TripC · Central Vietnam · High-intent SEO",
    agent: "Growth Strategy Agent",
    versionsCount: 3,
    executiveInsight:
      "Three high-intent topic clusters in Central Vietnam reveal a substantial organic traffic opportunity. Competitor pages are heavily diluted with generic OTA listings, leaving bespoke private oceanfront villa seclusion, private culinary residencies, and wellness micro-retreat queries largely underserved.",
    cards: [
      {
        number: "01",
        badge: "High intent",
        badgeType: "intent",
        title: "Destination Comparison & Seclusion Guides",
        description:
          "Da Nang beachfront private estates vs. Hoi An heritage river villas for high-budget travelers debating seclusion vs. culture.",
        volume: "18.4k / mo",
        kdText: "Low KD 34",
      },
      {
        number: "02",
        badge: "Commercial",
        badgeType: "commercial",
        title: "Local Culinary & Private Chef Experiences",
        description:
          "In-villa dining, Michelin-starred private residencies, and organic farm-to-table culinary tours in Quang Nam.",
        volume: "12.1k / mo",
        kdText: "KD 26",
      },
      {
        number: "03",
        badge: "Informational",
        badgeType: "info",
        title: "Off-Season Luxury Retreats & Wellness",
        description:
          "Ayurvedic wellness suites, coastal micro-monsoon retreats, and wellness itineraries across Central Vietnam.",
        volume: "9.6k / mo",
        kdText: "KD 28",
      },
    ],
    pipeline: {
      pipelineId: "PIPE-GROWTH-082",
      completedStagesText: "6/6 stages completed · Human approval required",
      totalRunTime: "Total run: 3.4s autonomous",
      isDeterministic: true,
      nodes: [
        {
          nodeId: "n-1",
          name: "Context",
          status: "Completed",
          tag: "ICP Goals",
          iconType: "check",
        },
        {
          nodeId: "n-2",
          name: "Research",
          status: "Completed",
          tag: "14 SERP URLs",
          iconType: "check",
        },
        {
          nodeId: "n-3",
          name: "Analyze",
          status: "Completed",
          tag: "3 Clusters",
          iconType: "check",
        },
        {
          nodeId: "n-4",
          name: "Generate",
          status: "Selected",
          tag: "Draft v3",
          iconType: "sparkles",
        },
        {
          nodeId: "n-5",
          name: "Validate",
          status: "Completed",
          tag: "100% Score",
          iconType: "check",
        },
        {
          nodeId: "n-6",
          name: "Deliver",
          status: "Requires Review",
          iconType: "gavel",
        },
      ],
      activeNodeText: "NODE 04 · GENERATE",
      activeAgent: "Growth Strategy Agent",
      activeStatusText: "Completed in 0.8s",
      outputPreviewText: "Output: ART-0317 v3 - SEO Content Opportunities Report",
    },
    documentContent: `## Executive Summary & Market Void

Autonomous retrieval across 14 target SERP competitor domains reveals that existing search visibility across Central Vietnam is heavily monopolized by legacy travel aggregator portals (Agoda, Booking, TripAdvisor) with an aggregate 74% content gap for direct luxury bookings. High-intent queries centered on private beachfront villa estates and curated culinary retreats remain significantly underserved.

## Key Content Opportunities

1. Destination Comparison & Seclusion Guides
- Primary Keyword Cluster: "Da Nang private beachfront estates vs boutique resorts"
- Target Intent: High-intent Commercial Investigation
- Monthly Search Volume: 18.4k / mo (KD: 34)
- SERP Void: Zero comprehensive editorial comparisons evaluating private infinity pool villas against 5-star hotel enclaves.`,
    jsonPayload: {
      artifactId: "ART-0317",
      version: 3,
      domain: "tripc.vn",
      region: "Central Vietnam",
      marketVoidPercentage: 74,
      totalEstimatedVolume: 40100,
      targetCompetitors: 14,
    },
  },
  {
    id: "art-2",
    code: "ART-0318",
    title: "Vietnam Travel Content Brief",
    version: "v1",
    category: "CONTENT BRIEF",
    timeAgo: "1h ago",
    status: "In progress",
    statusText: "In progress",
    aiStatusBadge: "AI Generated · Drafting in Progress",
    workspaceTag: "TripC · Culinary & Heritage Expeditions",
    agent: "Content Strategy Agent",
    versionsCount: 1,
    executiveInsight:
      "Editorial guidelines prioritizing experiential storytelling around Central Vietnam's micro-seasons and craft villages, engineered for long-tail search intent capture.",
    cards: [
      {
        number: "01",
        badge: "Storytelling",
        badgeType: "intent",
        title: "Artisan Villages of the Thu Bon River",
        description: "Silk making, pottery, and organic herb gardens of Tra Que village.",
        volume: "8.2k / mo",
        kdText: "Low KD 22",
      },
      {
        number: "02",
        badge: "Commercial",
        badgeType: "commercial",
        title: "Exclusive Private Longtail River Cruises",
        description: "Champagne sunset cruises avoiding tourist traffic bottlenecks.",
        volume: "5.4k / mo",
        kdText: "KD 19",
      },
      {
        number: "03",
        badge: "Informational",
        badgeType: "info",
        title: "Boutique Eco-Resort Sustainability Audits",
        description: "Certified carbon-neutral stays for environmentally conscious luxury travelers.",
        volume: "3.8k / mo",
        kdText: "KD 15",
      },
    ],
    pipeline: {
      pipelineId: "PIPE-CONTENT-019",
      completedStagesText: "3/6 stages completed · In progress",
      totalRunTime: "Total run: 1.8s autonomous",
      isDeterministic: true,
      nodes: [
        { nodeId: "n-1", name: "Context", status: "Completed", iconType: "check" },
        { nodeId: "n-2", name: "Research", status: "Completed", iconType: "check" },
        { nodeId: "n-3", name: "Analyze", status: "Selected", iconType: "sparkles" },
        { nodeId: "n-4", name: "Generate", status: "Queued", iconType: "sparkles" },
        { nodeId: "n-5", name: "Validate", status: "Queued", iconType: "check" },
        { nodeId: "n-6", name: "Deliver", status: "Queued", iconType: "gavel" },
      ],
      activeNodeText: "NODE 03 · ANALYZE",
      activeAgent: "Content Strategy Agent",
      activeStatusText: "Running analysis...",
      outputPreviewText: "Draft: ART-0318 v1 - Vietnam Travel Content Brief",
    },
    documentContent: `## Content Brief: Central Vietnam Culinary & Cultural Odyssey

Primary Objective: Establish TripC as the authoritative voice for discerning culinary travelers.

- Focus: Secret street food gems curated by Michelin inspectors.
- Word count: 2,500 words.
- Tone: Sophisticated, immersive, culturally grounded.`,
  },
  {
    id: "art-3",
    code: "ART-0315",
    title: "Destination Landing Page Recommendations",
    version: "v2",
    category: "PAGE BLUEPRINT",
    timeAgo: "3h ago",
    status: "Validated",
    statusText: "Validated",
    aiStatusBadge: "AI Generated · SEO Validated",
    workspaceTag: "TripC · Conversion Architecture",
    agent: "SEO Agent",
    versionsCount: 2,
    executiveInsight:
      "Wireframe blueprints incorporating programmatic Schema.org TourReservation markup, dynamic calendar availability widgets, and trust signals.",
    cards: [
      {
        number: "01",
        badge: "Architecture",
        badgeType: "intent",
        title: "Dynamic Sticky Header & Instant Inquiry CTAs",
        description: "Zero-friction booking forms with mobile-optimized date pickers.",
        volume: "24.5k / mo",
        kdText: "KD 42",
      },
      {
        number: "02",
        badge: "Social Proof",
        badgeType: "commercial",
        title: "Verified Private Guest Video Reviews",
        description: "Contextual social proof embedded adjacent to pricing tables.",
        volume: "14.2k / mo",
        kdText: "KD 31",
      },
      {
        number: "03",
        badge: "Technical",
        badgeType: "info",
        title: "Full JSON-LD VacationRental Schema Integration",
        description: "Google Rich Snippets validation passing with 100% compliance.",
        volume: "—",
        kdText: "Core Tech",
      },
    ],
    pipeline: {
      pipelineId: "PIPE-SCHEMA-044",
      completedStagesText: "5/6 stages completed · Validated",
      totalRunTime: "Total run: 2.1s autonomous",
      isDeterministic: true,
      nodes: [
        { nodeId: "n-1", name: "Context", status: "Completed", iconType: "check" },
        { nodeId: "n-2", name: "Research", status: "Completed", iconType: "check" },
        { nodeId: "n-3", name: "Analyze", status: "Completed", iconType: "check" },
        { nodeId: "n-4", name: "Generate", status: "Completed", iconType: "sparkles" },
        { nodeId: "n-5", name: "Validate", status: "Selected", iconType: "check" },
        { nodeId: "n-6", name: "Deliver", status: "Requires Review", iconType: "gavel" },
      ],
      activeNodeText: "NODE 05 · VALIDATE",
      activeAgent: "SEO Agent",
      activeStatusText: "Validated in 0.5s",
      outputPreviewText: "Blueprint: ART-0315 v2 - Landing Page Recommendations",
    },
    documentContent: `## Landing Page Conversion Architecture

1. Hero Section: Direct villa visual with instant availability check.
2. Amenities Grid: Private infinity pool, dedicated butler, airport transfer.
3. Pricing & Booking Guarantee: Best rate guarantee with flexible cancellations.`,
  },
  {
    id: "art-4",
    code: "ART-0312",
    title: "Internal Linking & Topic Cluster Plan",
    version: "v4",
    category: "ARCHITECTURE",
    timeAgo: "Yesterday",
    status: "Queued",
    statusText: "Queued",
    aiStatusBadge: "AI Generated · Queued for Next Run",
    workspaceTag: "TripC · Information Architecture",
    agent: "Content Agent",
    versionsCount: 4,
    executiveInsight:
      "Hierarchical PageRank distribution model funneling search equity from high-volume travel guides directly into high-converting villa reservation landing pages.",
    cards: [
      {
        number: "01",
        badge: "PageRank Flow",
        badgeType: "intent",
        title: "Hub-and-Spoke Anchor Text Optimization",
        description: "Contextual anchor link insertion strategy across 48 existing guides.",
        volume: "32.0k / mo",
        kdText: "High Impact",
      },
      {
        number: "02",
        badge: "Breadcrumbs",
        badgeType: "commercial",
        title: "Semantic Breadcrumb Structure",
        description: "Central Vietnam > Da Nang > Private Luxury Villas taxonomy.",
        volume: "—",
        kdText: "Internal",
      },
      {
        number: "03",
        badge: "Related Posts",
        badgeType: "info",
        title: "Algorithmic Related Experience Carousel",
        description: "Dynamic recommendation carousel matching reader's travel style.",
        volume: "11.5k / mo",
        kdText: "KD 18",
      },
    ],
    pipeline: {
      pipelineId: "PIPE-LINKING-011",
      completedStagesText: "0/6 stages completed · Scheduled",
      totalRunTime: "Scheduled for next cycle",
      isDeterministic: true,
      nodes: [
        { nodeId: "n-1", name: "Context", status: "Queued", iconType: "check" },
        { nodeId: "n-2", name: "Research", status: "Queued", iconType: "check" },
        { nodeId: "n-3", name: "Analyze", status: "Queued", iconType: "check" },
        { nodeId: "n-4", name: "Generate", status: "Queued", iconType: "sparkles" },
        { nodeId: "n-5", name: "Validate", status: "Queued", iconType: "check" },
        { nodeId: "n-6", name: "Deliver", status: "Queued", iconType: "gavel" },
      ],
      activeNodeText: "NODE 01 · CONTEXT",
      activeAgent: "Content Agent",
      activeStatusText: "Queued",
      outputPreviewText: "Matrix: ART-0312 v4 - Internal Linking Plan",
    },
    documentContent: `## Internal Linking & Pillar Architecture

Pillar Page: Central Vietnam Luxury Travel Guide
Spoke 1: Private Villa Stays in Da Nang
Spoke 2: Hoi An Historic Riverside Villas
Spoke 3: Hue Imperial Heritage Excursions`,
  },
];
