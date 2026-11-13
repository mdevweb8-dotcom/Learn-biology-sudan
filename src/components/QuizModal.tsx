import React, { useState, useEffect } from 'react';
import {
  ActiveQuizSession,
  BiologyDatabase,
  QuizQuestion,
  RoundNumber,
  StudentProgress,
} from '../types/biology';
import { DiagramViewer } from './DiagramViewer';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowLeft,
  RotateCcw,
  Award,
  Bookmark,
  Brain,
  PenLine,
  ListChecks,
  Save,
  AlertTriangle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  advanceSessionStep,
  getActiveRoundForSessionQuestion,
  getSessionProgressCounts,
  isSessionFullyCompleted,
  resolveQuestionRounds,
  ROUND_LABELS,
  stepKey,
  submitSessionAnswer,
} from '../utils/questionEngine';
import { saveActiveSession, saveStudentProgress, toggleQuestionBookmark } from '../utils/storage';
import { syncDailyRecordFromSession } from '../utils/dailyQuizEngine';

interface QuizModalProps {
  session: ActiveQuizSession;
  database: BiologyDatabase;
  progress: StudentProgress;
  onUpdateState: (updatedProgress: StudentProgress, options?: { lessonNewlyMastered?: boolean; lessonId?: string }) => void;
  onClose: () => void;
  onRestartSession?: () => void;
}

export const QuizModal: React.FC<QuizModalProps> = ({
  session: initialSession,
  database,
  progress,
  onUpdateState,
  onClose,
  onRestartSession,
}) => {
  const [session, setSession] = useState<ActiveQuizSession>(initialSession);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [writtenAnswer, setWrittenAnswer] = useState<string>('');
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    message: string;
    explanation?: string;
    referenceAnswer?: string;
  } | null>(null);
  const [isFinished, setIsFinished] = useState<boolean>(() =>
    isSessionFullyCompleted(initialSession)
  );
  const [lessonJustMastered, setLessonJustMastered] = useState(false);

  const sessionQuestions: QuizQuestion[] = session.questionIds
    .map((id) => database.questions.find((q) => q.id === id))
    .filter((q): q is QuizQuestion => Boolean(q));

  const currentQ = sessionQuestions[session.currentQuestionIndex];
  const activeRound: RoundNumber = currentQ
    ? getActiveRoundForSessionQuestion(session, currentQ.id)
    : session.currentRound;

  const isBookmarked = currentQ ? progress.bookmarkedQuestions.includes(currentQ.id) : false;

  // Restore saved step input/feedback whenever question or round changes (exact resume)
  useEffect(() => {
    if (!currentQ) return;
    const key = stepKey(currentQ.id, activeRound);
    const savedStep = session.stepStates[key];

    if (savedStep) {
      if (activeRound === 1) {
        setSelectedOption(typeof savedStep.lastUserInput === 'number' ? savedStep.lastUserInput : null);
        setWrittenAnswer('');
      } else {
        setWrittenAnswer(typeof savedStep.lastUserInput === 'string' ? savedStep.lastUserInput : '');
        setSelectedOption(null);
      }

      if (savedStep.isCorrect) {
        const rounds = resolveQuestionRounds(currentQ);
        const refAns =
          activeRound === 1
            ? rounds.mcq.options[rounds.mcq.correctIndex]
            : activeRound === 2
            ? rounds.fillBlank.correctAnswer
            : rounds.openRecall.referenceAnswer;
        setFeedback({
          isCorrect: true,
          message: savedStep.feedbackMessage || 'إجابة صحيحة!',
          explanation: currentQ.explanation,
          referenceAnswer: refAns,
        });
      } else if (savedStep.wrongAttempts > 0 && savedStep.feedbackMessage) {
        setFeedback({
          isCorrect: false,
          message: savedStep.feedbackMessage,
        });
      } else {
        setFeedback(null);
      }
    } else {
      setSelectedOption(null);
      setWrittenAnswer('');
      setFeedback(null);
    }
  }, [currentQ?.id, activeRound]);

  if (!currentQ && !isFinished) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center max-w-sm w-full">
          <HelpCircle className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-200 mb-2">لا توجد أسئلة متاحة حالياً</h3>
          <p className="text-xs text-slate-400 mb-4">يمكنك العودة للدرس والمحاولة لاحقاً.</p>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    );
  }

  const persistSessionProgress = (
    nextSession: ActiveQuizSession,
    nextProgressBase: StudentProgress,
    lessonNewlyMastered: boolean
  ) => {
    let finalProgress = nextProgressBase;
    if (nextSession.mode === 'daily_quiz') {
      finalProgress = syncDailyRecordFromSession(finalProgress, nextSession);
    }
    const savedProgress = saveStudentProgress(
      finalProgress,
      nextSession.mode === 'daily_quiz' ? 'daily_quiz' : 'lesson_mastery',
      nextSession.sessionId
    );
    onUpdateState(savedProgress, {
      lessonNewlyMastered,
      lessonId: nextSession.lessonId,
    });
  };

  const handleConfirmAnswer = () => {
    if (!currentQ) return;
    if (feedback?.isCorrect) return;

    const userInput = activeRound === 1 ? selectedOption : writtenAnswer;
    if (activeRound === 1 && userInput === null) return;

    const outcome = submitSessionAnswer(session, progress, database, currentQ, userInput);

    setSession(outcome.updatedSession);
    if (outcome.lessonNewlyMastered) {
      setLessonJustMastered(true);
    }

    setFeedback({
      isCorrect: outcome.evaluation.isCorrect,
      message: outcome.evaluation.feedbackMessage,
      explanation: outcome.evaluation.explanation,
      referenceAnswer: outcome.evaluation.referenceAnswer,
    });

    persistSessionProgress(
      outcome.updatedSession,
      outcome.updatedProgress,
      outcome.lessonNewlyMastered
    );
  };

  const handleAdvanceNext = () => {
    const stepCheck = advanceSessionStep(session);
    if (!stepCheck.advanced && !stepCheck.isComplete) {
      // Blocked: wrong or unanswered step cannot advance
      return;
    }

    if (stepCheck.isComplete) {
      setIsFinished(true);
      let completedProgress = progress;
      if (session.mode === 'daily_quiz') {
        completedProgress = syncDailyRecordFromSession(progress, session);
        completedProgress = {
          ...completedProgress,
          activeDailySession: null,
        };
      } else {
        completedProgress = {
          ...completedProgress,
          activeQuizSession: null,
        };
      }
      const saved = saveStudentProgress(
        completedProgress,
        session.mode === 'daily_quiz' ? 'daily_quiz' : 'lesson_mastery',
        session.sessionId
      );
      onUpdateState(saved, {
        lessonNewlyMastered: lessonJustMastered,
        lessonId: session.lessonId,
      });

      try {
        confetti({
          particleCount: 85,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // Ignore in headless/test environments
      }
      return;
    }

    setSession(stepCheck.session);
    const savedProgress = saveActiveSession(
      stepCheck.session,
      stepCheck.session.mode === 'daily_quiz' ? 'daily_quiz' : 'other'
    );
    onUpdateState(savedProgress);
  };

  const handleSaveAndExit = () => {
    if (!isFinished) {
      const sessionWithDraft: ActiveQuizSession = {
        ...session,
        updatedAt: new Date().toISOString(),
      };
      const savedProgress = saveActiveSession(
        sessionWithDraft,
        sessionWithDraft.mode === 'daily_quiz' ? 'daily_quiz' : 'other'
      );
      onUpdateState(savedProgress);
    }
    onClose();
  };

  const handleToggleQuestionFav = () => {
    if (!currentQ) return;
    toggleQuestionBookmark(currentQ.id);
    onUpdateState({
      ...progress,
      bookmarkedQuestions: isBookmarked
        ? progress.bookmarkedQuestions.filter((id) => id !== currentQ.id)
        : [...progress.bookmarkedQuestions, currentQ.id],
    });
  };

  // Summary / Results Screen after completing ALL required rounds
  if (isFinished) {
    const progressCounts = getSessionProgressCounts(session);
    const totalQuestions = sessionQuestions.length;
    const firstTryCorrectSteps = Object.values(session.stepStates).filter(
      (s) => s.isCorrect && s.wrongAttempts === 0
    ).length;
    const accuracyPercent =
      progressCounts.totalSteps > 0
        ? Math.max(0, Math.round((firstTryCorrectSteps / progressCounts.totalSteps) * 100))
        : 100;

    return (
      <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md overflow-y-auto flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl my-auto text-right space-y-5">
          <div className="text-center pb-4 border-b border-slate-800">
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-3 bg-emerald-500/20 text-emerald-400 ring-4 ring-emerald-500/20">
              <Award className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-slate-100">
              {session.mode === 'lesson_mastery'
                ? 'تم إتقان الدرس بنجاح!'
                : session.mode === 'daily_quiz'
                ? 'أحسنت! أتممت الاختبار اليومي'
                : 'اكتملت جلسة المراجعة بنجاح'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">{session.title}</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-black text-emerald-400 font-mono">{accuracyPercent}%</p>
              <p className="text-[11px] text-slate-400 mt-0.5">دقة المحاولة الأولى</p>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-100 font-mono">
                {progressCounts.completedSteps} / {progressCounts.totalSteps}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">الخطوات المتقنة</p>
            </div>
            <div>
              <p className="text-2xl font-black text-amber-400 font-mono">
                {session.totalWrongAttempts}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">أخطاء تم تصحيحها</p>
            </div>
          </div>

          {session.mode === 'lesson_mastery' && (
            <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800/50 text-xs text-emerald-200 leading-relaxed">
              ✓ تم اجتياز جميع الأسئلة ({totalQuestions} سؤال) عبر الجولات الثلاث (الاختيار من متعدد، أكمل الإجابة، والاستدعاء من الذاكرة)، وتم توثيق إتقانك في قاعدة البيانات المحلية.
            </div>
          )}

          {session.mode === 'daily_quiz' && (
            <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800/50 text-xs text-emerald-200 leading-relaxed">
              ✓ تم حفظ نتيجة الاختبار اليومي في سجل الأداء اليومي بتاريخ {session.dailyDateKey} دون نت، وسيتم جدولة اختبار جديد في اليوم التالي تلقائياً.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {onRestartSession && session.mode !== 'daily_quiz' && (
              <button
                onClick={onRestartSession}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition"
              >
                <RotateCcw className="w-4 h-4" />
                إعادة التدريب من البداية
              </button>
            )}
            <button
              onClick={onClose}
              className={`py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 transition ${
                !onRestartSession || session.mode === 'daily_quiz' ? 'sm:col-span-2' : ''
              }`}
            >
              تم ومتابعة المذاكرة
            </button>
          </div>
        </div>
      </div>
    );
  }

  const rounds = resolveQuestionRounds(currentQ);
  const counts = getSessionProgressCounts(session);
  const currentStepState = session.stepStates[stepKey(currentQ.id, activeRound)];
  const currentQCompletedRounds = session.completedRoundsByQuestion[currentQ.id] || [];
  const isStepCleared = feedback?.isCorrect === true;

  const diagramObj =
    currentQ.type === 'diagram_label' && currentQ.diagramData
      ? database.lessons
          .flatMap((l) => l.diagrams || [])
          .find(
            (d) =>
              d.type === 'cell_structure' ||
              d.type.includes(currentQ.diagramData?.diagramType || '')
          )
      : null;

  const getRoundIcon = (r: RoundNumber) => {
    if (r === 1) return <ListChecks className="w-3.5 h-3.5" />;
    if (r === 2) return <PenLine className="w-3.5 h-3.5" />;
    return <Brain className="w-3.5 h-3.5" />;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col safe-top safe-bottom">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/95 border-b border-slate-800 text-right gap-2">
        <button
          onClick={handleSaveAndExit}
          className="text-xs text-slate-300 hover:text-white px-3 py-2 rounded-xl bg-slate-800 transition flex items-center gap-1.5 shrink-0"
        >
          <Save className="w-3.5 h-3.5 text-emerald-400" />
          <span>خروج وحفظ</span>
        </button>

        <div className="text-center min-w-0">
          <p className="text-[11px] text-slate-400 truncate">{session.title}</p>
          <p className="text-xs sm:text-sm font-bold text-slate-100">
            السؤال {session.currentQuestionIndex + 1} من {sessionQuestions.length}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleToggleQuestionFav}
            className={`p-2 rounded-xl transition ${
              isBookmarked ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
            aria-label="حفظ السؤال في المفضلة"
          >
            <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
          </button>
          <span className="text-[11px] text-emerald-400 font-mono bg-emerald-950/60 border border-emerald-800 px-2 py-1.5 rounded-lg">
            {currentQ.pageSource}
          </span>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="w-full bg-slate-800 h-2">
        <div
          className="bg-emerald-500 h-2 transition-all duration-300"
          style={{ width: `${Math.max(4, counts.percentage)}%` }}
        />
      </div>

      {/* Round & Attempt Status Strip */}
      <div className="bg-slate-900/70 border-b border-slate-800/80 px-4 py-2.5">
        <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-300 font-bold">
            {getRoundIcon(activeRound)}
            <span>{ROUND_LABELS[activeRound]}</span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
            <span>
              الخطوات: {counts.completedSteps}/{counts.totalSteps}
            </span>
            <span className="text-slate-600">|</span>
            <span>الأخطاء: {session.totalWrongAttempts}</span>
          </div>
        </div>

        {/* 3-Round Question Mastery Indicators (only shown for multi-round modes) */}
        {(session.mode === 'lesson_mastery' || session.mode === 'unit_review') && (
          <div className="max-w-2xl mx-auto grid grid-cols-3 gap-2 mt-2">
            {([1, 2, 3] as RoundNumber[]).map((r) => {
              const done = currentQCompletedRounds.includes(r);
              const isCurrent = r === activeRound;
              return (
                <div
                  key={r}
                  className={`py-1 px-2 rounded-lg text-[10px] font-bold text-center border transition ${
                    done
                      ? 'bg-emerald-950/60 border-emerald-600/70 text-emerald-300'
                      : isCurrent
                      ? 'bg-amber-950/40 border-amber-500/70 text-amber-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-500'
                  }`}
                >
                  {r === 1 ? '1. اختيار' : r === 2 ? '2. إكمال' : '3. استدعاء'} {done ? '✓' : ''}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Question Body */}
      <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full text-right flex flex-col justify-between gap-4">
        <div className="space-y-4">
          {/* Diagram Preview if applicable */}
          {currentQ.type === 'diagram_label' && diagramObj && (
            <div>
              <DiagramViewer
                diagram={diagramObj}
                interactive={false}
                highlightPartId={currentQ.diagramData?.targetPartId}
                showAllLabels={false}
              />
            </div>
          )}

          {/* Round 1: MCQ (No pre-reveal) */}
          {activeRound === 1 && (
            <>
              <h2 className="text-base sm:text-lg font-black text-slate-100 leading-snug">
                {rounds.mcq.prompt}
              </h2>

              <div className="space-y-2.5">
                {rounds.mcq.options.map((option, idx) => {
                  const isSelected = selectedOption === idx;
                  const isCorrectShown = isStepCleared && idx === rounds.mcq.correctIndex;
                  const isWrongSelected =
                    feedback && !feedback.isCorrect && isSelected;

                  let btnStyle =
                    'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700';
                  if (isCorrectShown) {
                    btnStyle =
                      'bg-emerald-950/70 border-emerald-500 text-emerald-200 ring-2 ring-emerald-500/30';
                  } else if (isWrongSelected) {
                    btnStyle =
                      'bg-rose-950/60 border-rose-500 text-rose-200 ring-2 ring-rose-500/30';
                  } else if (isSelected) {
                    btnStyle =
                      'bg-emerald-950/40 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/20';
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        if (isStepCleared) return;
                        setSelectedOption(idx);
                        if (feedback && !feedback.isCorrect) {
                          setFeedback(null);
                        }
                      }}
                      disabled={isStepCleared}
                      className={`w-full text-right p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 text-sm font-medium ${btnStyle}`}
                    >
                      <span className="flex-1 leading-relaxed">{option}</span>
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isCorrectShown
                            ? 'bg-emerald-500 text-slate-950'
                            : isWrongSelected
                            ? 'bg-rose-500 text-white'
                            : isSelected
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {isCorrectShown ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : isWrongSelected ? (
                          <XCircle className="w-4 h-4" />
                        ) : (
                          String.fromCharCode(65 + idx)
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Round 2: Fill-in-the-blank (NO options) */}
          {activeRound === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[11px] font-bold text-amber-400 block mb-2">
                  أكمل الفراغ بالكلمة أو العبارة العلمية الصحيحة (بدون خيارات):
                </span>
                <p className="text-base sm:text-lg font-black text-slate-100 leading-relaxed">
                  {rounds.fillBlank.promptWithBlank}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">
                  إجابتك في الفراغ:
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={writtenAnswer}
                  onChange={(e) => {
                    setWrittenAnswer(e.target.value);
                    if (feedback && !feedback.isCorrect) {
                      setFeedback(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isStepCleared) {
                      e.preventDefault();
                      handleConfirmAnswer();
                    }
                  }}
                  disabled={isStepCleared}
                  placeholder="اكتب الكلمة الناقصة بدقة هنا..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-2xl p-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition disabled:opacity-70"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Round 3: Open Recall (NO options and NO hints) */}
          {activeRound === 3 && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <span className="text-[11px] font-bold text-cyan-400 block mb-2">
                  استدعاء حر من الذاكرة (بدون خيارات أو تلميحات):
                </span>
                <h2 className="text-base sm:text-lg font-black text-slate-100 leading-relaxed">
                  {rounds.openRecall.prompt}
                </h2>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">
                  اكتب الإجابة العلمية من ذاكرتك:
                </label>
                <textarea
                  dir="rtl"
                  rows={4}
                  value={writtenAnswer}
                  onChange={(e) => {
                    setWrittenAnswer(e.target.value);
                    if (feedback && !feedback.isCorrect) {
                      setFeedback(null);
                    }
                  }}
                  disabled={isStepCleared}
                  placeholder="اشرح الإجابة العلمية بوضوح هنا..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-2xl p-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition leading-relaxed resize-none disabled:opacity-70"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Educational Post-Answer Feedback */}
          {feedback && (
            <div
              className={`p-4 rounded-2xl border transition-all space-y-2 ${
                feedback.isCorrect
                  ? 'bg-emerald-950/35 border-emerald-700/70 text-emerald-100'
                  : 'bg-rose-950/35 border-rose-700/70 text-rose-100'
              }`}
            >
              <div className="flex items-center justify-between gap-2 font-bold text-sm">
                <div className="flex items-center gap-2">
                  {feedback.isCorrect ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <span className="text-emerald-300">إجابة صحيحة!</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                      <span className="text-rose-300">إجابة خاطئة — يرجى تصحيحها للمتابعة</span>
                    </>
                  )}
                </div>
                {currentStepState && (
                  <span className="text-[11px] font-mono text-slate-400">
                    محاولات: {currentStepState.attempts}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-200 leading-relaxed">{feedback.message}</p>

              {feedback.isCorrect && feedback.explanation && (
                <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-300 leading-relaxed space-y-1">
                  {feedback.referenceAnswer && (
                    <p className="text-emerald-300 font-bold">
                      الإجابة المعتمدة: {feedback.referenceAnswer}
                    </p>
                  )}
                  <p>{feedback.explanation}</p>
                </div>
              )}

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                <span>المفهوم: {currentQ.scientificConcept}</span>
                <span className="font-mono text-emerald-400">{currentQ.pageSource}</span>
              </div>
            </div>
          )}
        </div>

        {/* Strict Bottom Actions: NO Skip, NO Bypass Finish */}
        <div className="pt-3 border-t border-slate-800">
          {!isStepCleared ? (
            <button
              onClick={handleConfirmAnswer}
              disabled={
                activeRound === 1 ? selectedOption === null : writtenAnswer.trim().length === 0
              }
              className={`w-full py-3.5 px-4 rounded-2xl font-bold text-sm transition shadow-lg flex items-center justify-center gap-2 ${
                (activeRound === 1 ? selectedOption === null : writtenAnswer.trim().length === 0)
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : feedback && !feedback.isCorrect
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
              }`}
            >
              {feedback && !feedback.isCorrect ? 'أعد المحاولة وتأكد من الإجابة' : 'تأكيد الإجابة'}
            </button>
          ) : (
            <button
              onClick={handleAdvanceNext}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2"
            >
              <span>
                {session.mode === 'daily_quiz' || session.mode === 'smart_review'
                  ? session.currentQuestionIndex === sessionQuestions.length - 1
                    ? 'عرض النتيجة النهائية'
                    : 'السؤال التالي'
                  : session.currentQuestionIndex === sessionQuestions.length - 1 &&
                    activeRound === 3
                  ? 'إنهاء وعرض نتيجة الإتقان'
                  : session.currentQuestionIndex === sessionQuestions.length - 1
                  ? `الانتقال إلى ${ROUND_LABELS[(activeRound + 1) as RoundNumber]}`
                  : 'السؤال التالي'}
              </span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
