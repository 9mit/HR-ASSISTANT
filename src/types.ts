export interface ScoreFactor {
  factor: string;
  weight: number;
  raw_score: number;
  contribution: number;
  explanation: string;
}

export interface CounterfactualLever {
  id: string;
  label: string;
  category: string;
  current_score: number;
  predicted_score: number;
  current_decision: string;
  predicted_decision: string;
  delta: number;
  explanation: string;
}

export interface CandidateAudit {
  overview: string;
  decision: string;
  scoring_version: string;
  anonymization: string[];
  excluded_inputs: string[];
  matched_skills: string[];
  factor_contributions: ScoreFactor[];
  duplicate_cluster: string[];
  salary_gate: string;
  notes: string[];
  log_entries: string[];
}

export interface CandidateCommunication {
  subject: string;
  body: string;
  status: string;
}

export interface GitHubRepo {
  name: string;
  description?: string | null;
  url?: string | null;
  stars: number;
  forks: number;
  commit_frequency: number;
  primary_language?: string | null;
  readme_quality_score: number;
}

export interface GitHubAnalysis {
  profile_url?: string | null;
  success: boolean;
  scrape_method: string;
  fallback_url?: string | null;
  note?: string | null;
  repos: GitHubRepo[];
  primary_languages: string[];
  project_descriptions: string[];
  aggregate_project_quality: number;
}

export interface LocalModelOption {
  id: string;
  provider: string;
  label: string;
  model_name: string;
  availability: string;
  status: 'ready' | 'missing_key' | 'error';
  endpoint?: string | null;
  description?: string | null;
  supports_structured_output: boolean;
}

export interface LocalModelCatalogResponse {
  default_model_id: string;
  models: LocalModelOption[];
}

export interface Candidate {
  id: string;
  alias: string;
  name?: string | null;
  email?: string | null;
  education?: string | null;
  experience_years?: number | null;
  experience_summary?: string | null;
  skills: string[];
  certifications: string[];
  github_url?: string | null;
  portfolio_url?: string | null;
  salary_expectation?: number | null;
  salary_status: string;
  score: number;
  decision: string;
  summary: string;
  missing_info_flags: string[];
  interview_questions: string[];
  communication?: CandidateCommunication | null;
  audit?: CandidateAudit | null;
  counterfactuals?: CounterfactualLever[];
  github?: GitHubAnalysis | null;
  file_name: string;
  stored_file?: string | null;
  error?: string | null;
  merged_duplicate_ids: string[];
  notes: string;
}

export interface SalaryRange {
  minimum: number;
  maximum: number;
  currency: string;
}

export interface BatchSummary {
  role: string;
  salary_range: SalaryRange;
  total_files: number;
  processed_candidates: number;
  ranked_candidates: number;
  excluded_by_salary: number;
  missing_info: number;
  duplicates_merged: number;
  model_backend: string;
  selected_model_id?: string | null;
  selected_model_label?: string | null;
  generated_at: string;
  fairness_highlights: string[];
}

export interface ProcessResponse {
  batch_id: string;
  summary: BatchSummary;
  candidates: Candidate[];
}

/** Ephemeral API keys supplied by the HR user per-session. Never stored. */
export interface EphemeralKeys {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
}

export interface EmailStatus {
  configured: boolean;
  provider: 'resend' | 'smtp' | 'none';
  server?: string;
  port?: number;
  from_email: string | null;
  note: string;
}
