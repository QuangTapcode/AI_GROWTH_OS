import { ReviewItem, ReviewQueueStats } from "../types";

export const MOCK_REVIEW_STATS: ReviewQueueStats = {
  pendingCount: 3,
  approvedTodayCount: 12,
  rejectedCount: 1,
};

export const MOCK_REVIEW_ITEMS: ReviewItem[] = [
  {
    id: "rev-1",
    taskId: "#TSK-1842",
    runId: "#RUN-2881",
    title: "SEO Content Opportunities Report",
    version: "v3",
    category: "SEO Report",
    timeAgo: "14m ago",
    createdAt: "Today, 14:29",
    status: "pending",
    statusTag: "Review",
    agent: "Growth Strategy Agent",
    targetCluster: "Luxury Coastal Living",
    targetLocale: "APAC / US Expat",
    latency: "1.42s",
    stagesCompletedText: "Stage 4 of 4 Paused",
    pipelineSteps: [
      {
        stepNumber: 1,
        name: "1. Research",
        description: "Autonomous SERP crawl & competitor void scan",
        status: "completed",
      },
      {
        stepNumber: 2,
        name: "2. Generate",
        description: "Synthesized 3 high-intent cluster schemas",
        status: "completed",
      },
      {
        stepNumber: 3,
        name: "3. Validate",
        description: "Passed 100% brand voice & keyword checks",
        status: "completed",
      },
      {
        stepNumber: 4,
        name: "4. Review Gate",
        description: "Human approval required",
        status: "paused",
      },
    ],
    validations: [
      {
        id: "val-1",
        title: "SEO Validation Passed",
        subtitle: "Intent & SERP void validated",
        passed: true,
      },
      {
        id: "val-2",
        title: "Content Quality Verified",
        subtitle: "Factual grounding & luxury tone",
        passed: true,
      },
      {
        id: "val-3",
        title: "Brand Guardrails Met",
        subtitle: "0 hallucinated rate violations",
        passed: true,
      },
    ],
    executiveSummary:
      "Autonomous retrieval across 14 target competitor domains reveals an aggregate 74% content void for direct luxury villa bookings in Da Nang and Hoi An. High-intent queries centered on private beachfront villa estates and curated culinary retreats remain significantly underserved by standard regional travel guides.",
    topicClusters: [
      {
        id: "tc-a",
        letter: "A",
        title: "Da Nang Private Beachfront Estates vs Boutique Resorts",
        description:
          "High-intent commercial investigation query cluster · Estimated Monthly SV: 18,400",
        serpVoidBadge: "+34% SERP Void",
      },
      {
        id: "tc-b",
        letter: "B",
        title: "Hoi An Culinary Heritage & Private Villa Dining Guides",
        description:
          "Long-tail experiential intent targeting affluent family travelers · Estimated Monthly SV: 12,200",
        serpVoidBadge: "+28% SERP Void",
      },
      {
        id: "tc-c",
        letter: "C",
        title: "Off-Season Coastal Wellness & Seclusion Retreats",
        description:
          "Shoulder-season booking accelerator targeting high-yield remote executives",
        serpVoidBadge: "+19% SERP Void",
      },
    ],
    jsonPayload: {
      reportId: "REP-2026-DN-HA",
      generatedBy: "Growth Strategy Agent v4.12",
      model: "gemini-3.8-flash",
      targetLocales: ["APAC", "US-Expat"],
      metrics: {
        serpCoverageVoid: 0.74,
        estimatedTotalMonthlySV: 48600,
        competitorDomainsCrawled: 14,
        intentConfidenceScore: 0.96,
      },
      recommendations: [
        {
          clusterId: "DN-BEACHFRONT",
          title: "Da Nang Private Beachfront Estates vs Boutique Resorts",
          targetKeyword: "best beachfront villa resort da nang",
          intentCategory: "Commercial Investigation",
          voidPercentage: 0.34,
        },
        {
          clusterId: "HA-CULINARY",
          title: "Hoi An Culinary Heritage & Private Villa Dining Guides",
          targetKeyword: "hoi an private chef luxury villa",
          intentCategory: "Experiential Long-Tail",
          voidPercentage: 0.28,
        },
        {
          clusterId: "WELLNESS-RETREAT",
          title: "Off-Season Coastal Wellness & Seclusion Retreats",
          targetKeyword: "central vietnam executive wellness retreat",
          intentCategory: "High-Yield B2B / Remote",
          voidPercentage: 0.19,
        },
      ],
    },
  },
  {
    id: "rev-2",
    taskId: "#TSK-1839",
    runId: "#RUN-2879",
    title: "Da Nang Destination Content Brief",
    version: "v1",
    category: "Editorial Brief",
    timeAgo: "1h 20m ago",
    createdAt: "Today, 13:20",
    status: "pending",
    statusTag: "Queued",
    agent: "Content Strategy Agent",
    targetCluster: "Culinary & Cultural Excursions",
    targetLocale: "Global Travelers",
    latency: "1.18s",
    stagesCompletedText: "Stage 3 of 4 Paused",
    pipelineSteps: [
      {
        stepNumber: 1,
        name: "1. Keyword Mapping",
        description: "Local search intent mapping for Da Nang foodie trails",
        status: "completed",
      },
      {
        stepNumber: 2,
        name: "2. Brief Synthesis",
        description: "Drafted 5-part luxury food itinerary outline",
        status: "completed",
      },
      {
        stepNumber: 3,
        name: "3. Editorial Check",
        description: "Passed voice tone guidelines and verified citations",
        status: "completed",
      },
      {
        stepNumber: 4,
        name: "4. Review Gate",
        description: "Editorial review required",
        status: "paused",
      },
    ],
    validations: [
      {
        id: "val-1",
        title: "SERP Mapping Passed",
        subtitle: "10 primary keyword anchors placed",
        passed: true,
      },
      {
        id: "val-2",
        title: "Voice Alignment 98%",
        subtitle: "Complies with TripC luxury tone guide",
        passed: true,
      },
      {
        id: "val-3",
        title: "Fact Check Completed",
        subtitle: "Zero unverified restaurant operating hours",
        passed: true,
      },
    ],
    executiveSummary:
      "Editorial blueprint for an experiential 3-day Da Nang epicurean guide. Emphasizes private Michelin-selected street food tours and coastal wine pairing dinners designed for high-net-worth international couples.",
    topicClusters: [
      {
        id: "tc-1",
        letter: "A",
        title: "Michelin Select Dining & Secret Street Food Alleys",
        description: "Curated walking itineraries in Son Tra & Hai Chau districts",
        serpVoidBadge: "+41% Demand",
      },
      {
        id: "tc-2",
        letter: "B",
        title: "Sunset Seafood Pavilions of My Khe Beach",
        description: "Sustainable ocean-to-table dining recommendations",
        serpVoidBadge: "+24% Demand",
      },
    ],
    jsonPayload: {
      briefId: "BRF-DN-FOOD-01",
      wordCountTarget: 2200,
      assignedAuthor: "Editorial Desk",
      primaryKW: "luxury dining da nang vietnam",
    },
  },
  {
    id: "rev-3",
    taskId: "#TSK-1825",
    runId: "#RUN-2864",
    title: "Travel Landing Page Draft",
    version: "v2",
    category: "Landing Page",
    timeAgo: "2h 45m ago",
    createdAt: "Today, 11:45",
    status: "pending",
    statusTag: "Queued",
    agent: "Campaign Gen Agent",
    targetCluster: "Private Eco-Villas & Yachts",
    targetLocale: "North America & Europe",
    latency: "2.05s",
    stagesCompletedText: "Stage 4 of 4 Paused",
    pipelineSteps: [
      {
        stepNumber: 1,
        name: "1. Wireframe Schema",
        description: "Generated responsive Tailwind layout sections",
        status: "completed",
      },
      {
        stepNumber: 2,
        name: "2. Copywriting",
        description: "Value props, hero headline and booking CTA triggers",
        status: "completed",
      },
      {
        stepNumber: 3,
        name: "3. A/B Variants",
        description: "Formulated 2 headline variants for conversion lift",
        status: "completed",
      },
      {
        stepNumber: 4,
        name: "4. Review Gate",
        description: "Design and copy sign-off required",
        status: "paused",
      },
    ],
    validations: [
      {
        id: "val-1",
        title: "Conversion Copy Graded A+",
        subtitle: "Scored 94/100 on readability and persuasion",
        passed: true,
      },
      {
        id: "val-2",
        title: "Accessibility Checked",
        subtitle: "WCAG 2.1 AA compliant color contrast",
        passed: true,
      },
      {
        id: "val-3",
        title: "Schema.org TourReservation",
        subtitle: "Valid structured data schema generated",
        passed: true,
      },
    ],
    executiveSummary:
      "High-converting landing page prototype for the Autumn Luxury Escape campaign. Features dynamic booking widgets, verified traveler testimonials, and interactive villa 360-degree virtual walkthrough embeds.",
    topicClusters: [
      {
        id: "tc-1",
        letter: "A",
        title: "Hero Banner & Instant Villa Availability Finder",
        description: "Frictionless multi-step inquiry flow with calendar picker",
        serpVoidBadge: "+52% CVR Lift",
      },
      {
        id: "tc-2",
        letter: "B",
        title: "All-Inclusive Bespoke Concierge Perks",
        description: "Chauffeur, private chef, and yacht charter add-on upsells",
        serpVoidBadge: "+35% AOV Lift",
      },
    ],
    jsonPayload: {
      landingPageId: "LP-AUTUMN-2026",
      slug: "/luxury-central-vietnam-escapes",
      conversionTarget: 0.048,
    },
  },
];
