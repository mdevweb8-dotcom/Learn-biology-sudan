import React from 'react';
import { Unit, Lesson, QuizQuestion } from '../types/biology';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Clock,
  ChevronLeft,
  GraduationCap,
  Sparkles,
  Lock,
} from 'lucide-react';

interface UnitViewProps {
  unit: Unit;
  lessons: Lesson[];
  completedLessonIds: string[];
  unitQuestions: QuizQuestion[];
  onSelectLesson: (lesson: Lesson) => void;
  onStartUnitQuiz: (unit: Unit) => void;
  onBack: () => void;
}

export const UnitView: React.FC<UnitViewProps> = ({
  unit,
  lessons,
  completedLessonIds,
  unitQuestions,
  onSelectLesson,
  onStartUnitQuiz,
  onBack,
}) => {
  const completedCount = lessons.filter((l) => completedLessonIds.includes(l.id)).length;
  const progressPercent = Math.round((completedCount / (lessons.length || 1)) * 100);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 safe-top">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white transition"
            aria-label="رجوع"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[11px] text-emerald-400 font-bold block">الوحدة {unit.number}</span>
            <h1 className="text-base font-bold text-slate-100">{unit.title}</h1>
          </div>
        </div>
        <span className="text-xs font-mono bg-slate-800 text-emerald-400 px-2.5 py-1 rounded-lg">
          {unit.pageRange}
        </span>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full p-4 space-y-5 text-right">
        {/* Unit Hero Card */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-950 border border-emerald-900/40 shadow-xl space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-800/80">
                {unit.titleEn}
              </span>
              <h2 className="text-lg font-black text-slate-100 mt-2">{unit.title}</h2>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <GraduationCap className="w-6 h-6" />
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">{unit.description}</p>

          {/* Progress bar */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5 font-medium">
              <span>نسبة إنجاز الوحدة</span>
              <span className="font-mono text-emerald-400">
                {completedCount} من {lessons.length} دروس ({progressPercent}%)
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          {/* Comprehensive Unit Quiz CTA */}
          <button
            onClick={() => onStartUnitQuiz(unit)}
            className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition"
          >
            <HelpCircle className="w-4 h-4" />
            بدء الاختبار الشامل للوحدة ({unitQuestions.length} سؤال متدرج)
          </button>
        </div>

        {/* Lessons List Header */}
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            دروس الوحدة المقررة من الكتاب
          </h3>
          <span className="text-xs text-slate-400">{lessons.length} دروس</span>
        </div>

        {/* Lessons Cards */}
        <div className="space-y-3">
          {lessons.map((lesson) => {
            const isDone = completedLessonIds.includes(lesson.id);
            const isLocked = !!lesson.isLocked;
            return (
              <div
                key={lesson.id}
                onClick={() => onSelectLesson(lesson)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                  isLocked
                    ? 'bg-slate-950/70 border-slate-800/60 opacity-75 hover:border-amber-700/50'
                    : isDone
                    ? 'bg-emerald-950/20 border-emerald-900/40 hover:border-emerald-700/60'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 transition ${
                      isLocked
                        ? 'bg-amber-950/40 text-amber-400 border border-amber-800/50'
                        : isDone
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-900/40'
                        : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700'
                    }`}
                  >
                    {isLocked ? (
                      <Lock className="w-4 h-4" />
                    ) : isDone ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      lesson.lessonNumber
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4
                        className={`text-sm font-bold truncate transition ${
                          isLocked
                            ? 'text-slate-300 group-hover:text-amber-300'
                            : 'text-slate-100 group-hover:text-emerald-300'
                        }`}
                      >
                        {lesson.title}
                      </h4>
                      {isLocked && (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-800/80 shrink-0">
                          مقفل 🔒
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 font-medium">
                      <span className="font-mono text-emerald-400 bg-slate-950 px-2 py-0.5 rounded">
                        {lesson.pageRange}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {lesson.readDuration}
                      </span>
                      {isLocked && (
                        <span className="text-[10px] text-amber-400/90 hidden sm:inline">
                          (يتطلب إتقان الدرس السابق عبر 3 جولات)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-slate-800/60 text-slate-400 group-hover:text-white group-hover:bg-emerald-600 transition shrink-0">
                  {isLocked ? <Lock className="w-4 h-4 text-amber-400" /> : <ChevronLeft className="w-4 h-4" />}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};
