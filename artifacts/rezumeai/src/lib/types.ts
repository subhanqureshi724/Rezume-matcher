export type ParsedResume = {
  name: string; email: string; phone: string; linkedin: string;
  skills: string[]; education: string[]; experience: string[];
  certifications: string[]; projects: string[]; rawText: string;
  formattingIssues: string[]; formatInspectionAvailable: boolean;
};
export type AtsBreakdown = {
  keywordCoverage: number;
  sectionHeaders: number;
  formatting: number;
  contactInfo: number;
  resumeQuality: number;
};
export type Analysis = {
  matchScore: number; semanticScore: number; keywordScore: number;
  matchedKeywords: string[]; missingKeywords: string[]; weakKeywords: string[];
  atsScore: number; atsBreakdown: AtsBreakdown; issues: string[]; suggestions: string[];
};
export type ResumeDraft = {
  name: string; email: string; phone: string; linkedin: string;
  summary: string; skills: string[]; education: string[];
  experience: string[]; certifications: string[]; projects: string[];
};