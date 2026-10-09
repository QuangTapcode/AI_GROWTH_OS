export type SourceType = "PDF" | "Text" | "URL";

export type SourceStatus = "Approved" | "Processing" | "Imported" | "Needs review";

export type SourceCategory =
  | "Company"
  | "Pricing"
  | "FAQ"
  | "Brand"
  | "Policy"
  | "Products"
  | "Services";

export interface KnowledgeSource {
  id: string;
  name: string;
  subtitle: string;
  category: SourceCategory;
  type: SourceType;
  status: SourceStatus;
  added: string;
}

export interface RagChunk {
  id: string;
  name: string;
  text: string;
  locator: string;
  model: string;
}

export interface NewSourcePayload {
  title: string;
  type: SourceType;
  category: SourceCategory;
  url?: string;
  text?: string;
  fileName?: string | null;
}
