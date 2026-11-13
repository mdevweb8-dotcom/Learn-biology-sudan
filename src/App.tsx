import React, { useState, useEffect, useMemo } from 'react';
import {
  ActiveQuizSession,
  BiologyDatabase,
  Unit,
  Lesson,
  StudentProgress,
} from './types/biology';
import {
  createDefaultStudentProgress,
  getStoredBiologyData,
  getStudentProgress,
  initStorage,
  saveActiveSession,
  saveStudentProgress,
} from './utils/storage';
import { initialBiologyData } from './data/biologyData';
import {
  createLessonMasterySession,
  createUnitReviewSession,
  isLessonLocked,
  isLessonMastered,
  ROUND_LABELS,
} from './utils/questionEngine';
import {
  createSmartReviewSession,
  getDailyQuizHistory,
  getLocalDateKey,
  getOrCreateDailyQuiz,
  getProgressionSummary,
} from './utils/dailyQuizEngine';
import { UnitView } from './components/UnitView';
import { LessonView } from './components/LessonView';
import { QuizModal } from './components/QuizModal';
import { SearchView } from './components/SearchView';
import { BookmarksView } from './components/BookmarksView';
import { DataImporterModal } from './components/DataImporterModal';
import { SettingsModal } from './components/SettingsModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { App as CapApp } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import {
  BookOpen,
  Search,
  Bookmark,
  Award,
  Zap,
  ChevronLeft,
  GraduationCap,
  Sparkles,
  Database,
  TrendingUp,
  Bell,
  Lock,
  CalendarCheck,
  Brain,
  PlayCircle,
  History,
  CheckCircle2,
} from 'lucide-react';

type NavigationTab = 'home' | 'search' | 'quizzes' | 'bookmarks';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [database, setDatabase] = useState<BiologyDatabase>(initialBiologyData);
  const [progress, setProgress] = useState<StudentProgress>(() =>
    createDefaultStudentProgress()
  );
  const [activeTab, setActiveTab] = useState<NavigationTab>('home');

  // Navigation Stack State
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

  // Active Unified 3-Round Quiz / Daily Quiz / Smart Review Session
  const [activeSession, setActiveSession] = useState<ActiveQuizSession | null>(null);

  // Data & Settings & Daily History Modals
  const [showDataModal, setShowDataModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDailyHistoryModal, setShowDailyHistoryModal] = useState(false);

  // Lock / Unlock Stage Progression Modals
  const [lockedStageAlert, setLockedStageAlert] = useState<{
    targetLesson: Lesson;
    previousLesson: Lesson;
  } | null>(null);
  const [newlyUnlockedLesson, setNewlyUnlockedLesson] = useState<Lesson | null>(null);

  // Hydrate unified IndexedDB storage on startup before displaying UI
  useEffect(() => {
    let active = true;
    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, 900));

    Promise.all([initStorage(), minDelay]).then(() => {
      if (!active) return;
      setDatabase(getStoredBiologyData());
      setProgress(getStudentProgress());
      setShowSplash(false);
    });

    return () => {
      active = false;
    };
  }, []);

  // Android Hardware & Keyboard Back Button Handling
  useEffect(() => {
    let listenerHandle: PluginListenerHandle | null = null;
    let isCancelled = false;

    const handleBackAction = (): boolean => {
      if (lockedStageAlert) {
        setLockedStageAlert(null);
        return true;
      }
      if (newlyUnlockedLesson) {
        setNewlyUnlockedLesson(null);
        return true;
      }
      if (showDailyHistoryModal) {
        setShowDailyHistoryModal(false);
        return true;
      }
      if (showSettingsModal) {
        setShowSettingsModal(false);
        return true;
      }
      if (showDataModal) {
        setShowDataModal(false);
        return true;
      }
      if (activeSession) {
        // Persist exact progress and exit cleanly without losing state
        const updated = saveActiveSession(
          activeSession,
          activeSession.mode === 'daily_quiz' ? 'daily_quiz' : 'other'
        );
        setProgress(updated);
        setActiveSession(null);
        return true;
      }
      if (selectedLesson) {
        setSelectedLesson(null);
        return true;
      }
      if (selectedUnit) {
        setSelectedUnit(null);
        return true;
      }
      if (activeTab !== 'home') {
        setActiveTab('home');
        return true;
      }
      return false;
    };

    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('backButton', ({ canGoBack }) => {
        const handled = handleBackAction();
        if (!handled && !canGoBack) {
          CapApp.exitApp();
        }
      })
        .then((handle) => {
          if (isCancelled) {
            handle?.remove();
          } else {
            listenerHandle = handle;
          }
        })
        .catch((err) => {
          console.warn('Capacitor backButton listener error:', err);
        });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBackAction();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      isCancelled = true;
      if (listenerHandle) {
        listenerHandle.remove();
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    lockedStageAlert,
    newlyUnlockedLesson,
    showDailyHistoryModal,
    showSettingsModal,
    showDataModal,
    activeSession,
    selectedLesson,
    selectedUnit,
    activeTab,
  ]);

  const refreshProgressState = () => {
    setProgress(getStudentProgress());
  };

  // Mastered lesson IDs derived strictly from questionStats (3 rounds per question)
  const masteredLessonIds = useMemo(() => {
    return database.lessons
      .filter((l) => isLessonMastered(l.id, database, progress))
      .map((l) => l.id);
  }, [database, progress]);

  const getEnrichedLessons = (lessons: Lesson[]): Lesson[] => {
    return lessons.map((l) => ({
      ...l,
      isLocked: isLessonLocked(l, database, progress),
    }));
  };

  // Strict Lesson Selection Guard: never open LessonView if locked
  const handleSelectLesson = (lesson: Lesson) => {
    const locked = isLessonLocked(lesson, database, progress);
    if (locked) {
      const lessonIndex = database.lessons.findIndex((l) => l.id === lesson.id);
      const prev = lessonIndex > 0 ? database.lessons[lessonIndex - 1] : null;
      if (prev) {
        setLockedStageAlert({
          targetLesson: lesson,
          previousLesson: prev,
        });
      }
      return;
    }

    const parentUnit = database.units.find((u) => u.id === lesson.unitId);
    if (parentUnit) {
      setSelectedUnit(parentUnit);
    }
    setSelectedLesson({
      ...lesson,
      isLocked: false,
    });
  };

  // Launch or resume 3-Round Lesson Mastery Quiz
  const handleStartLessonQuiz = (lesson: Lesson, forceNew: boolean = false) => {
    const session = createLessonMasterySession(lesson, database, progress, forceNew);
    const updated = saveActiveSession(session, 'other');
    setProgress(updated);
    setActiveSession(session);
  };

  // Launch 3-Round Comprehensive Unit Review Quiz
  const handleStartUnitQuiz = (unit: Unit) => {
    const questions = database.questions.filter((q) => q.unitId === unit.id);
    const session = createUnitReviewSession(unit.title, unit.id, questions);
    const updated = saveActiveSession(session, 'other');
    setProgress(updated);
    setActiveSession(session);
  };

  // Launch or resume Today's Daily Quiz (local device date)
  const handleStartDailyQuiz = () => {
    const bundle = getOrCreateDailyQuiz(database, progress, new Date());
    const saved = saveStudentProgress(bundle.updatedProgress, 'daily_quiz', bundle.dateKey);
    setProgress(saved);
    if (bundle.session) {
      setActiveSession(bundle.session);
    } else {
      // Completed today -> open Daily Quiz history summary modal cleanly
      setShowDailyHistoryModal(true);
    }
  };

  // Launch Smart Review (mistakes & unmastered concepts prioritized; never unlocks locked lessons)
  const handleStartSmartReview = () => {
    const session = createSmartReviewSession(database, progress, 8);
    const updated = saveActiveSession(session, 'other');
    setProgress(updated);
    setActiveSession(session);
  };

  const handleResumeSavedQuiz = (session: ActiveQuizSession) => {
    setActiveSession(session);
  };

  const handleQuizStateUpdate = (
    updatedProgress: StudentProgress,
    options?: { lessonNewlyMastered?: boolean; lessonId?: string }
  ) => {
    setProgress(updatedProgress);

    if (options?.lessonNewlyMastered && options.lessonId) {
      const currentIndex = database.lessons.findIndex((l) => l.id === options.lessonId);
      if (currentIndex >= 0 && currentIndex < database.lessons.length - 1) {
        setNewlyUnlockedLesson(database.lessons[currentIndex + 1]);
      }
    }
  };

  const handleRestartActiveSession = () => {
    if (!activeSession) return;
    if (activeSession.mode === 'lesson_mastery' && activeSession.lessonId) {
      const lesson = database.lessons.find((l) => l.id === activeSession.lessonId);
      if (lesson) {
        handleStartLessonQuiz(lesson, true);
        return;
      }
    }
    if (activeSession.mode === 'unit_review' && activeSession.unitId) {
      const unit = database.units.find((u) => u.id === activeSession.unitId);
      if (unit) {
        handleStartUnitQuiz(unit);
        return;
      }
    }
    if (activeSession.mode === 'smart_review') {
      handleStartSmartReview();
    }
  };

  // Metrics
  const progressionSummary = useMemo(
    () => getProgressionSummary(database, progress),
    [database, progress]
  );

  const overallPercentage = Math.min(
    100,
    Math.round(
      (progressionSummary.masteredCount / (progressionSummary.totalCount || 1)) * 100
    )
  );

  const todayKey = getLocalDateKey(new Date());
  const todayDailyRecord = progress.dailyQuizByDate[todayKey] || null;
  const dailyHistoryList = useMemo(() => getDailyQuizHistory(progress), [progress]);

  const totalQuestionStatsCount = Object.values(progress.questionStats).filter(
    (s) => s.isMastered
  ).length;
  const weakQuestionsCount = Object.values(progress.questionStats).filter(
    (s) => s.wrongCount > 0 && s.consecutiveCorrect < 2
  ).length;

  // Resolve resume target for "متابعة من حيث توقفت"
  const resumeInfo = useMemo(() => {
    const pausedQuiz = progress.activeQuizSession;
    const pausedDaily = progress.activeDailySession;
    const enriched = getEnrichedLessons(database.lessons);

    let readingLesson =
      progress.lastLessonPosition
        ? enriched.find((l) => l.id === progress.lastLessonPosition?.lessonId && !l.isLocked)
        : undefined;

    if (!readingLesson && progress.lastActiveLessonId) {
      readingLesson = enriched.find(
        (l) => l.id === progress.lastActiveLessonId && !l.isLocked
      );
    }
    if (!readingLesson) {
      const unlocked = enriched.filter((l) => !l.isLocked);
      readingLesson = unlocked[unlocked.length - 1] || enriched[0];
    }

    return {
      pausedQuiz,
      pausedDaily,
      readingLesson,
      lastPageRef: progress.lastLessonPosition?.pageRef || readingLesson?.pageNumber,
    };
  }, [database.lessons, progress]);

  const renderLockedModal = () => {
    if (!lockedStageAlert) return null;
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 text-right">
        <div className="bg-slate-900 border border-amber-900/60 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-950/80 border border-amber-800/80 flex items-center justify-center text-amber-400 shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-100">هذه المرحلة مقفلة 🔒</h3>
              <p className="text-xs text-amber-400 font-medium">
                يتطلب فتحها إتقان أسئلة الدرس السابق
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs leading-relaxed">
            <p className="text-slate-300">
              لا يمكن الدخول إلى درس{' '}
              <strong className="text-emerald-300 font-bold">
                «{lockedStageAlert.targetLesson.title}»
              </strong>{' '}
              إلا بعد إكمال وإتقان جميع أسئلة الدرس السابق عبر الجولات الثلاث.
            </p>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span>الدرس السابق المطلوب إتقانه:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {lockedStageAlert.previousLesson.pageRange}
                </span>
              </div>
              <p className="text-sm font-bold text-slate-200">
                {lockedStageAlert.previousLesson.title}
              </p>
              <div className="pt-1.5 border-t border-slate-800/80 text-[11px] text-amber-300">
                الجولات المطلوبة لكل سؤال: اختيار من متعدد ← أكمل الإجابة ← استدعاء من الذاكرة
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => {
                const prev = lockedStageAlert.previousLesson;
                setLockedStageAlert(null);
                handleStartLessonQuiz(prev);
              }}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition"
            >
              <Zap className="w-4 h-4" />
              بدء اختبار إتقان الدرس السابق 🔓
            </button>
            <button
              onClick={() => setLockedStageAlert(null)}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderUnlockedModal = () => {
    if (!newlyUnlockedLesson) return null;
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 text-center">
        <div className="bg-slate-900 border border-emerald-900/60 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
            <Sparkles className="w-8 h-8" />
          </div>

          <h3 className="text-lg font-black text-emerald-400">تهانينا! فُتحت مرحلة جديدة 🎉</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            أحسنت! أتممت إتقان جميع الأسئلة عبر الجولات الثلاث وتم فتح الدرس التالي:
            <br />
            <strong className="text-slate-100 text-sm block mt-2 font-bold">
              «{newlyUnlockedLesson.title}»
            </strong>
          </p>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              onClick={() => {
                const lessonToOpen = newlyUnlockedLesson;
                setNewlyUnlockedLesson(null);
                setActiveSession(null);
                handleSelectLesson(lessonToOpen);
              }}
              className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition"
            >
              <BookOpen className="w-4 h-4" />
              الانتقال للدرس المفتوح الآن
            </button>
            <button
              onClick={() => setNewlyUnlockedLesson(null)}
              className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDailyHistoryModal = () => {
    if (!showDailyHistoryModal) return null;
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 text-right">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">سجل الاختبارات اليومية</h2>
                <p className="text-xs text-slate-400">مؤشر الأداء والمواظبة اليومية بدون إنترنت</p>
              </div>
            </div>
            <button
              onClick={() => setShowDailyHistoryModal(false)}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {dailyHistoryList.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400 space-y-2">
                <CalendarCheck className="w-8 h-8 text-slate-600 mx-auto" />
                <p>لم تبدأ أي اختبار يومي بعد. ابدأ اختبار اليوم الآن!</p>
              </div>
            ) : (
              dailyHistoryList.map((item) => (
                <div
                  key={item.dateKey}
                  className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-emerald-400">
                        {item.dateKey}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-xs font-bold text-slate-200">
                        {item.status === 'completed' ? 'مكتمل ✓' : 'قيد التقدم'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      الأسئلة المنجزة: {item.completedQuestionIds.length} من {item.total} • الأخطاء:{' '}
                      {item.wrongAttempts}
                    </p>
                  </div>
                  <div className="text-left shrink-0">
                    <span
                      className={`font-mono font-black text-sm px-3 py-1.5 rounded-xl border ${
                        item.percentage >= 80
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                          : item.percentage >= 50
                          ? 'bg-amber-950 text-amber-300 border-amber-700'
                          : 'bg-slate-900 text-slate-300 border-slate-700'
                      }`}
                    >
                      {item.percentage}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-slate-800">
            <button
              onClick={() => setShowDailyHistoryModal(false)}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Splash Screen View
  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.35)] animate-pulse">
            <GraduationCap className="w-12 h-12 text-slate-950 stroke-[2.2]" />
          </div>
        </div>

        <h1 className="text-3xl font-black text-slate-100 tracking-tight mb-2">أحياء - Biology</h1>
        <p className="text-sm font-medium text-emerald-400/90 mb-8 max-w-xs">
          التطبيق التعليمي التفاعلي الكامل لكتاب الأحياء (Offline)
        </p>

        <div className="w-48 h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full w-full"></div>
        </div>
        <span className="text-[11px] text-slate-500 font-mono mt-4">
          جاري تحميل قاعدة البيانات المحلية (IndexedDB)...
        </span>
      </div>
    );
  }

  // Active Quiz Modal can overlay any screen cleanly
  const activeQuizOverlay = activeSession ? (
    <QuizModal
      key={activeSession.sessionId}
      session={activeSession}
      database={database}
      progress={progress}
      onUpdateState={handleQuizStateUpdate}
      onClose={() => {
        refreshProgressState();
        setActiveSession(null);
      }}
      onRestartSession={handleRestartActiveSession}
    />
  ) : null;

  // Lesson Sub-view
  if (selectedLesson && selectedUnit) {
    if (isLessonLocked(selectedLesson, database, progress)) {
      setSelectedLesson(null);
      return null;
    }

    return (
      <>
        <LessonView
          lesson={selectedLesson}
          unit={selectedUnit}
          database={database}
          progress={progress}
          onBack={() => setSelectedLesson(null)}
          onStartQuiz={(lesson) => handleStartLessonQuiz(lesson)}
          onProgressUpdated={setProgress}
        />
        {activeQuizOverlay}
        {newlyUnlockedLesson && renderUnlockedModal()}
      </>
    );
  }

  // Unit Sub-view
  if (selectedUnit) {
    const unitLessons = getEnrichedLessons(
      database.lessons.filter((l) => l.unitId === selectedUnit.id)
    );
    const unitQuestions = database.questions.filter((q) => q.unitId === selectedUnit.id);

    return (
      <>
        <UnitView
          unit={selectedUnit}
          lessons={unitLessons}
          completedLessonIds={masteredLessonIds}
          unitQuestions={unitQuestions}
          onSelectLesson={handleSelectLesson}
          onStartUnitQuiz={handleStartUnitQuiz}
          onBack={() => setSelectedUnit(null)}
        />
        {activeQuizOverlay}
        {lockedStageAlert && renderLockedModal()}
        {newlyUnlockedLesson && renderUnlockedModal()}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-20 safe-top">
      {/* Search Tab */}
      {activeTab === 'search' && (
        <SearchView database={database} onSelectLesson={handleSelectLesson} />
      )}

      {/* Bookmarks & Notes Tab */}
      {activeTab === 'bookmarks' && (
        <BookmarksView
          database={database}
          progress={progress}
          onSelectLesson={handleSelectLesson}
          onRefreshProgress={refreshProgressState}
        />
      )}

      {/* Quizzes Bank Tab */}
      {activeTab === 'quizzes' && (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 safe-top p-4 text-right max-w-2xl mx-auto w-full space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div>
              <h1 className="text-lg font-bold text-slate-100">بنك الاختبارات والتقييم الذاتي</h1>
              <p className="text-xs text-slate-400">
                اختبار يومي متجدد • مراجعة ذكية • اختبارات الوحدات بـ 3 جولات
              </p>
            </div>
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400">
              <Award className="w-6 h-6" />
            </div>
          </div>

          {/* Daily Quiz Card */}
          <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-teal-950/60 border border-emerald-800/50 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <CalendarCheck className="w-4 h-4 text-emerald-400" />
                الاختبار اليومي ({todayKey})
              </span>
              <button
                onClick={() => setShowDailyHistoryModal(true)}
                className="text-xs font-bold text-slate-300 hover:text-emerald-300 flex items-center gap-1"
              >
                <History className="w-3.5 h-3.5" />
                السجل اليومي ({dailyHistoryList.length})
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {todayDailyRecord?.status === 'completed'
                ? `أتممت اختبار اليوم بنسبة ${todayDailyRecord.percentage}% (${todayDailyRecord.score} من ${todayDailyRecord.total} من المحاولة الأولى).`
                : todayDailyRecord
                ? `اختبار اليوم قيد التقدم: أنجزت ${todayDailyRecord.completedQuestionIds.length} من ${todayDailyRecord.total} سؤال.`
                : `اختبار مخصص من ${progress.settings.dailyQuizQuestionCount} أسئلة يمزج الجولات الثلاث ويركز على المفاهيم السابقة والأخطاء.`}
            </p>

            <button
              onClick={handleStartDailyQuiz}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition"
            >
              <CalendarCheck className="w-4 h-4" />
              {todayDailyRecord?.status === 'completed'
                ? 'عرض نتيجة اختبار اليوم وسجل الأداء'
                : todayDailyRecord
                ? 'متابعة الاختبار اليومي'
                : 'بدء الاختبار اليومي الآن'}
            </button>
          </div>

          {/* Smart Review Card */}
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Brain className="w-4 h-4 text-cyan-400" />
                نظام المراجعة الذكية للأخطاء
              </h3>
              <span className="text-xs font-mono text-cyan-400">
                {weakQuestionsCount > 0 ? `${weakQuestionsCount} نقاط تحتاج تثبيت` : 'جاهز للمراجعة'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              تُرتّب الأسئلة تلقائياً لإعطاء أولوية قصوى للأخطاء السابقة والمفاهيم غير المتقنة عبر الدروس المفتوحة.
            </p>
            <button
              onClick={handleStartSmartReview}
              className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-900/50 font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <Zap className="w-4 h-4" />
              بدء جلسة المراجعة الذكية
            </button>
          </div>

          {/* Tests by Unit */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              اختبارات الوحدات المقررة (3 جولات):
            </h3>
            {database.units.map((unit) => {
              const uQuestions = database.questions.filter((q) => q.unitId === unit.id);
              return (
                <div
                  key={unit.id}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">{unit.title}</h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {unit.pageRange} • {uQuestions.length} سؤال
                    </span>
                  </div>
                  <button
                    onClick={() => handleStartUnitQuiz(unit)}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-emerald-600 hover:text-white text-emerald-400 text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <span>بدء</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Home Tab */}
      {activeTab === 'home' && (
        <main className="flex-1 max-w-2xl mx-auto w-full p-4 space-y-5 text-right">
          {/* Top Bar with App Branding & JSON/Settings Manager */}
          <header className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-950">
                <GraduationCap className="w-5 h-5 stroke-[2.4]" />
              </div>
              <div>
                <h1 className="text-base font-black text-slate-100">أحياء - Biology</h1>
                <p className="text-[11px] text-slate-400">كتاب الأحياء التفاعلي • أوفلاين</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <PWAInstallButton variant="compact" />
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-emerald-600 transition flex items-center gap-1.5 text-xs"
                title="الإعدادات والتنبيهات اليومية"
              >
                <Bell className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline text-slate-300">الإعدادات</span>
              </button>

              <button
                onClick={() => setShowDataModal(true)}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-emerald-600 transition flex items-center gap-1.5 text-xs"
                title="إدارة بيانات الكتاب وملفات JSON"
              >
                <Database className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline text-slate-300">ملفات الكتاب</span>
              </button>
            </div>
          </header>

          {/* Student Mastery Overview Dashboard */}
          <section className="p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-slate-300">
                  نسبة إتقان دروس كتاب الأحياء
                </span>
              </div>
              <span className="text-sm font-black text-emerald-400 font-mono">
                {overallPercentage}%
              </span>
            </div>

            <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2.5 rounded-full transition-all duration-700"
                style={{ width: `${overallPercentage}%` }}
              ></div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center">
              <div className="p-2.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
                <p className="text-sm font-black text-slate-100 font-mono">
                  {progressionSummary.masteredCount} / {progressionSummary.totalCount}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">دروس متقنة</p>
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
                <p className="text-sm font-black text-teal-400 font-mono">
                  {totalQuestionStatsCount}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">مفاهيم متقنة</p>
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-950/60 border border-slate-800/60">
                <p className="text-sm font-black text-cyan-400 font-mono">
                  {dailyHistoryList.filter((d) => d.status === 'completed').length}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">اختبارات يومية</p>
              </div>
            </div>
          </section>

          {/* Prominent Daily Quiz Banner */}
          <section className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-700/50 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-100">
                    الاختبار اليومي ({todayKey})
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {todayDailyRecord?.status === 'completed'
                      ? `مكتمل اليوم ✓ • نتيجتك: ${todayDailyRecord.percentage}%`
                      : todayDailyRecord
                      ? `متوقف عند السؤال ${todayDailyRecord.completedQuestionIds.length + 1} من ${todayDailyRecord.total}`
                      : `${progress.settings.dailyQuizQuestionCount} أسئلة متنوعة من الدروس المفتوحة والأخطاء`}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowDailyHistoryModal(true)}
                className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800 shrink-0"
              >
                السجل
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleStartDailyQuiz}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-emerald-950/50"
              >
                {todayDailyRecord?.status === 'completed' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>مراجعة سجل اختبار اليوم</span>
                  </>
                ) : todayDailyRecord ? (
                  <>
                    <PlayCircle className="w-4 h-4" />
                    <span>متابعة الاختبار اليومي</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>ابدأ الاختبار اليومي</span>
                  </>
                )}
              </button>
              <button
                onClick={handleStartSmartReview}
                className="py-3 px-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-cyan-300 font-bold text-xs flex items-center justify-center gap-1.5 transition shrink-0"
                title="مراجعة ذكية للأخطاء"
              >
                <Brain className="w-4 h-4" />
                <span>مراجعة ذكية</span>
              </button>
            </div>
          </section>

          {/* Resume From Where You Left Off Card ("متابعة من حيث توقفت") */}
          <section className="space-y-2.5">
            {resumeInfo.pausedQuiz && (
              <div
                onClick={() => handleResumeSavedQuiz(resumeInfo.pausedQuiz!)}
                className="p-4 rounded-2xl bg-amber-950/25 border border-amber-700/60 hover:border-amber-500 transition cursor-pointer flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                    <PlayCircle className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-amber-400 block">
                      متابعة من حيث توقفت • اختبار قيد الإنجاز
                    </span>
                    <h3 className="text-xs font-bold text-slate-100 truncate">
                      {resumeInfo.pausedQuiz.title}
                    </h3>
                    <span className="text-[11px] text-slate-400 block">
                      {ROUND_LABELS[resumeInfo.pausedQuiz.currentRound]} — السؤال{' '}
                      {resumeInfo.pausedQuiz.currentQuestionIndex + 1} من{' '}
                      {resumeInfo.pausedQuiz.questionIds.length}
                    </span>
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-amber-600 text-white shrink-0">
                  <ChevronLeft className="w-4 h-4" />
                </div>
              </div>
            )}

            {resumeInfo.readingLesson && (
              <div
                onClick={() => handleSelectLesson(resumeInfo.readingLesson)}
                className="p-4 rounded-2xl bg-slate-900 border border-emerald-900/40 hover:border-emerald-600 transition cursor-pointer flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-emerald-400 block">
                      متابعة من حيث توقفت في القراءة
                    </span>
                    <h3 className="text-xs font-bold text-slate-100 truncate group-hover:text-emerald-300 transition">
                      {resumeInfo.readingLesson.title}
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      {resumeInfo.lastPageRef
                        ? `آخر موضع: صفحة ${resumeInfo.lastPageRef}`
                        : resumeInfo.readingLesson.pageRange}
                    </span>
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-slate-800 text-slate-400 group-hover:text-white group-hover:bg-emerald-600 transition shrink-0">
                  <ChevronLeft className="w-4 h-4" />
                </div>
              </div>
            )}
          </section>

          {/* Units List Header */}
          <div className="flex items-center justify-between px-1 pt-1">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              وحدات وفصول كتاب الأحياء
            </h2>
            <span className="text-xs text-slate-400">{database.units.length} وحدات</span>
          </div>

          {/* Units Grid */}
          <div className="space-y-3.5">
            {database.units.map((unit) => {
              const uLessons = database.lessons.filter((l) => l.unitId === unit.id);
              const uMastered = uLessons.filter((l) =>
                masteredLessonIds.includes(l.id)
              ).length;
              const uUnlocked = uLessons.filter(
                (l) => !isLessonLocked(l, database, progress)
              ).length;
              const uPercent = Math.round((uMastered / (uLessons.length || 1)) * 100);

              return (
                <div
                  key={unit.id}
                  onClick={() => setSelectedUnit(unit)}
                  className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition cursor-pointer shadow-md group relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-800">
                          الوحدة {unit.number}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded">
                          {unit.pageRange}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-100 group-hover:text-emerald-300 transition truncate">
                        {unit.title}
                      </h3>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                        {unit.description}
                      </p>
                    </div>

                    <div className="w-10 h-10 rounded-xl bg-slate-800/80 group-hover:bg-emerald-600 group-hover:text-slate-950 text-slate-300 flex items-center justify-center shrink-0 transition">
                      <ChevronLeft className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Unit Progress Mini-bar */}
                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      {uUnlocked} من {uLessons.length} دروس متاحة ({uMastered} متقنة)
                    </span>
                    <span className="font-mono text-emerald-400">{uPercent}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* Overlays & Modals */}
      {activeQuizOverlay}
      {renderLockedModal()}
      {renderUnlockedModal()}
      {renderDailyHistoryModal()}

      {/* Data / JSON Manager Modal */}
      {showDataModal && (
        <DataImporterModal
          currentDb={database}
          onUpdateDb={(newDb) => {
            setDatabase(newDb);
            setShowDataModal(false);
          }}
          onClose={() => setShowDataModal(false)}
        />
      )}

      {/* Settings / Daily Reminders Modal */}
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          onProgressUpdated={setProgress}
        />
      )}

      {/* Offline Connectivity Indicator */}
      <OfflineIndicator />

      {/* Bottom Mobile Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800/90 safe-bottom">
        <div className="max-w-md mx-auto grid grid-cols-4 h-16 text-center text-[10px] font-bold">
          <button
            onClick={() => {
              setActiveTab('home');
              setSelectedLesson(null);
              setSelectedUnit(null);
            }}
            className={`flex flex-col items-center justify-center gap-1 transition ${
              activeTab === 'home' && !selectedUnit && !selectedLesson
                ? 'text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            <span>الرئيسية</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('search');
              setSelectedLesson(null);
              setSelectedUnit(null);
            }}
            className={`flex flex-col items-center justify-center gap-1 transition ${
              activeTab === 'search'
                ? 'text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Search className="w-5 h-5" />
            <span>البحث</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('quizzes');
              setSelectedLesson(null);
              setSelectedUnit(null);
            }}
            className={`flex flex-col items-center justify-center gap-1 transition ${
              activeTab === 'quizzes'
                ? 'text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="w-5 h-5" />
            <span>الاختبارات</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('bookmarks');
              setSelectedLesson(null);
              setSelectedUnit(null);
            }}
            className={`flex flex-col items-center justify-center gap-1 transition ${
              activeTab === 'bookmarks'
                ? 'text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bookmark className="w-5 h-5" />
            <span>المفضلة</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
