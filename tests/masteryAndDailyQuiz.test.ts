import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { initialBiologyData } from '../src/data/biologyData';
import {
  flushStorageWrites,
  getStudentProgress,
  initStorage,
  resetMemoryCacheForReloadTest,
  saveActiveSession,
  saveLessonNote,
  saveLessonPosition,
  saveStudentProgress,
  toggleLessonBookmark,
  updateAppSettings,
} from '../src/utils/storage';
import {
  advanceSessionStep,
  createLessonMasterySession,
  evaluateRoundAnswer,
  getLessonQuestions,
  isLessonLocked,
  isLessonMastered,
  isQuestionMastered,
  resolveQuestionRounds,
  stepKey,
  submitSessionAnswer,
} from '../src/utils/questionEngine';
import {
  computeSmartReviewPriority,
  createSmartReviewSession,
  getDailyQuizHistory,
  getLocalDateKey,
  getOrCreateDailyQuiz,
  syncDailyRecordFromSession,
} from '../src/utils/dailyQuizEngine';
import { StudentProgress } from '../src/types/biology';

async function resetCleanDatabaseEnvironment() {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  resetMemoryCacheForReloadTest();
  await initStorage();
}

function makeFreshAnswer(
  questionId: string,
  round: 1 | 2 | 3
): string | number {
  const q = initialBiologyData.questions.find((item) => item.id === questionId);
  assert.ok(q, `Question ${questionId} must exist`);
  const rounds = resolveQuestionRounds(q);
  if (round === 1) return rounds.mcq.correctIndex;
  if (round === 2) return rounds.fillBlank.correctAnswer;
  return rounds.openRecall.referenceAnswer;
}

function masterEntireLesson(
  lessonId: string,
  initialProgress: StudentProgress
): StudentProgress {
  const lesson = initialBiologyData.lessons.find((l) => l.id === lessonId);
  assert.ok(lesson, `Lesson ${lessonId} must exist`);

  let progress = initialProgress;
  let session = createLessonMasterySession(lesson, initialBiologyData, progress);

  while (true) {
    const qId = session.questionIds[session.currentQuestionIndex];
    const q = initialBiologyData.questions.find((item) => item.id === qId)!;
    const ans = makeFreshAnswer(q.id, session.currentRound);
    const outcome = submitSessionAnswer(session, progress, initialBiologyData, q, ans);
    assert.equal(outcome.evaluation.isCorrect, true);
    session = outcome.updatedSession;
    progress = outcome.updatedProgress;

    const next = advanceSessionStep(session);
    if (next.isComplete) {
      break;
    }
    assert.equal(next.advanced, true);
    session = next.session;
  }

  return saveStudentProgress(progress, 'lesson_mastery', lessonId);
}

beforeEach(async () => {
  await resetCleanDatabaseEnvironment();
});

test('1. Every lesson has questions and each question provides all 3 round formats including Plasma Membrane example', async () => {
  for (const lesson of initialBiologyData.lessons) {
    const qs = getLessonQuestions(lesson.id, initialBiologyData);
    assert.ok(qs.length >= 2, `Lesson ${lesson.id} must have at least 2 direct questions`);
    for (const q of qs) {
      const rounds = resolveQuestionRounds(q);
      assert.ok(rounds.mcq.options.length >= 2, `${q.id} MCQ needs options`);
      assert.ok(
        rounds.fillBlank.promptWithBlank.includes('_____'),
        `${q.id} FillBlank prompt must contain _____`
      );
      assert.ok(
        rounds.fillBlank.correctAnswer.trim().length > 0,
        `${q.id} FillBlank needs correctAnswer`
      );
      assert.ok(
        rounds.openRecall.prompt.trim().length > 0 &&
          rounds.openRecall.requiredConceptGroups.length > 0,
        `${q.id} OpenRecall needs prompt and concept groups`
      );
    }
  }

  // Verify the Plasma Membrane question works across all 3 rounds
  const plasmaQ = initialBiologyData.questions.find((q) => q.id === 'q-2-7')!;
  assert.ok(plasmaQ);
  const r1 = evaluateRoundAnswer(plasmaQ, 1, plasmaQ.masteryRounds!.mcq.correctIndex);
  const r2 = evaluateRoundAnswer(plasmaQ, 2, 'خروجها');
  const r3 = evaluateRoundAnswer(plasmaQ, 3, 'ينظم دخول المواد إلى الخلية وخروجها منها');
  assert.equal(r1.isCorrect, true);
  assert.equal(r2.isCorrect, true);
  assert.equal(r3.isCorrect, true);

  // Incomplete Round 3 answer fails cleanly
  const r3Partial = evaluateRoundAnswer(plasmaQ, 3, 'ينظم دخول المواد فقط');
  assert.equal(r3Partial.isCorrect, false);
});

test('2. Question is NOT mastered after 1 or 2 rounds; mastered ONLY after all 3 rounds pass', async () => {
  const lesson1 = initialBiologyData.lessons[0];
  const qs = getLessonQuestions(lesson1.id, initialBiologyData);
  const q1 = qs[0];

  let progress = getStudentProgress();
  let session = createLessonMasterySession(lesson1, initialBiologyData, progress);

  // Pass Round 1 for q1
  let out = submitSessionAnswer(session, progress, initialBiologyData, q1, makeFreshAnswer(q1.id, 1));
  session = out.updatedSession;
  progress = out.updatedProgress;
  assert.equal(isQuestionMastered(progress, q1.id), false, 'Must not be mastered after Round 1 only');

  // Force round 2 on q1
  session = { ...session, currentRound: 2, currentQuestionIndex: 0 };
  out = submitSessionAnswer(session, progress, initialBiologyData, q1, makeFreshAnswer(q1.id, 2));
  session = out.updatedSession;
  progress = out.updatedProgress;
  assert.equal(isQuestionMastered(progress, q1.id), false, 'Must not be mastered after Round 1+2 only');

  // Pass Round 3 on q1
  session = { ...session, currentRound: 3, currentQuestionIndex: 0 };
  out = submitSessionAnswer(session, progress, initialBiologyData, q1, makeFreshAnswer(q1.id, 3));
  progress = out.updatedProgress;
  assert.equal(isQuestionMastered(progress, q1.id), true, 'Must be mastered only after Rounds 1+2+3');
});

test('3. Next lesson stays locked until ALL questions of current lesson pass all 3 rounds', async () => {
  const lesson1 = initialBiologyData.lessons[0];
  const lesson2 = initialBiologyData.lessons[1];
  const lesson1Qs = getLessonQuestions(lesson1.id, initialBiologyData);

  let progress = getStudentProgress();
  assert.equal(isLessonLocked(lesson1, initialBiologyData, progress), false);
  assert.equal(isLessonLocked(lesson2, initialBiologyData, progress), true);

  // Master only the first question completely (3 rounds)
  let session = createLessonMasterySession(lesson1, initialBiologyData, progress);
  for (const r of [1, 2, 3] as const) {
    session = { ...session, currentRound: r, currentQuestionIndex: 0 };
    const out = submitSessionAnswer(
      session,
      progress,
      initialBiologyData,
      lesson1Qs[0],
      makeFreshAnswer(lesson1Qs[0].id, r)
    );
    session = out.updatedSession;
    progress = out.updatedProgress;
  }

  assert.equal(isLessonMastered(lesson1.id, initialBiologyData, progress), false);
  assert.equal(
    isLessonLocked(lesson2, initialBiologyData, progress),
    true,
    'Next lesson must stay locked when remaining lesson questions are unmastered'
  );

  // Now finish mastering all remaining questions in lesson 1
  progress = masterEntireLesson(lesson1.id, progress);
  assert.equal(isLessonMastered(lesson1.id, initialBiologyData, progress), true);
  assert.equal(
    isLessonLocked(lesson2, initialBiologyData, progress),
    false,
    'Next lesson unlocks immediately after full 3-round lesson mastery'
  );
});

test('4. Wrong answer in any round blocks advancement and increments attempt/error counters without revealing exact answer', async () => {
  const lesson1 = initialBiologyData.lessons[0];
  const q1 = getLessonQuestions(lesson1.id, initialBiologyData)[0];
  const rounds = resolveQuestionRounds(q1);

  let progress = getStudentProgress();
  let session = createLessonMasterySession(lesson1, initialBiologyData, progress);

  // Round 1 wrong option
  const wrongIdx = (rounds.mcq.correctIndex + 1) % rounds.mcq.options.length;
  const r1Wrong = submitSessionAnswer(session, progress, initialBiologyData, q1, wrongIdx);
  assert.equal(r1Wrong.evaluation.isCorrect, false);
  assert.equal(r1Wrong.updatedSession.totalWrongAttempts, 1);
  assert.equal(
    r1Wrong.evaluation.feedbackMessage.includes(rounds.mcq.options[rounds.mcq.correctIndex]),
    false,
    'Wrong feedback must not reveal the exact correct answer'
  );
  const block1 = advanceSessionStep(r1Wrong.updatedSession);
  assert.equal(block1.advanced, false, 'Cannot advance after wrong MCQ answer');

  // Fix Round 1 then fail Round 2
  const r1Ok = submitSessionAnswer(
    r1Wrong.updatedSession,
    r1Wrong.updatedProgress,
    initialBiologyData,
    q1,
    rounds.mcq.correctIndex
  );
  session = { ...r1Ok.updatedSession, currentRound: 2, currentQuestionIndex: 0 };
  progress = r1Ok.updatedProgress;

  const r2Wrong = submitSessionAnswer(session, progress, initialBiologyData, q1, 'إجابة غير صحيحة تماماً');
  assert.equal(r2Wrong.evaluation.isCorrect, false);
  assert.equal(advanceSessionStep(r2Wrong.updatedSession).advanced, false);

  // Fix Round 2 then fail Round 3
  const r2Ok = submitSessionAnswer(
    r2Wrong.updatedSession,
    r2Wrong.updatedProgress,
    initialBiologyData,
    q1,
    rounds.fillBlank.correctAnswer
  );
  session = { ...r2Ok.updatedSession, currentRound: 3, currentQuestionIndex: 0 };
  progress = r2Ok.updatedProgress;

  const r3Wrong = submitSessionAnswer(session, progress, initialBiologyData, q1, 'لا أعلم');
  assert.equal(r3Wrong.evaluation.isCorrect, false);
  assert.equal(advanceSessionStep(r3Wrong.updatedSession).advanced, false);
  assert.equal(r3Wrong.updatedProgress.questionStats[q1.id].wrongCount, 3);
});

test('5. Exit and reopen mid-quiz restores exact question index, round, user answers, and lesson scroll position from IndexedDB', async () => {
  const lesson1 = initialBiologyData.lessons[0];
  const qs = getLessonQuestions(lesson1.id, initialBiologyData);

  // Save reading position first
  saveLessonPosition({
    lessonId: lesson1.id,
    sectionIndex: 1,
    pageRef: lesson1.sections[1]?.pageRef || lesson1.pageNumber,
    scrollY: 420,
    updatedAt: new Date().toISOString(),
  });

  let progress = getStudentProgress();
  let session = createLessonMasterySession(lesson1, initialBiologyData, progress);

  // Complete Round 1 for all questions so we enter Round 2
  for (let i = 0; i < qs.length; i++) {
    const out = submitSessionAnswer(session, progress, initialBiologyData, qs[i], makeFreshAnswer(qs[i].id, 1));
    session = out.updatedSession;
    progress = out.updatedProgress;
    const adv = advanceSessionStep(session);
    session = adv.session;
  }

  assert.equal(session.currentRound, 2);
  assert.equal(session.currentQuestionIndex, 0);

  // Submit a wrong draft answer on Round 2 Q1 and persist
  const wrongDraft = 'محاولة غير مكتملة';
  const outWrong = submitSessionAnswer(session, progress, initialBiologyData, qs[0], wrongDraft);
  progress = saveStudentProgress(outWrong.updatedProgress, 'lesson_mastery', session.sessionId);
  saveActiveSession(outWrong.updatedSession, 'other');
  await flushStorageWrites();

  // Simulate full app close + reopen from IndexedDB
  resetMemoryCacheForReloadTest();
  await initStorage();
  const reloaded = getStudentProgress();

  assert.ok(reloaded.activeQuizSession, 'Active quiz session must be restored from IndexedDB');
  assert.equal(reloaded.activeQuizSession.lessonId, lesson1.id);
  assert.equal(reloaded.activeQuizSession.currentRound, 2);
  assert.equal(reloaded.activeQuizSession.currentQuestionIndex, 0);

  const savedStep = reloaded.activeQuizSession.stepStates[stepKey(qs[0].id, 2)];
  assert.ok(savedStep);
  assert.equal(savedStep.lastUserInput, wrongDraft);
  assert.equal(savedStep.wrongAttempts, 1);
  assert.equal(reloaded.lastLessonPosition?.scrollY, 420);
  assert.equal(reloaded.lastLessonPosition?.lessonId, lesson1.id);
});

test('6. Completed rounds, notes, and bookmarks survive reload without deleting student progress', async () => {
  const lesson1 = initialBiologyData.lessons[0];
  const qs = getLessonQuestions(lesson1.id, initialBiologyData);

  toggleLessonBookmark(lesson1.id);
  saveLessonNote(lesson1.id, 'ملاحظة مهمة عن خصائص الكائنات الحية');

  let progress = getStudentProgress();
  let session = createLessonMasterySession(lesson1, initialBiologyData, progress);

  // Complete Round 1 & Round 2 for q0
  let out = submitSessionAnswer(session, progress, initialBiologyData, qs[0], makeFreshAnswer(qs[0].id, 1));
  session = { ...out.updatedSession, currentRound: 2 };
  out = submitSessionAnswer(session, out.updatedProgress, initialBiologyData, qs[0], makeFreshAnswer(qs[0].id, 2));

  saveStudentProgress(out.updatedProgress, 'lesson_mastery', session.sessionId);
  await flushStorageWrites();

  // Reload from IndexedDB
  resetMemoryCacheForReloadTest();
  await initStorage();
  const reloaded = getStudentProgress();

  assert.deepEqual(reloaded.questionStats[qs[0].id].masteredRounds, [1, 2]);
  assert.deepEqual(reloaded.activeQuizSession?.completedRoundsByQuestion[qs[0].id], [1, 2]);
  assert.ok(reloaded.bookmarkedLessons.includes(lesson1.id));
  assert.equal(reloaded.lessonNotes[lesson1.id], 'ملاحظة مهمة عن خصائص الكائنات الحية');
});

test('7. Daily Quiz does NOT reset or regenerate when reopened on the same local calendar day', async () => {
  // Unlock several lessons first so daily pool is rich
  let progress = getStudentProgress();
  progress = masterEntireLesson('lesson-1-1', progress);
  progress = masterEntireLesson('lesson-1-2', progress);

  const morning = new Date(2026, 4, 15, 8, 30, 0); // May 15, 2026 08:30 local
  const firstBundle = getOrCreateDailyQuiz(initialBiologyData, progress, morning);
  assert.equal(firstBundle.wasCreatedNow, true);
  assert.ok(firstBundle.session);

  let session = firstBundle.session!;
  progress = saveStudentProgress(firstBundle.updatedProgress, 'daily_quiz', firstBundle.dateKey);

  // Answer first 2 questions of today's daily quiz (including 1 wrong attempt first)
  for (let i = 0; i < 2; i++) {
    const qId = session.questionIds[session.currentQuestionIndex];
    const q = initialBiologyData.questions.find((item) => item.id === qId)!;
    const round = session.assignedRoundByQuestion![qId];
    if (i === 0) {
      const wrongInput = round === 1 ? 99 : 'إجابة خاطئة';
      const wOut = submitSessionAnswer(session, progress, initialBiologyData, q, wrongInput);
      session = wOut.updatedSession;
      progress = wOut.updatedProgress;
    }
    const cOut = submitSessionAnswer(session, progress, initialBiologyData, q, makeFreshAnswer(qId, round));
    session = cOut.updatedSession;
    progress = syncDailyRecordFromSession(cOut.updatedProgress, session, morning);
    const adv = advanceSessionStep(session);
    session = adv.session;
    progress = { ...progress, activeDailySession: session };
  }

  saveStudentProgress(progress, 'daily_quiz', firstBundle.dateKey);
  await flushStorageWrites();

  // Reload app later on the SAME local day
  resetMemoryCacheForReloadTest();
  await initStorage();
  const reloadedProgress = getStudentProgress();

  const evening = new Date(2026, 4, 15, 21, 45, 0); // Same local day 21:45
  const secondBundle = getOrCreateDailyQuiz(initialBiologyData, reloadedProgress, evening);

  assert.equal(secondBundle.wasCreatedNow, false, 'Same local day must NOT regenerate daily quiz');
  assert.equal(secondBundle.dateKey, getLocalDateKey(morning));
  assert.deepEqual(secondBundle.record.questionIds, firstBundle.record.questionIds);
  assert.equal(secondBundle.record.completedQuestionIds.length, 2);
  assert.equal(secondBundle.session?.currentQuestionIndex, 2);
  assert.equal(secondBundle.record.wrongAttempts, 1);
});

test('8. New local calendar day creates fresh Daily Quiz across unlocked lessons, mixes rounds, prioritizes mistakes, and never unlocks locked lessons', async () => {
  let progress = getStudentProgress();
  // Unlock lessons 1-1, 1-2, 1-3, 2-1, 2-2 (>= 12 unlocked questions across 5 lessons; lesson 2-3+ stay locked)
  progress = masterEntireLesson('lesson-1-1', progress);
  progress = masterEntireLesson('lesson-1-2', progress);
  progress = masterEntireLesson('lesson-1-3', progress);
  progress = masterEntireLesson('lesson-2-1', progress);

  assert.equal(
    isLessonLocked(
      initialBiologyData.lessons.find((l) => l.id === 'lesson-2-3')!,
      initialBiologyData,
      progress
    ),
    true
  );

  // Record a recent mistake on q-1-2 so Smart Review / Daily Quiz prioritizes it
  const wrongQ = initialBiologyData.questions.find((q) => q.id === 'q-1-2')!;
  const wellKnownQ = initialBiologyData.questions.find((q) => q.id === 'q-1-1')!;
  progress.questionStats[wrongQ.id] = {
    questionId: wrongQ.id,
    attempts: 4,
    correctCount: 1,
    wrongCount: 3,
    consecutiveCorrect: 0,
    masteredRounds: [1],
    isMastered: false,
    lastAttemptAt: new Date(2026, 4, 15, 10, 0, 0).toISOString(),
    lastWrongAt: new Date(2026, 4, 15, 10, 0, 0).toISOString(),
  };
  progress.questionStats[wellKnownQ.id] = {
    questionId: wellKnownQ.id,
    attempts: 6,
    correctCount: 6,
    wrongCount: 0,
    consecutiveCorrect: 6,
    masteredRounds: [1, 2, 3],
    isMastered: true,
    lastAttemptAt: new Date(2026, 4, 15, 10, 0, 0).toISOString(),
  };

  assert.ok(
    computeSmartReviewPriority(wrongQ, progress.questionStats[wrongQ.id]) >
      computeSmartReviewPriority(wellKnownQ, progress.questionStats[wellKnownQ.id]),
    'Repeatedly wrong questions must outrank repeatedly mastered questions'
  );

  const day1 = new Date(2026, 4, 15, 9, 0, 0);
  const b1 = getOrCreateDailyQuiz(initialBiologyData, progress, day1);
  progress = saveStudentProgress(b1.updatedProgress, 'daily_quiz', b1.dateKey);

  // Move to NEXT local day
  const day2 = new Date(2026, 4, 16, 9, 0, 0);
  const b2 = getOrCreateDailyQuiz(initialBiologyData, progress, day2);

  assert.equal(b2.wasCreatedNow, true);
  assert.notEqual(b2.dateKey, b1.dateKey);
  assert.equal(b2.record.questionIds.length, 10, 'Default daily quiz has 10 questions');
  assert.ok(b2.record.questionIds.includes(wrongQ.id), 'Previously wrong question prioritized');

  // Ensure multiple lessons represented (not stuck on latest lesson only)
  const distinctLessons = new Set(
    b2.record.questionIds.map(
      (id) => initialBiologyData.questions.find((q) => q.id === id)!.lessonId
    )
  );
  assert.ok(distinctLessons.size >= 3, 'Daily quiz spreads across multiple unlocked lessons');

  // Ensure zero questions from locked lessons & no locked lesson becomes unlocked
  for (const qId of b2.record.questionIds) {
    const q = initialBiologyData.questions.find((item) => item.id === qId)!;
    const l = initialBiologyData.lessons.find((item) => item.id === q.lessonId)!;
    assert.equal(isLessonLocked(l, initialBiologyData, b2.updatedProgress), false);
  }

  // Ensure mix of rounds (1, 2, 3)
  const roundTypesUsed = new Set(Object.values(b2.record.assignedRoundByQuestion));
  assert.equal(roundTypesUsed.size, 3, 'Daily quiz mixes all 3 round types');

  // Ensure Smart Review works independently and never unlocks locked lessons
  const smartSession = createSmartReviewSession(initialBiologyData, b2.updatedProgress, 6);
  assert.equal(smartSession.questionIds[0], wrongQ.id);
  assert.equal(
    isLessonLocked(
      initialBiologyData.lessons.find((l) => l.id === 'lesson-2-3')!,
      initialBiologyData,
      b2.updatedProgress
    ),
    true
  );
});

test('9. Previous Daily Quiz results remain preserved in history log across local dates', async () => {
  let progress = masterEntireLesson('lesson-1-1', getStudentProgress());
  const day1 = new Date(2026, 4, 10, 12, 0, 0);
  const b1 = getOrCreateDailyQuiz(initialBiologyData, progress, day1);
  let session = b1.session!;
  progress = b1.updatedProgress;

  // Complete all Day 1 daily quiz questions cleanly
  while (true) {
    const qId = session.questionIds[session.currentQuestionIndex];
    const q = initialBiologyData.questions.find((item) => item.id === qId)!;
    const r = session.assignedRoundByQuestion![qId];
    const out = submitSessionAnswer(session, progress, initialBiologyData, q, makeFreshAnswer(qId, r));
    session = out.updatedSession;
    progress = syncDailyRecordFromSession(out.updatedProgress, session, day1);
    const adv = advanceSessionStep(session);
    if (adv.isComplete) break;
    session = adv.session;
    progress = { ...progress, activeDailySession: session };
  }

  // Create Day 2 daily quiz
  const day2 = new Date(2026, 4, 11, 10, 0, 0);
  const b2 = getOrCreateDailyQuiz(initialBiologyData, progress, day2);
  saveStudentProgress(b2.updatedProgress, 'daily_quiz', b2.dateKey);
  await flushStorageWrites();

  // Reload and inspect Daily Quiz History
  resetMemoryCacheForReloadTest();
  await initStorage();
  const history = getDailyQuizHistory(getStudentProgress());
  assert.equal(history.length, 2);
  assert.equal(history[0].dateKey, '2026-05-11');
  assert.equal(history[1].dateKey, '2026-05-10');
  assert.equal(history[1].status, 'completed');
  assert.equal(history[1].percentage, 100);
});

test('10. App engine & IndexedDB persistence operate 100% offline with zero network calls + settings persistence', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('NETWORK_FORBIDDEN_OFFLINE_TEST');
  }) as typeof fetch;

  try {
    // Update settings (dailyQuizQuestionCount -> 15)
    let progress = updateAppSettings({ dailyQuizQuestionCount: 15 });
    progress = masterEntireLesson('lesson-1-1', progress);
    progress = masterEntireLesson('lesson-1-2', progress);
    progress = masterEntireLesson('lesson-1-3', progress);
    progress = masterEntireLesson('lesson-2-1', progress);
    progress = masterEntireLesson('lesson-2-2', progress);

    const day = new Date(2026, 4, 20, 14, 0, 0);
    const daily = getOrCreateDailyQuiz(initialBiologyData, progress, day);
    assert.equal(daily.record.targetQuestionCount, 15);
    assert.equal(daily.record.questionIds.length, 15);

    saveStudentProgress(daily.updatedProgress, 'daily_quiz', daily.dateKey);
    await flushStorageWrites();

    resetMemoryCacheForReloadTest();
    await initStorage();
    const afterReload = getStudentProgress();
    assert.equal(afterReload.settings.dailyQuizQuestionCount, 15);
    assert.equal(afterReload.syncMetadata.schemaVersion, 2);
    assert.ok(afterReload.syncMetadata.pendingSyncQueue.length > 0);
    assert.equal(fetchCalled, false, 'Zero network requests permitted in offline app');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
