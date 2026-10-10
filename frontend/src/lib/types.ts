export type ExperienceLevel = "Beginner" | "Intermediate" | "Advanced";
export type Difficulty = "Easy" | "Medium" | "Hard";
export type InterviewType = "Technical" | "HR" | "Behavioral" | "Personality" | "Domain-Specific" | "Custom";

export interface User {
  id: number;
  email: string;
  full_name: string;
  headline: string;
  experience_level: ExperienceLevel;
  skills: string[];
  target_roles: string[];
  learning_goals: string[];
  preferred_language: string;
  streak_count: number;
  created_at: string;
}

export interface ResumeParsed {
  summary: string;
  skills: string[];
  experience: string[];
  education: string[];
  projects: string[];
}

export interface Resume {
  id: number;
  filename: string;
  size_bytes: number;
  parsed: ResumeParsed | null;
  parse_error: string | null;
  created_at: string;
  text_preview: string;
}

export interface InterviewConfig {
  interview_type: InterviewType;
  role: string;
  skills: string[];
  experience_level: ExperienceLevel;
  difficulty: Difficulty;
  duration_minutes: number;
  language: string;
  mode: "text" | "voice";
  topics: string;
  goals: string;
  resume_id: number | null;
}

export interface Turn {
  id: number;
  role: "interviewer" | "candidate";
  kind: "question" | "followup" | "answer" | "closing";
  content: string;
  created_at: string;
}

export interface Interview {
  id: number;
  config: InterviewConfig;
  status: "in_progress" | "completed";
  target_questions: number;
  questions_asked: number;
  model_name: string;
  elapsed_seconds: number;
  started_at: string;
  ended_at: string | null;
  turns: Turn[];
  overall_score: number | null;
}

export interface InterviewSummary {
  id: number;
  role: string;
  interview_type: string;
  difficulty: string;
  status: string;
  started_at: string;
  overall_score: number | null;
}

export type ScoreKey = "accuracy" | "technical_knowledge" | "communication" | "problem_solving" | "confidence";

export interface ReportData {
  summary: string;
  scores: Record<ScoreKey, number>;
  strengths: string[];
  weaknesses: string[];
  question_feedback: {
    question: string;
    answer_summary: string;
    score: number;
    feedback: string;
    suggested_answer: string;
  }[];
  improvement_tips: string[];
  recommended_lessons: string[];
  practice_questions: string[];
  skill_gaps: string[];
  confidence_signals: string[];
}

export interface Report {
  interview_id: number;
  status: "ready" | "failed";
  overall_score: number | null;
  data: ReportData | null;
  error: string | null;
  model_name: string;
  created_at: string;
  criteria: Record<ScoreKey, string>;
  weights: Record<ScoreKey, number>;
}

export interface Dashboard {
  user: { full_name: string; first_name: string; target_roles: string[] };
  quote: { text: string; author: string };
  stats: {
    interviews_completed: number;
    average_score: number | null;
    best_score: number | null;
    practice_minutes: number;
    streak: number;
    best_streak: number;
    lessons_completed: number;
    problems_solved: number;
    problems_total: number;
    research_completed: number;
  };
  overall_progress: number;
  score_trend: { id: number; date: string; score: number; role: string }[];
  skill_mastery: { key: ScoreKey; label: string; score: number | null }[];
  recommendations: NextStep[];
  goals: string[];
  weekly_goals: GoalsProgress;
  courses: CourseProgressItem[];
  coding: { solved: number; total: number; by_difficulty: Record<"Easy" | "Medium" | "Hard", { solved: number; total: number }> };
  roadmap: { title: string; done: boolean; href: string }[];
  roadmap_progress: number;
  in_progress_interview: { id: number; role: string } | null;
  recent_activity: { id: number; kind: string; title: string; link: string | null; created_at: string }[];
  achievements: Badge[];
  badges_earned: number;
  badges_total: number;
}

export interface AIStatus {
  provider: string;
  model: string;
  reachable: boolean;
  model_available: boolean;
  message: string;
}

export interface Job {
  id: number;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  message: string;
  ref_type: string | null;
  ref_id: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Learning ----------
export interface CourseStats {
  total_lessons: number;
  completed_lessons: number;
  progress: number;
  mastery: number | null;
  next_lesson_key: string | null;
  resume_lesson_key: string | null;
}

export interface CourseSummary {
  id: number;
  topic: string;
  title: string;
  level: ExperienceLevel;
  status: "generating" | "ready" | "failed" | "completed";
  error: string | null;
  created_at: string;
  updated_at: string;
  stats: CourseStats;
}

export interface CourseLesson {
  key: string;
  title: string;
  summary: string;
  status: "not_started" | "in_progress" | "completed";
  best_quiz_score: number | null;
  generated: boolean;
}

export interface Recommendation {
  kind: string;
  title: string;
  detail: string;
  lesson_key?: string;
  href?: string;
}

export interface CourseDetail extends CourseSummary {
  goal: string;
  hours_per_week: number;
  description: string;
  outcomes: string[];
  modules: { index: number; title: string; summary: string; objectives: string[]; lessons: CourseLesson[] }[];
  project: { title: string; brief: string; requirements: string[]; stretch: string[] } | null;
  project_submitted: boolean;
  project_feedback: ProjectFeedback | null;
  assessment_available: boolean;
  assessment_result: AssessmentResult | null;
  recommendations: Recommendation[];
  job: Job | null;
  model_name: string;
}

export interface ProjectFeedback {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  rubric: { criterion: string; score: number; comment: string }[];
}

export interface QuizResult {
  score: number;
  passed: boolean;
  results: { chosen: number | null; correct_index: number; correct: boolean; explanation: string }[];
}

export interface AssessmentResult extends QuizResult {
  module_scores: { module_index: number; module: string; score: number }[];
  weak_modules: number[];
  submitted_at: string;
}

export interface LessonExercise {
  prompt: string;
  hints: string[];
  hints_total: number;
  solution: string | null;
  feedback: { verdict: "correct" | "partially_correct" | "incorrect"; feedback: string; next_step: string; answer: string } | null;
}

export interface LessonContent {
  objectives: string[];
  explanation: string;
  examples: { title: string; content: string }[];
  key_points: string[];
  exercises: LessonExercise[];
  quiz: { question: string; options: string[] }[];
  last_quiz: QuizResult | null;
  remedial: { explanation: string; analogy: string; examples: { title: string; content: string }[]; check_yourself: string[] } | null;
}

export interface Lesson {
  key: string;
  title: string;
  summary: string;
  module_index: number;
  module_title: string;
  position: number;
  course_id: number;
  course_title: string;
  course_topic: string;
  status: CourseLesson["status"];
  quiz_attempts: number;
  best_quiz_score: number | null;
  content: LessonContent | null;
  prev_key: string | null;
  next_key: string | null;
  total_lessons: number;
  pass_mark: number;
  job: Job | null;
}

// ---------- Research ----------
export interface ResearchDocument {
  id: number;
  filename: string;
  size_bytes: number;
  char_count: number;
  embedded: boolean;
  embedding_model: string | null;
  created_at: string;
  chunk_count: number;
}

export interface SubQuestion {
  question: string;
  search_queries: string[];
}

export interface Claim {
  text: string;
  citations: number[];
  kind: "fact" | "interpretation";
  unsupported?: boolean;
}

export interface ResearchReport {
  title: string;
  executive_summary: Claim[];
  sections: { heading: string; paragraphs: Claim[] }[];
  key_findings: Claim[];
  viewpoints: { perspective: string; summary: string; citations: number[] }[];
  limitations: string[];
  open_questions: string[];
}

export interface ResearchSource {
  number: number;
  kind: "web" | "document";
  title: string;
  url: string | null;
  document_id: number | null;
  query: string;
  excerpt: string;
  fetched: boolean;
  cited: boolean;
}

export interface ResearchProject {
  id: number;
  title: string;
  prompt: string;
  goals: string;
  field: string;
  use_web: boolean;
  documents: { id: number; filename: string }[];
  status: "draft" | "planning" | "planned" | "running" | "ready" | "failed";
  plan: { title: string; objective?: string; scope?: string; sub_questions: SubQuestion[]; key_terms?: string[] } | null;
  report: ResearchReport | null;
  notes: {
    search_provider?: string;
    search_errors?: string[];
    fetch_failures?: { url: string; reason: string }[];
    retrieval_mode?: string;
    invalid_citations_removed?: number;
  };
  error: string | null;
  model_name: string;
  created_at: string;
  updated_at: string;
  sources: ResearchSource[];
  job: Job | null;
  web_available: boolean;
}

export interface ResearchListItem {
  id: number;
  title: string;
  field: string;
  status: ResearchProject["status"];
  updated_at: string;
  sources: number;
  error: string | null;
}

// ---------- Coding ----------
export type CodeLang = "python" | "javascript" | "java" | "cpp";

export interface CodingConfig {
  runner: string;
  execution_available: boolean;
  languages: { id: CodeLang; label: string; version: string }[];
  error: string | null;
  all_languages: { id: CodeLang; label: string }[];
  time_limit_ms: number;
}

export interface ProblemListItem {
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topic: string;
  status: "solved" | "attempted" | "new";
}

export interface ProblemDetail {
  slug: string;
  title: string;
  difficulty: ProblemListItem["difficulty"];
  topic: string;
  statement: string;
  input_format: string;
  output_format: string;
  constraints: string;
  samples: { input: string; output: string; explanation: string }[];
  hidden_tests: number;
  hints: string[];
  hints_total: number;
  explanation: string | null;
  expected_complexity: string | null;
  solved: boolean;
  last_language: CodeLang | null;
  drafts: Partial<Record<CodeLang, string>>;
  starters: Record<CodeLang, string>;
  submissions: SubmissionSummary[];
}

export interface TestResult {
  index: number;
  hidden: boolean;
  status: "passed" | "wrong_answer" | "runtime_error" | "compile_error" | "time_limit" | "memory_limit" | "error";
  time_ms: number | null;
  input?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
}

export interface Judged {
  verdict: "accepted" | TestResult["status"];
  passed: number;
  total: number;
  results: TestResult[];
  max_time_ms: number | null;
}

export interface SubmissionSummary {
  id: number;
  language: CodeLang;
  verdict: Judged["verdict"];
  passed: number;
  total: number;
  created_at: string;
  problem?: string;
  title?: string;
  difficulty?: string;
  max_time_ms?: number | null;
  reviewed?: boolean;
}

export interface CodeReview {
  summary: string;
  time_complexity: string;
  space_complexity: string;
  complexity_explanation: string;
  meets_expected: boolean | null;
  mistakes: { issue: string; explanation: string; fix_hint: string }[];
  improvements: string[];
  code_quality: string[];
  model: string;
  executed: boolean;
}

export interface CodingStats {
  solved: number;
  total_problems: number;
  by_difficulty: Record<"Easy" | "Medium" | "Hard", { solved: number; total: number }>;
  submissions: number;
  accepted: number;
  acceptance_rate: number | null;
  by_language: Record<string, number>;
  solved_by_topic: Record<string, number>;
}

// ---------- Analytics ----------
export interface NextStep {
  kind: string;
  title: string;
  detail: string;
  href: string;
}

export interface WeeklyGoal {
  key: "interviews" | "lessons" | "problems" | "research";
  label: string;
  done: number;
  target: number;
}

export interface GoalsProgress {
  week_start: string;
  weekly: WeeklyGoal[];
  daily: { done: number; target: number };
  weekly_complete: boolean;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  earned: boolean;
}

export interface CourseProgressItem extends CourseStats {
  id: number;
  title: string;
  topic: string;
  status: CourseSummary["status"];
  resume_title: string | null;
  project_score: number | null;
  assessment_score: number | null;
}

export interface Overview {
  overall_progress: number;
  interviews: {
    completed: number;
    average: number | null;
    best: number | null;
    trend: { id: number; date: string; score: number; role: string; type: string }[];
    by_type: { type: string; average: number; count: number }[];
    criteria: { key: ScoreKey; label: string; score: number | null }[];
    skill_gaps: { skill: string; count: number }[];
    in_progress: { id: number; role: string } | null;
    minutes: number;
  };
  learning: {
    courses: CourseProgressItem[];
    completed_courses: CourseProgressItem[];
    lessons_total: number;
    lessons_completed: number;
    progress: number;
    weak_lessons: { course_id: number; course: string; lesson_key: string; title: string; score: number }[];
    quizzes_passed: number;
    projects: { course: string; score: number }[];
  };
  coding: {
    solved: number;
    total: number;
    submissions: number;
    acceptance_rate: number | null;
    by_difficulty: Record<"Easy" | "Medium" | "Hard", { solved: number; total: number }>;
    topics: { topic: string; solved: number; attempted: number; total: number }[];
    hard_solved: number;
  };
  research_completed: number;
  skills: { skill: string; score: number; source: "interviews" | "learning" | "coding" }[];
  weaknesses: { title: string; detail: string; source: string }[];
  streak: { current: number; best: number; heatmap: { date: string; count: number }[]; active_days: number };
  goals: GoalsProgress;
  badges: Badge[];
  recommendations: NextStep[];
}

export interface Roadmap {
  headline: string;
  focus_areas: { title: string; why: string; actions: { label: string; kind: string; target: string }[] }[];
  weekly_plan: { day: string; tasks: string[] }[];
  milestones: string[];
}
