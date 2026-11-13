export type QuestionType = 'mcq' | 'true_false' | 'diagram_label';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type RoundType = 'mcq' | 'fill_blank' | 'open_recall';
export type RoundNumber = 1 | 2 | 3;
export type QuizMode = 'lesson_mastery' | 'daily_quiz' | 'smart_review' | 'unit_review';

export interface DiagramLabel {
  id: string;
  name: string;
  description: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
}

export interface LessonDiagram {
  id: string;
  title: string;
  type: 'cell_structure' | 'chloroplast' | 'mitochondria' | 'dna_structure' | 'heart' | 'nephron';
  caption: string;
  pageRef: number;
  labels: DiagramLabel[];
}

export interface LessonTable {
  id: string;
  title: string;
  caption?: string;
  pageRef: number;
  headers: string[];
  rows: string[][];
}

export interface ScientificTerm {
  term: string;
  termEn?: string;
  definition: string;
  pageRef: number;
}

export interface LessonSection {
  id: string;
  heading: string;
  content: string;
  bulletPoints?: string[];
  callout?: {
    type: 'definition' | 'fact' | 'warning' | 'tip';
    title: string;
    text: string;
  };
  pageRef: number;
}

export interface Lesson {
  id: string;
  unitId: string;
  unitNumber: number;
  lessonNumber: number;
  title: string;
  titleEn: string;
  pageNumber: number;
  pageRange: string;
  readDuration: string;
  summary: string;
  keyConcepts: string[];
  sections: LessonSection[];
  tables?: LessonTable[];
  diagrams?: LessonDiagram[];
  scientificTerms: ScientificTerm[];
  isLocked?: boolean;
}

export interface DiagramQuestionData {
  diagramType: 'cell' | 'mitochondria' | 'chloroplast' | 'dna';
  targetPartId: string;
  targetPartName: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
}

export interface QuestionMcqRound {
  prompt: string;
  options: string[];
  correctIndex: number;
  distractorExplanations?: string[];
}

export interface QuestionFillBlankRound {
  promptWithBlank: string;
  correctAnswer: string;
  acceptedAnswers: string[];
}

export interface QuestionOpenRecallRound {
  prompt: string;
  referenceAnswer: string;
  requiredConceptGroups: string[][];
  acceptedDirectAnswers?: string[];
  minConceptsRequired?: number;
  conceptGuidance: string;
}

export interface QuestionMasteryRounds {
  mcq: QuestionMcqRound;
  fillBlank: QuestionFillBlankRound;
  openRecall: QuestionOpenRecallRound;
}

export interface QuizQuestion {
  id: string;
  unitId: string;
  lessonId: string;
  type: QuestionType;
  difficulty: DifficultyLevel;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  scientificConcept: string;
  pageSource: string;
  diagramData?: DiagramQuestionData;
  masteryRounds?: QuestionMasteryRounds;
}

export interface Unit {
  id: string;
  number: number;
  title: string;
  titleEn: string;
  description: string;
  iconName: string;
  color: string;
  pageRange: string;
  lessonsCount: number;
  questionsCount: number;
}

export interface QuizAttemptRecord {
  id: string;
  mode?: QuizMode;
  unitId?: string;
  lessonId?: string;
  date: string;
  dateKey?: string;
  score: number;
  total: number;
  percentage: number;
  timeSpentSeconds: number;
  wrongQuestionIds: string[];
}

export interface StepAttemptState {
  questionId: string;
  round: RoundNumber;
  roundType: RoundType;
  lastUserInput: string | number | null;
  isCorrect: boolean;
  attempts: number;
  wrongAttempts: number;
  feedbackMessage?: string;
  answeredAt: string;
}

export interface ActiveQuizSession {
  sessionId: string;
  mode: QuizMode;
  title: string;
  unitId?: string;
  lessonId?: string;
  dailyDateKey?: string;
  questionIds: string[];
  // For daily_quiz / smart_review, each question can be tested using a specific round type
  assignedRoundByQuestion?: Record<string, RoundNumber>;
  currentQuestionIndex: number;
  currentRound: RoundNumber;
  completedRoundsByQuestion: Record<string, RoundNumber[]>;
  stepStates: Record<string, StepAttemptState>; // key: `${questionId}::${round}`
  totalAttempts: number;
  totalWrongAttempts: number;
  startedAt: string;
  updatedAt: string;
}

export interface QuestionReviewStats {
  questionId: string;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  consecutiveCorrect: number;
  masteredRounds: RoundNumber[];
  isMastered: boolean;
  lastAttemptAt: string;
  lastWrongAt?: string;
}

export interface DailyQuizRecord {
  dateKey: string; // YYYY-MM-DD in local device timezone
  targetQuestionCount: number;
  questionIds: string[];
  completedQuestionIds: string[];
  assignedRoundByQuestion: Record<string, RoundNumber>;
  status: 'in_progress' | 'completed';
  score: number;
  total: number;
  percentage: number;
  totalAttempts: number;
  wrongAttempts: number;
  wrongQuestionIds: string[];
  startedAt: string;
  completedAt?: string;
}

export interface LessonPositionState {
  lessonId: string;
  sectionIndex: number;
  pageRef: number;
  scrollY: number;
  updatedAt: string;
}

export interface AppSettings {
  dailyQuizQuestionCount: number;
}

export interface SyncMetadata {
  schemaVersion: number;
  deviceId: string;
  lastLocalMutationAt: string;
  lastSyncedAt: string | null;
  pendingSyncQueue: Array<{
    id: string;
    entity: 'progress' | 'daily_quiz' | 'lesson_mastery' | 'question_stat';
    entityId: string;
    updatedAt: string;
  }>;
}

export interface StudentProgress {
  completedLessons: string[];
  masteredLessons: string[];
  bookmarkedLessons: string[];
  bookmarkedQuestions: string[];
  lessonNotes: Record<string, string>;
  quizHistory: QuizAttemptRecord[];
  lastActiveLessonId: string | null;
  lastLessonPosition: LessonPositionState | null;
  questionStats: Record<string, QuestionReviewStats>;
  activeQuizSession: ActiveQuizSession | null;
  activeDailySession: ActiveQuizSession | null;
  dailyQuizByDate: Record<string, DailyQuizRecord>;
  settings: AppSettings;
  syncMetadata: SyncMetadata;
}

export interface BiologyDatabase {
  version: string;
  bookTitle: string;
  bookEdition: string;
  units: Unit[];
  lessons: Lesson[];
  questions: QuizQuestion[];
}
