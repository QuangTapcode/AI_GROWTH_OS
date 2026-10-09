export interface WorkspaceFormData {
  workspaceName: string;
  website: string;
  primaryLanguage: string;
  organization: string;
}

export interface BusinessFormData {
  industry: string;
  overview: string;
}

export interface BrandFormData {
  brandVoice: string;
  tone: string;
  guidelines: string;
  forbiddenTerms: string[];
}
