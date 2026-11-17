export type SupportedLanguage = "Python" | "C++" | "Java";
export type BugSeverity = "critical" | "high" | "medium" | "low" | "info";
export type ActiveTab = "bugs" | "improvements" | "complexity" | "score" | "diff";

export interface BugFinding { line: string; severity: BugSeverity; title: string; description: string; fix: string; }
export interface ImprovementSuggestion { title: string; category: string; description: string; suggestion: string; }
export interface ComplexityDetail { name: string; line: number; complexity: number; nesting: number; rank: string; }

export interface ReviewResult {
  summary: string;
  bugs: BugFinding[];
  improvements: ImprovementSuggestion[];
  complexity_notes: string;
  overall_score: number;
  improved_code: string;
}

export interface ComplexityResult {
  method: string;
  average_complexity: number;
  max_complexity: number;
  rating: string;
  maintainability_index: number;
  loc: number;
  details: ComplexityDetail[];
}
