import {
  ActiveQuizSession,
  BiologyDatabase,
  Lesson,
  QuestionMasteryRounds,
  QuestionReviewStats,
  QuizMode,
  QuizQuestion,
  RoundNumber,
  RoundType,
  StepAttemptState,
  StudentProgress,
} from '../types/biology';

export const ROUND_LABELS: Record<RoundNumber, string> = {
  1: 'الجولة 1: اختيار من متعدد',
  2: 'الجولة 2: أكمل الإجابة',
  3: 'الجولة 3: استدعاء من الذاكرة',
};

export const ROUND_TYPES: Record<RoundNumber, RoundType> = {
  1: 'mcq',
  2: 'fill_blank',
  3: 'open_recall',
};

export interface RoundEvaluationResult {
  isCorrect: boolean;
  round: RoundNumber;
  roundType: RoundType;
  feedbackMessage: string;
  explanation?: string;
  referenceAnswer?: string;
  pageSource: string;
}

export interface SubmitAnswerOutcome {
  updatedSession: ActiveQuizSession;
  updatedProgress: StudentProgress;
  evaluation: RoundEvaluationResult;
  lessonNewlyMastered: boolean;
  isSessionComplete: boolean;
}

const ARABIC_STOPWORDS = new Set([
  'في',
  'من',
  'الي',
  'على',
  'عن',
  'مع',
  'او',
  'و',
  'ثم',
  'بين',
  'هو',
  'هي',
  'هم',
  'التي',
  'الذي',
  'الذين',
  'ان',
  'انه',
  'انها',
  'لا',
  'ما',
  'ماذا',
  'كيف',
  'لماذا',
  'هل',
  'كل',
  'بعض',
  'هذا',
  'هذه',
  'ذلك',
  'تلك',
  'له',
  'لها',
  'بها',
  'فيه',
  'فيها',
  'منها',
  'منه',
  'عند',
  'قبل',
  'بعد',
  'اثناء',
  'خلال',
  'حيث',
  'فقط',
  'جدا',
  'بشكل',
  'عنصر',
  'عمليه',
  'تسمي',
  'يسمي',
]);

/**
 * Normalize Arabic and Latin text for resilient offline answer matching:
 * strips tashkeel, tatweel, unifies hamza forms, maps ة->ه and ى->ي, collapses spaces.
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // remove tashkeel
    .replace(/\u0640/g, '') // remove tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[،؛؟.,:;!()\[\]«»"'\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenizeNormalized(text: string): string[] {
  const norm = normalizeArabic(text);
  if (!norm) return [];
  return norm.split(' ').filter(Boolean);
}

function stripLeadingPrefix(token: string): string {
  let t = token;
  if (t.length > 4 && (t.startsWith('وال') || t.startsWith('بال') || t.startsWith('كال') || t.startsWith('فال'))) {
    t = t.slice(3);
  } else if (t.length > 3 && t.startsWith('لل')) {
    t = t.slice(2);
  } else if (t.length > 3 && t.startsWith('ال')) {
    t = t.slice(2);
  } else if (t.length > 3 && (t.startsWith('و') || t.startsWith('ب') || t.startsWith('ل'))) {
    t = t.slice(1);
  }
  return t;
}

function textMatchesSynonym(normalizedUserText: string, userTokens: string[], rawSynonym: string): boolean {
  const synNorm = normalizeArabic(rawSynonym);
  if (!synNorm) return false;

  // Multi-word phrase check
  if (synNorm.includes(' ')) {
    if (normalizedUserText.includes(synNorm)) return true;
    const phraseWords = synNorm.split(' ').filter((w) => w.length >= 2);
    return phraseWords.every((pw) => textMatchesSynonym(normalizedUserText, userTokens, pw));
  }

  // Exact or stripped prefix token check
  const synStem = stripLeadingPrefix(synNorm);
  for (const token of userTokens) {
    if (token === synNorm || token === synStem) return true;
    const tokStem = stripLeadingPrefix(token);
    if (tokStem === synNorm || tokStem === synStem) return true;
    if (synStem.length >= 3 && (tokStem.includes(synStem) || (tokStem.length >= 3 && synStem.includes(tokStem)))) {
      return true;
    }
  }

  if (synStem.length >= 4 && normalizedUserText.includes(synStem)) {
    return true;
  }

  return false;
}

/**
 * Safely retrieve or deterministically build all 3 rounds for a QuizQuestion
 * without altering scientific meaning (supports custom imported JSON seamlessly).
 */
export function resolveQuestionRounds(question: QuizQuestion): QuestionMasteryRounds {
  if (
    question.masteryRounds &&
    question.masteryRounds.mcq &&
    question.masteryRounds.fillBlank &&
    question.masteryRounds.openRecall
  ) {
    return question.masteryRounds;
  }

  const safeIndex =
    question.correctAnswerIndex >= 0 && question.correctAnswerIndex < question.options.length
      ? question.correctAnswerIndex
      : 0;
  const correctOption = question.options[safeIndex] || '';

  // Round 2 fallback: use explanation if it literally contains the correct option; otherwise prompt with blank
  let promptWithBlank = '';
  const cleanPrompt = question.question.replace(/[؟?]+$/, '').trim();
  if (
    correctOption.length >= 2 &&
    correctOption.length <= 45 &&
    question.explanation.includes(correctOption)
  ) {
    promptWithBlank = question.explanation.replace(correctOption, '_____');
  } else {
    promptWithBlank = `${cleanPrompt} — الإجابة العلمية الدقيقة هي: _____.`;
  }

  // Round 3 fallback: open recall with zero hints and zero options
  const contentTokens = tokenizeNormalized(correctOption)
    .map(stripLeadingPrefix)
    .filter((tok) => tok.length >= 2 && !ARABIC_STOPWORDS.has(tok));
  const uniqueTokens = Array.from(new Set(contentTokens)).slice(0, 4);
  const requiredConceptGroups =
    uniqueTokens.length > 0 ? uniqueTokens.map((t) => [t]) : [[normalizeArabic(correctOption)]];

  return {
    mcq: {
      prompt: question.question,
      options: question.options,
      correctIndex: safeIndex,
    },
    fillBlank: {
      promptWithBlank,
      correctAnswer: correctOption,
      acceptedAnswers: [correctOption],
    },
    openRecall: {
      prompt: `أجب من ذاكرتك بدقة علمية: ${question.question}`,
      referenceAnswer: correctOption,
      requiredConceptGroups,
      acceptedDirectAnswers: [correctOption],
      minConceptsRequired: Math.max(1, Math.min(requiredConceptGroups.length, 2)),
      conceptGuidance: `تأكد من ذكر الفكرة العلمية الأساسية المرتبطة بمفهوم «${question.scientificConcept}» (${question.pageSource}).`,
    },
  };
}

export function stepKey(questionId: string, round: RoundNumber): string {
  return `${questionId}::${round}`;
}

export function getActiveRoundForSessionQuestion(
  session: ActiveQuizSession,
  questionId: string
): RoundNumber {
  if (session.assignedRoundByQuestion && session.assignedRoundByQuestion[questionId]) {
    return session.assignedRoundByQuestion[questionId];
  }
  return session.currentRound;
}

/**
 * Evaluate user's submission for a specific round without leaking the exact answer on error.
 */
export function evaluateRoundAnswer(
  question: QuizQuestion,
  round: RoundNumber,
  userInput: string | number | null
): RoundEvaluationResult {
  const rounds = resolveQuestionRounds(question);
  const roundType = ROUND_TYPES[round];

  if (round === 1) {
    const selectedIdx = typeof userInput === 'number' ? userInput : -1;
    const isCorrect = selectedIdx === rounds.mcq.correctIndex && selectedIdx >= 0;

    if (isCorrect) {
      return {
        isCorrect: true,
        round,
        roundType,
        feedbackMessage: 'إجابة صحيحة ومطابقة للكتاب المدرسي!',
        explanation: question.explanation,
        referenceAnswer: rounds.mcq.options[rounds.mcq.correctIndex],
        pageSource: question.pageSource,
      };
    }

    const specificHint =
      selectedIdx >= 0 ? rounds.mcq.distractorExplanations?.[selectedIdx] : undefined;
    return {
      isCorrect: false,
      round,
      roundType,
      feedbackMessage:
        specificHint ||
        `إجابة غير دقيقة. راجع مفهوم «${question.scientificConcept}» في الكتاب (${question.pageSource}) وأعد المحاولة باختيار أدق.`,
      pageSource: question.pageSource,
    };
  }

  const textAnswer = typeof userInput === 'string' ? userInput : '';
  const normUser = normalizeArabic(textAnswer);
  const userTokens = tokenizeNormalized(textAnswer);

  if (!normUser || normUser.length < 2) {
    return {
      isCorrect: false,
      round,
      roundType,
      feedbackMessage: 'يرجى كتابة إجابة علمية واضحة قبل التأكيد (لا يمكن ترك الإجابة فارغة).',
      pageSource: question.pageSource,
    };
  }

  if (round === 2) {
    const candidates = [
      rounds.fillBlank.correctAnswer,
      ...(rounds.fillBlank.acceptedAnswers || []),
    ];
    let matched = candidates.some((cand) => {
      const cNorm = normalizeArabic(cand);
      if (!cNorm) return false;
      if (normUser === cNorm) return true;
      // Also accept if user typed the full sentence or minor prefix like الـ on a single-word answer
      if (stripLeadingPrefix(normUser) === stripLeadingPrefix(cNorm)) return true;
      if (cNorm.length >= 3 && userTokens.some((tok) => stripLeadingPrefix(tok) === stripLeadingPrefix(cNorm))) {
        // Only if candidate itself is <= 2 words so wrong multi-word essays don't sneak through
        if (tokenizeNormalized(cand).length <= 2 && userTokens.length <= 5) {
          return true;
        }
      }
      // For multi-word missing phrases (like "خروجها منها" or "ضغط الدم"), verify all significant words of candidate appear
      const candWords = tokenizeNormalized(cand)
        .map(stripLeadingPrefix)
        .filter((w) => w.length >= 2 && !ARABIC_STOPWORDS.has(w));
      if (candWords.length >= 2) {
        return candWords.every((cw) => textMatchesSynonym(normUser, userTokens, cw));
      }
      return false;
    });

    if (matched) {
      return {
        isCorrect: true,
        round,
        roundType,
        feedbackMessage: 'أحسنت! أكملت العبارة العلمية بشكل صحيح.',
        explanation: question.explanation,
        referenceAnswer: rounds.fillBlank.correctAnswer,
        pageSource: question.pageSource,
      };
    }

    return {
      isCorrect: false,
      round,
      roundType,
      feedbackMessage: `الكلمة أو العبارة المكتوبة غير مطابقة للمفهوم المطلوب. تذكر مفهوم «${question.scientificConcept}» (${question.pageSource}) وحاول مرة أخرى دون تخمين.`,
      pageSource: question.pageSource,
    };
  }

  // Round 3: open_recall (NO options, NO hints before or during answering)
  const directAnswers = [
    rounds.openRecall.referenceAnswer,
    ...(rounds.openRecall.acceptedDirectAnswers || []),
  ];

  let isRecallCorrect = directAnswers.some((ans) => {
    const aNorm = normalizeArabic(ans);
    if (!aNorm) return false;
    return normUser === aNorm || normUser.includes(aNorm);
  });

  if (!isRecallCorrect && rounds.openRecall.requiredConceptGroups.length > 0) {
    let matchedGroups = 0;
    for (const group of rounds.openRecall.requiredConceptGroups) {
      const groupHit = group.some((synonym) => textMatchesSynonym(normUser, userTokens, synonym));
      if (groupHit) matchedGroups++;
    }
    const minRequired =
      rounds.openRecall.minConceptsRequired ??
      Math.max(1, Math.ceil(rounds.openRecall.requiredConceptGroups.length * 0.65));
    if (matchedGroups >= minRequired) {
      isRecallCorrect = true;
    }
  }

  if (isRecallCorrect) {
    return {
      isCorrect: true,
      round,
      roundType,
      feedbackMessage: 'استدعاء ممتاز! إجابتك تستوفي العناصر العلمية الأساسية من ذاكرتك.',
      explanation: question.explanation,
      referenceAnswer: rounds.openRecall.referenceAnswer,
      pageSource: question.pageSource,
    };
  }

  return {
    isCorrect: false,
    round,
    roundType,
    feedbackMessage:
      rounds.openRecall.conceptGuidance ||
      `إجابتك غير مكتملة علمياً. استرجع الفكرة الأساسية لمفهوم «${question.scientificConcept}» (${question.pageSource}) واكتبها بدقة.`,
    pageSource: question.pageSource,
  };
}

/**
 * Resolve all questions belonging to a lesson.
 */
export function getLessonQuestions(lessonId: string, database: BiologyDatabase): QuizQuestion[] {
  return database.questions.filter((q) => q.lessonId === lessonId);
}

/**
 * A question is mastered ONLY after succeeding in all 3 rounds [1, 2, 3].
 */
export function isQuestionMastered(progress: StudentProgress, questionId: string): boolean {
  const stats = progress.questionStats[questionId];
  if (!stats) return false;
  return [1, 2, 3].every((r) => stats.masteredRounds.includes(r as RoundNumber));
}

/**
 * A lesson is mastered ONLY after ALL its questions are mastered across all 3 rounds.
 */
export function isLessonMastered(
  lessonId: string,
  database: BiologyDatabase,
  progress: StudentProgress
): boolean {
  const questions = getLessonQuestions(lessonId, database);
  if (questions.length === 0) {
    return progress.masteredLessons.includes(lessonId);
  }
  return questions.every((q) => isQuestionMastered(progress, q.id));
}

/**
 * Strict progression lock:
 * Lesson 0 is unlocked by default; any subsequent lesson index i > 0 stays locked
 * until lesson index i - 1 is fully mastered across all 3 rounds of all its questions.
 */
export function isLessonLocked(
  lesson: Lesson,
  database: BiologyDatabase,
  progress: StudentProgress
): boolean {
  const idx = database.lessons.findIndex((l) => l.id === lesson.id);
  if (idx <= 0) return false;
  const previousLesson = database.lessons[idx - 1];
  return !isLessonMastered(previousLesson.id, database, progress);
}

/**
 * Create or resume a Lesson Mastery Quiz session (rounds 1 -> 2 -> 3 across all lesson questions).
 */
export function createLessonMasterySession(
  lesson: Lesson,
  database: BiologyDatabase,
  existingProgress: StudentProgress,
  forceNew: boolean = false
): ActiveQuizSession {
  const active = existingProgress.activeQuizSession;
  if (
    !forceNew &&
    active &&
    active.mode === 'lesson_mastery' &&
    active.lessonId === lesson.id &&
    active.questionIds.length > 0
  ) {
    return active;
  }

  let questions = getLessonQuestions(lesson.id, database);
  if (questions.length === 0) {
    questions = database.questions.filter((q) => q.unitId === lesson.unitId).slice(0, 4);
  }

  const now = new Date().toISOString();
  const completedRoundsByQuestion: Record<string, RoundNumber[]> = {};
  for (const q of questions) {
    completedRoundsByQuestion[q.id] = [];
  }

  return {
    sessionId: `mastery-${lesson.id}-${Date.now()}`,
    mode: 'lesson_mastery',
    title: `اختبار إتقان: ${lesson.title}`,
    unitId: lesson.unitId,
    lessonId: lesson.id,
    questionIds: questions.map((q) => q.id),
    currentQuestionIndex: 0,
    currentRound: 1,
    completedRoundsByQuestion,
    stepStates: {},
    totalAttempts: 0,
    totalWrongAttempts: 0,
    startedAt: now,
    updatedAt: now,
  };
}

/**
 * Create a Unit Review session (rounds 1 -> 2 -> 3 across unit questions).
 */
export function createUnitReviewSession(
  unitTitle: string,
  unitId: string,
  questions: QuizQuestion[]
): ActiveQuizSession {
  const now = new Date().toISOString();
  const completedRoundsByQuestion: Record<string, RoundNumber[]> = {};
  for (const q of questions) {
    completedRoundsByQuestion[q.id] = [];
  }

  return {
    sessionId: `unit-${unitId}-${Date.now()}`,
    mode: 'unit_review',
    title: `اختبار شامل: ${unitTitle}`,
    unitId,
    questionIds: questions.map((q) => q.id),
    currentQuestionIndex: 0,
    currentRound: 1,
    completedRoundsByQuestion,
    stepStates: {},
    totalAttempts: 0,
    totalWrongAttempts: 0,
    startedAt: now,
    updatedAt: now,
  };
}

/**
 * Check if all required steps in an ActiveQuizSession are completed.
 */
export function isSessionFullyCompleted(session: ActiveQuizSession): boolean {
  if (session.questionIds.length === 0) return false;
  if (session.mode === 'daily_quiz' || session.mode === 'smart_review') {
    return session.questionIds.every((qId) => {
      const targetRound = getActiveRoundForSessionQuestion(session, qId);
      const completed = session.completedRoundsByQuestion[qId] || [];
      return completed.includes(targetRound);
    });
  }

  return session.questionIds.every((qId) => {
    const completed = session.completedRoundsByQuestion[qId] || [];
    return [1, 2, 3].every((r) => completed.includes(r as RoundNumber));
  });
}

/**
 * Calculate how many total steps exist and how many are completed in an active session.
 */
export function getSessionProgressCounts(session: ActiveQuizSession): {
  completedSteps: number;
  totalSteps: number;
  percentage: number;
} {
  const roundsPerQuestion =
    session.mode === 'daily_quiz' || session.mode === 'smart_review' ? 1 : 3;
  const totalSteps = Math.max(1, session.questionIds.length * roundsPerQuestion);
  let completedSteps = 0;

  for (const qId of session.questionIds) {
    const done = session.completedRoundsByQuestion[qId] || [];
    if (roundsPerQuestion === 1) {
      const target = getActiveRoundForSessionQuestion(session, qId);
      if (done.includes(target)) completedSteps += 1;
    } else {
      completedSteps += [1, 2, 3].filter((r) => done.includes(r as RoundNumber)).length;
    }
  }

  return {
    completedSteps,
    totalSteps,
    percentage: Math.round((completedSteps / totalSteps) * 100),
  };
}

/**
 * Submit an answer for the current question & round in an ActiveQuizSession.
 * Enforces strict mastery: wrong answer increments error/attempt counts and NEVER completes the round.
 */
export function submitSessionAnswer(
  session: ActiveQuizSession,
  progress: StudentProgress,
  database: BiologyDatabase,
  question: QuizQuestion,
  userInput: string | number | null
): SubmitAnswerOutcome {
  const activeRound = getActiveRoundForSessionQuestion(session, question.id);
  const evaluation = evaluateRoundAnswer(question, activeRound, userInput);
  const now = new Date().toISOString();
  const sKey = stepKey(question.id, activeRound);
  const prevStep = session.stepStates[sKey];

  const nextStepState: StepAttemptState = {
    questionId: question.id,
    round: activeRound,
    roundType: evaluation.roundType,
    lastUserInput: userInput,
    isCorrect: evaluation.isCorrect,
    attempts: (prevStep?.attempts || 0) + 1,
    wrongAttempts: (prevStep?.wrongAttempts || 0) + (evaluation.isCorrect ? 0 : 1),
    feedbackMessage: evaluation.feedbackMessage,
    answeredAt: now,
  };

  const prevCompleted = session.completedRoundsByQuestion[question.id] || [];
  const nextCompleted =
    evaluation.isCorrect && !prevCompleted.includes(activeRound)
      ? ([...prevCompleted, activeRound].sort() as RoundNumber[])
      : prevCompleted;

  const updatedSession: ActiveQuizSession = {
    ...session,
    completedRoundsByQuestion: {
      ...session.completedRoundsByQuestion,
      [question.id]: nextCompleted,
    },
    stepStates: {
      ...session.stepStates,
      [sKey]: nextStepState,
    },
    totalAttempts: session.totalAttempts + 1,
    totalWrongAttempts: session.totalWrongAttempts + (evaluation.isCorrect ? 0 : 1),
    updatedAt: now,
  };

  // Update persistent QuestionReviewStats
  const prevStat: QuestionReviewStats = progress.questionStats[question.id] || {
    questionId: question.id,
    attempts: 0,
    correctCount: 0,
    wrongCount: 0,
    consecutiveCorrect: 0,
    masteredRounds: [],
    isMastered: false,
    lastAttemptAt: now,
  };

  const nextMasteredRounds: RoundNumber[] =
    evaluation.isCorrect && !prevStat.masteredRounds.includes(activeRound)
      ? ([...prevStat.masteredRounds, activeRound].sort() as RoundNumber[])
      : prevStat.masteredRounds;

  const isNowQuestionMastered = [1, 2, 3].every((r) =>
    nextMasteredRounds.includes(r as RoundNumber)
  );

  const nextStat: QuestionReviewStats = {
    questionId: question.id,
    attempts: prevStat.attempts + 1,
    correctCount: prevStat.correctCount + (evaluation.isCorrect ? 1 : 0),
    wrongCount: prevStat.wrongCount + (evaluation.isCorrect ? 0 : 1),
    consecutiveCorrect: evaluation.isCorrect ? prevStat.consecutiveCorrect + 1 : 0,
    masteredRounds: nextMasteredRounds,
    isMastered: isNowQuestionMastered,
    lastAttemptAt: now,
    lastWrongAt: evaluation.isCorrect ? prevStat.lastWrongAt : now,
  };

  let updatedProgress: StudentProgress = {
    ...progress,
    questionStats: {
      ...progress.questionStats,
      [question.id]: nextStat,
    },
  };

  let lessonNewlyMastered = false;
  if (session.mode === 'lesson_mastery' && session.lessonId) {
    const wasMasteredBefore = progress.masteredLessons.includes(session.lessonId);
    const nowLessonMastered = isLessonMastered(session.lessonId, database, updatedProgress);

    if (nowLessonMastered) {
      const masteredSet = new Set([...updatedProgress.masteredLessons, session.lessonId]);
      const completedSet = new Set([...updatedProgress.completedLessons, session.lessonId]);
      updatedProgress = {
        ...updatedProgress,
        masteredLessons: Array.from(masteredSet),
        completedLessons: Array.from(completedSet),
      };
      if (!wasMasteredBefore) {
        lessonNewlyMastered = true;
      }
    }
  }

  const isSessionComplete = isSessionFullyCompleted(updatedSession);

  // Store active session reference
  if (session.mode === 'daily_quiz') {
    updatedProgress = {
      ...updatedProgress,
      activeDailySession: isSessionComplete ? null : updatedSession,
    };
  } else {
    updatedProgress = {
      ...updatedProgress,
      activeQuizSession: isSessionComplete ? null : updatedSession,
    };
  }

  return {
    updatedSession,
    updatedProgress,
    evaluation,
    lessonNewlyMastered,
    isSessionComplete,
  };
}

/**
 * Advance to the next question or next round ONLY if the current step has been answered correctly.
 * Returns `{ advanced: false, session }` if blocked due to unanswered/incorrect current step.
 */
export function advanceSessionStep(session: ActiveQuizSession): {
  advanced: boolean;
  isComplete: boolean;
  session: ActiveQuizSession;
} {
  const currentQId = session.questionIds[session.currentQuestionIndex];
  if (!currentQId) {
    return { advanced: false, isComplete: true, session };
  }

  const activeRound = getActiveRoundForSessionQuestion(session, currentQId);
  const completedForQ = session.completedRoundsByQuestion[currentQId] || [];

  // Strict guard: block advancing until current step is answered correctly
  if (!completedForQ.includes(activeRound)) {
    return { advanced: false, isComplete: false, session };
  }

  const now = new Date().toISOString();

  if (session.mode === 'daily_quiz' || session.mode === 'smart_review') {
    if (session.currentQuestionIndex + 1 < session.questionIds.length) {
      const nextIdx = session.currentQuestionIndex + 1;
      const nextQId = session.questionIds[nextIdx];
      const nextRound = getActiveRoundForSessionQuestion(session, nextQId);
      return {
        advanced: true,
        isComplete: false,
        session: {
          ...session,
          currentQuestionIndex: nextIdx,
          currentRound: nextRound,
          updatedAt: now,
        },
      };
    }
    return {
      advanced: false,
      isComplete: isSessionFullyCompleted(session),
      session,
    };
  }

  // Scan forward from current (round, questionIndex) for the next step
  if (session.currentQuestionIndex + 1 < session.questionIds.length) {
    return {
      advanced: true,
      isComplete: false,
      session: {
        ...session,
        currentQuestionIndex: session.currentQuestionIndex + 1,
        updatedAt: now,
      },
    };
  }

  if (session.currentRound < 3) {
    const nextRound = (session.currentRound + 1) as RoundNumber;
    return {
      advanced: true,
      isComplete: false,
      session: {
        ...session,
        currentQuestionIndex: 0,
        currentRound: nextRound,
        updatedAt: now,
      },
    };
  }

  // If round 3 ended but an earlier round/question is still uncompleted, jump to it
  for (const r of [1, 2, 3] as RoundNumber[]) {
    for (let idx = 0; idx < session.questionIds.length; idx++) {
      const qId = session.questionIds[idx];
      const done = session.completedRoundsByQuestion[qId] || [];
      if (!done.includes(r)) {
        return {
          advanced: true,
          isComplete: false,
          session: {
            ...session,
            currentRound: r,
            currentQuestionIndex: idx,
            updatedAt: now,
          },
        };
      }
    }
  }

  return {
    advanced: false,
    isComplete: isSessionFullyCompleted(session),
    session,
  };
}
