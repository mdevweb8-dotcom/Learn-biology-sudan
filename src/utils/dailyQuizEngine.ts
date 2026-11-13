import {
  ActiveQuizSession,
  BiologyDatabase,
  DailyQuizRecord,
  QuestionReviewStats,
  QuizAttemptRecord,
  QuizQuestion,
  RoundNumber,
  StudentProgress,
} from '../types/biology';
import {
  isLessonLocked,
  isLessonMastered,
  isSessionFullyCompleted,
} from './questionEngine';

/**
 * Local device calendar date key in YYYY-MM-DD format (never UTC).
 */
export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Smart Review Priority score (higher score = higher priority to review next).
 * - Recent wrong attempts and high wrongCount push question to top.
 * - Unmastered concepts score higher than already mastered ones.
 * - Repeated consecutive correct answers drop priority.
 */
export function computeSmartReviewPriority(
  question: QuizQuestion,
  stats: QuestionReviewStats | undefined,
  nowMs: number = Date.now()
): number {
  if (!stats || stats.attempts === 0) {
    // Unseen / unmastered concept gets steady base priority
    return 50;
  }

  let priority = 0;

  // High weight for mistakes
  priority += stats.wrongCount * 35;

  // Penalty for consecutive correct answers (spaced repetition decay)
  priority -= stats.consecutiveCorrect * 14;

  // Unmastered rounds deserve focused reinforcement
  const remainingRounds = 3 - stats.masteredRounds.length;
  priority += remainingRounds * 18;

  if (!stats.isMastered) {
    priority += 20;
  } else {
    priority -= 25;
  }

  // Boost very recent mistakes
  if (stats.lastWrongAt) {
    const wrongMs = Date.parse(stats.lastWrongAt);
    if (!Number.isNaN(wrongMs)) {
      const hoursSinceWrong = Math.max(0, (nowMs - wrongMs) / (1000 * 60 * 60));
      if (hoursSinceWrong <= 48) {
        priority += Math.round(25 * (1 - hoursSinceWrong / 48));
      }
    }
  }

  // Slightly boost questions student hasn't practiced recently
  const lastAttemptMs = Date.parse(stats.lastAttemptAt);
  if (!Number.isNaN(lastAttemptMs)) {
    const daysSinceAttempt = Math.max(0, (nowMs - lastAttemptMs) / (1000 * 60 * 60 * 24));
    priority += Math.min(20, Math.round(daysSinceAttempt * 4));
  }

  // Slight difficulty factor as deterministic tie-breaker
  if (question.difficulty === 'hard') priority += 3;
  else if (question.difficulty === 'medium') priority += 2;
  else priority += 1;

  return priority;
}

/**
 * Collect eligible questions strictly from unlocked / studied lessons ONLY.
 * Never touches locked lessons unless zero unlocked lessons exist.
 */
export function getEligibleDailyQuestions(
  database: BiologyDatabase,
  progress: StudentProgress
): QuizQuestion[] {
  const unlockedLessons = database.lessons.filter(
    (lesson) => !isLessonLocked(lesson, database, progress)
  );
  const unlockedLessonIds = new Set(unlockedLessons.map((l) => l.id));

  // Prioritize lessons actually studied, mastered, or currently unlocked
  const eligible = database.questions.filter((q) => unlockedLessonIds.has(q.lessonId));

  // Also include any questions from lessons explicitly interacted with (notes, active stats)
  if (eligible.length > 0) {
    return eligible;
  }

  // Absolute fallback if custom empty DB: first lesson questions
  const firstLessonId = database.lessons[0]?.id;
  return database.questions.filter((q) => q.lessonId === firstLessonId);
}

/**
 * Select up to `targetCount` questions spreading across multiple unlocked/studied lessons
 * rather than clustering on only the latest lesson, ordered by Smart Review Priority.
 */
export function selectPrioritizedQuestions(
  candidates: QuizQuestion[],
  progress: StudentProgress,
  targetCount: number,
  seedOffset: number = 0
): QuizQuestion[] {
  if (candidates.length === 0) return [];
  const count = Math.min(targetCount, candidates.length);
  const nowMs = Date.now();

  const scored = candidates.map((q, idx) => ({
    q,
    priority: computeSmartReviewPriority(q, progress.questionStats[q.id], nowMs),
    tieBreak: (idx + seedOffset) % Math.max(1, candidates.length),
  }));

  scored.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.tieBreak - b.tieBreak;
  });

  // Ensure multi-lesson coverage when multiple lessons are represented:
  // First pick top-priority representative per distinct lesson (if mistakes don't overwhelm), then fill remaining slots.
  const selected: QuizQuestion[] = [];
  const pickedIds = new Set<string>();
  const lessonsSeen = new Set<string>();

  // Step 1: Always include top wrong/high-priority items first (up to half of quiz)
  const urgentWrong = scored.filter(
    ({ q }) => (progress.questionStats[q.id]?.wrongCount || 0) > 0 && (progress.questionStats[q.id]?.consecutiveCorrect || 0) < 2
  );
  for (const item of urgentWrong.slice(0, Math.ceil(count / 2))) {
    selected.push(item.q);
    pickedIds.add(item.q.id);
    lessonsSeen.add(item.q.lessonId);
  }

  // Step 2: Spread across distinct unlocked/studied lessons so daily quiz isn't stuck on last lesson only
  for (const item of scored) {
    if (selected.length >= count) break;
    if (pickedIds.has(item.q.id)) continue;
    if (!lessonsSeen.has(item.q.lessonId)) {
      selected.push(item.q);
      pickedIds.add(item.q.id);
      lessonsSeen.add(item.q.lessonId);
    }
  }

  // Step 3: Fill remaining slots strictly by priority
  for (const item of scored) {
    if (selected.length >= count) break;
    if (pickedIds.has(item.q.id)) continue;
    selected.push(item.q);
    pickedIds.add(item.q.id);
  }

  return selected;
}

/**
 * Assign a balanced mix of Round 1 (MCQ), Round 2 (Fill Blank), and Round 3 (Open Recall)
 * across selected questions, preferring rounds the student hasn't mastered yet for each question.
 */
function assignMixedRounds(
  questions: QuizQuestion[],
  progress: StudentProgress,
  daySeed: number
): Record<string, RoundNumber> {
  const assigned: Record<string, RoundNumber> = {};
  const roundOrder: RoundNumber[] = [1, 2, 3];

  questions.forEach((q, idx) => {
    const stat = progress.questionStats[q.id];
    const desiredCycleRound = roundOrder[(idx + daySeed) % 3];

    if (stat && stat.masteredRounds.length < 3) {
      const missingRounds = roundOrder.filter((r) => !stat.masteredRounds.includes(r));
      if (missingRounds.includes(desiredCycleRound)) {
        assigned[q.id] = desiredCycleRound;
      } else {
        assigned[q.id] = missingRounds[idx % missingRounds.length];
      }
    } else {
      assigned[q.id] = desiredCycleRound;
    }
  });

  return assigned;
}

function hashDateKey(dateKey: string): number {
  let sum = 0;
  for (let i = 0; i < dateKey.length; i++) {
    sum = (sum * 31 + dateKey.charCodeAt(i)) % 997;
  }
  return sum;
}

export interface DailyQuizBundle {
  dateKey: string;
  record: DailyQuizRecord;
  session: ActiveQuizSession | null;
  updatedProgress: StudentProgress;
  wasCreatedNow: boolean;
}

/**
 * Get today's Daily Quiz or create a fresh one if and only if today's local date has none yet.
 * Reloading/reopening on the same local date NEVER regenerates or resets today's Daily Quiz.
 * Does NOT unlock any locked lessons.
 */
export function getOrCreateDailyQuiz(
  database: BiologyDatabase,
  progress: StudentProgress,
  currentDate: Date = new Date()
): DailyQuizBundle {
  const todayKey = getLocalDateKey(currentDate);
  const existingRecord = progress.dailyQuizByDate[todayKey];
  const existingSession = progress.activeDailySession;

  // Same local calendar day: preserve existing completed OR in-progress daily quiz without resetting!
  if (existingRecord) {
    if (existingRecord.status === 'completed') {
      return {
        dateKey: todayKey,
        record: existingRecord,
        session: null,
        updatedProgress: progress,
        wasCreatedNow: false,
      };
    }

    // Resume existing session for today if present, or reconstruct from preserved record
    if (existingSession && existingSession.dailyDateKey === todayKey) {
      return {
        dateKey: todayKey,
        record: existingRecord,
        session: existingSession,
        updatedProgress: progress,
        wasCreatedNow: false,
      };
    }

    const now = currentDate.toISOString();
    const completedRoundsByQuestion: Record<string, RoundNumber[]> = {};
    for (const qId of existingRecord.questionIds) {
      const round = existingRecord.assignedRoundByQuestion[qId] || 1;
      completedRoundsByQuestion[qId] = existingRecord.completedQuestionIds.includes(qId)
        ? [round]
        : [];
    }
    const resumeIdx = Math.max(
      0,
      existingRecord.questionIds.findIndex(
        (qId) => !existingRecord.completedQuestionIds.includes(qId)
      )
    );
    const firstQId = existingRecord.questionIds[resumeIdx] || existingRecord.questionIds[0];
    const restoredSession: ActiveQuizSession = {
      sessionId: `daily-${todayKey}`,
      mode: 'daily_quiz',
      title: `الاختبار اليومي (${todayKey})`,
      dailyDateKey: todayKey,
      questionIds: existingRecord.questionIds,
      assignedRoundByQuestion: existingRecord.assignedRoundByQuestion,
      currentQuestionIndex: resumeIdx,
      currentRound: existingRecord.assignedRoundByQuestion[firstQId] || 1,
      completedRoundsByQuestion,
      stepStates: {},
      totalAttempts: existingRecord.totalAttempts,
      totalWrongAttempts: existingRecord.wrongAttempts,
      startedAt: existingRecord.startedAt,
      updatedAt: now,
    };

    const updatedProgress: StudentProgress = {
      ...progress,
      activeDailySession: restoredSession,
    };

    return {
      dateKey: todayKey,
      record: existingRecord,
      session: restoredSession,
      updatedProgress,
      wasCreatedNow: false,
    };
  }

  // New local date: generate a fresh Daily Quiz drawing from unlocked/studied lessons
  const targetCount = progress.settings?.dailyQuizQuestionCount || 10;
  const candidates = getEligibleDailyQuestions(database, progress);
  const seed = hashDateKey(todayKey);
  const selectedQuestions = selectPrioritizedQuestions(candidates, progress, targetCount, seed);
  const assignedRounds = assignMixedRounds(selectedQuestions, progress, seed);
  const now = currentDate.toISOString();

  const newRecord: DailyQuizRecord = {
    dateKey: todayKey,
    targetQuestionCount: targetCount,
    questionIds: selectedQuestions.map((q) => q.id),
    completedQuestionIds: [],
    assignedRoundByQuestion: assignedRounds,
    status: 'in_progress',
    score: 0,
    total: selectedQuestions.length,
    percentage: 0,
    totalAttempts: 0,
    wrongAttempts: 0,
    wrongQuestionIds: [],
    startedAt: now,
  };

  const completedRoundsByQuestion: Record<string, RoundNumber[]> = {};
  for (const q of selectedQuestions) {
    completedRoundsByQuestion[q.id] = [];
  }

  const firstQuestion = selectedQuestions[0];
  const newSession: ActiveQuizSession = {
    sessionId: `daily-${todayKey}-${currentDate.getTime()}`,
    mode: 'daily_quiz',
    title: `الاختبار اليومي (${todayKey})`,
    dailyDateKey: todayKey,
    questionIds: selectedQuestions.map((q) => q.id),
    assignedRoundByQuestion: assignedRounds,
    currentQuestionIndex: 0,
    currentRound: firstQuestion ? assignedRounds[firstQuestion.id] : 1,
    completedRoundsByQuestion,
    stepStates: {},
    totalAttempts: 0,
    totalWrongAttempts: 0,
    startedAt: now,
    updatedAt: now,
  };

  const updatedProgress: StudentProgress = {
    ...progress,
    activeDailySession: newSession,
    dailyQuizByDate: {
      ...progress.dailyQuizByDate,
      [todayKey]: newRecord,
    },
  };

  return {
    dateKey: todayKey,
    record: newRecord,
    session: newSession,
    updatedProgress,
    wasCreatedNow: true,
  };
}

/**
 * Sync active daily session progress into today's persistent DailyQuizRecord
 * so mistakes, score, completed question IDs, and completion state survive reloads cleanly.
 */
export function syncDailyRecordFromSession(
  progress: StudentProgress,
  session: ActiveQuizSession,
  nowDate: Date = new Date()
): StudentProgress {
  if (session.mode !== 'daily_quiz' || !session.dailyDateKey) return progress;
  const dateKey = session.dailyDateKey;
  const prevRecord = progress.dailyQuizByDate[dateKey];
  if (!prevRecord) return progress;

  const completedQuestionIds: string[] = [];
  const wrongQuestionIds: string[] = [];
  let firstTryCorrectCount = 0;

  for (const qId of session.questionIds) {
    const targetRound = session.assignedRoundByQuestion?.[qId] || 1;
    const completed = session.completedRoundsByQuestion[qId] || [];
    const step = session.stepStates[`${qId}::${targetRound}`];

    if (completed.includes(targetRound)) {
      completedQuestionIds.push(qId);
      if (!step || step.wrongAttempts === 0) {
        firstTryCorrectCount += 1;
      }
    }
    if (step && step.wrongAttempts > 0) {
      wrongQuestionIds.push(qId);
    }
  }

  const total = session.questionIds.length;
  const isComplete = isSessionFullyCompleted(session);
  const percentage = total > 0 ? Math.round((firstTryCorrectCount / total) * 100) : 0;

  const updatedRecord: DailyQuizRecord = {
    ...prevRecord,
    completedQuestionIds,
    status: isComplete ? 'completed' : 'in_progress',
    score: firstTryCorrectCount,
    total,
    percentage,
    totalAttempts: session.totalAttempts,
    wrongAttempts: session.totalWrongAttempts,
    wrongQuestionIds,
    completedAt: isComplete ? nowDate.toISOString() : prevRecord.completedAt,
  };

  let nextQuizHistory = progress.quizHistory;
  if (isComplete && prevRecord.status !== 'completed') {
    const historyEntry: QuizAttemptRecord = {
      id: `daily-history-${dateKey}`,
      mode: 'daily_quiz',
      date: nowDate.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      dateKey,
      score: firstTryCorrectCount,
      total,
      percentage,
      timeSpentSeconds: Math.max(
        1,
        Math.round((nowDate.getTime() - Date.parse(session.startedAt)) / 1000)
      ),
      wrongQuestionIds,
    };
    nextQuizHistory = [historyEntry, ...progress.quizHistory.slice(0, 99)];
  }

  return {
    ...progress,
    activeDailySession: isComplete ? null : session,
    dailyQuizByDate: {
      ...progress.dailyQuizByDate,
      [dateKey]: updatedRecord,
    },
    quizHistory: nextQuizHistory,
  };
}

/**
 * Create an independent Smart Review session prioritizing mistakes & unmastered concepts
 * from unlocked/studied lessons. Does NOT alter or unlock lesson progression locks.
 */
export function createSmartReviewSession(
  database: BiologyDatabase,
  progress: StudentProgress,
  maxQuestions: number = 8
): ActiveQuizSession {
  const candidates = getEligibleDailyQuestions(database, progress);
  const selected = selectPrioritizedQuestions(candidates, progress, maxQuestions, 7);
  const assignedRounds = assignMixedRounds(selected, progress, 3);
  const now = new Date().toISOString();

  const completedRoundsByQuestion: Record<string, RoundNumber[]> = {};
  for (const q of selected) {
    completedRoundsByQuestion[q.id] = [];
  }

  return {
    sessionId: `smart-review-${Date.now()}`,
    mode: 'smart_review',
    title: 'المراجعة الذكية للأخطاء والمفاهيم',
    questionIds: selected.map((q) => q.id),
    assignedRoundByQuestion: assignedRounds,
    currentQuestionIndex: 0,
    currentRound: selected[0] ? assignedRounds[selected[0].id] : 1,
    completedRoundsByQuestion,
    stepStates: {},
    totalAttempts: 0,
    totalWrongAttempts: 0,
    startedAt: now,
    updatedAt: now,
  };
}

/**
 * Get sorted Daily Quiz History (newest local date first) for the performance trend log.
 */
export function getDailyQuizHistory(progress: StudentProgress): DailyQuizRecord[] {
  return Object.values(progress.dailyQuizByDate || {}).sort((a, b) =>
    b.dateKey.localeCompare(a.dateKey)
  );
}

/**
 * Helper summarizing unlocked & mastered lesson counts without mutating locks.
 */
export function getProgressionSummary(database: BiologyDatabase, progress: StudentProgress): {
  unlockedCount: number;
  masteredCount: number;
  totalCount: number;
  nextLockedLessonTitle: string | null;
} {
  let unlockedCount = 0;
  let masteredCount = 0;
  let nextLockedLessonTitle: string | null = null;

  for (const lesson of database.lessons) {
    const locked = isLessonLocked(lesson, database, progress);
    if (!locked) unlockedCount++;
    else if (!nextLockedLessonTitle) nextLockedLessonTitle = lesson.title;

    if (isLessonMastered(lesson.id, database, progress)) {
      masteredCount++;
    }
  }

  return {
    unlockedCount,
    masteredCount,
    totalCount: database.lessons.length,
    nextLockedLessonTitle,
  };
}
