import React, { useState, useEffect, useRef } from 'react';
import { BiologyDatabase, Lesson, StudentProgress, Unit } from '../types/biology';
import { DiagramViewer } from './DiagramViewer';
import {
  ArrowRight,
  BookOpen,
  Volume2,
  VolumeX,
  Bookmark,
  CheckCircle2,
  Edit3,
  HelpCircle,
  FileText,
  Clock,
  Sparkles,
  Info,
  AlertTriangle,
  Lightbulb,
  Award,
  PlayCircle,
} from 'lucide-react';
import {
  getStudentProgress,
  saveLessonNote,
  saveLessonPosition,
  toggleLessonBookmark,
} from '../utils/storage';
import {
  getLessonQuestions,
  isLessonMastered,
  isQuestionMastered,
  ROUND_LABELS,
} from '../utils/questionEngine';

interface LessonViewProps {
  lesson: Lesson;
  unit: Unit;
  database: BiologyDatabase;
  progress: StudentProgress;
  onBack: () => void;
  onStartQuiz: (lesson: Lesson) => void;
  onProgressUpdated: (updated: StudentProgress) => void;
}

export const LessonView: React.FC<LessonViewProps> = ({
  lesson,
  unit,
  database,
  progress,
  onBack,
  onStartQuiz,
  onProgressUpdated,
}) => {
  const [isReading, setIsReading] = useState(false);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [noteText, setNoteText] = useState(progress.lessonNotes[lesson.id] || '');
  const [isNoteSaved, setIsNoteSaved] = useState(false);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const lastSavedScrollRef = useRef<number>(0);

  const isBookmarked = progress.bookmarkedLessons.includes(lesson.id);
  const lessonQuestions = getLessonQuestions(lesson.id, database);
  const masteredQuestionsCount = lessonQuestions.filter((q) =>
    isQuestionMastered(progress, q.id)
  ).length;
  const lessonMastered = isLessonMastered(lesson.id, database, progress);
  const hasPausedLessonQuiz =
    progress.activeQuizSession?.mode === 'lesson_mastery' &&
    progress.activeQuizSession.lessonId === lesson.id;

  const detectCurrentSection = (): { sectionIndex: number; pageRef: number } => {
    let activeIdx = 0;
    const viewportMid = window.scrollY + 140;
    sectionRefs.current.forEach((el, idx) => {
      if (el && el.offsetTop <= viewportMid) {
        activeIdx = idx;
      }
    });
    const pageRef = lesson.sections[activeIdx]?.pageRef || lesson.pageNumber;
    return { sectionIndex: activeIdx, pageRef };
  };

  // Restore exact reading position if resuming this lesson, and record entry position
  useEffect(() => {
    setNoteText(progress.lessonNotes[lesson.id] || '');
    const savedPos = progress.lastLessonPosition;
    if (savedPos && savedPos.lessonId === lesson.id && savedPos.scrollY > 20) {
      const targetY = savedPos.scrollY;
      const timer = setTimeout(() => {
        window.scrollTo({ top: targetY, behavior: 'smooth' });
      }, 60);
      return () => clearTimeout(timer);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const updated = saveLessonPosition({
        lessonId: lesson.id,
        sectionIndex: 0,
        pageRef: lesson.pageNumber,
        scrollY: 0,
        updatedAt: new Date().toISOString(),
      });
      onProgressUpdated(updated);
    }
  }, [lesson.id]);

  // Persist reading position cleanly on scroll and unmount
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const persistCurrentPosition = () => {
      const scrollY = Math.max(0, Math.round(window.scrollY));
      if (Math.abs(scrollY - lastSavedScrollRef.current) < 40 && scrollY !== 0) {
        return;
      }
      lastSavedScrollRef.current = scrollY;
      const { sectionIndex, pageRef } = detectCurrentSection();
      const updated = saveLessonPosition({
        lessonId: lesson.id,
        sectionIndex,
        pageRef,
        scrollY,
        updatedAt: new Date().toISOString(),
      });
      onProgressUpdated(updated);
    };

    const handleScroll = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(persistCurrentPosition, 350);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('scroll', handleScroll);
      persistCurrentPosition();
    };
  }, [lesson.id]);

  // Audio Speech Reader using Web Speech API (runs 100% offline in Android WebView)
  const toggleSpeech = () => {
    if (!('speechSynthesis' in window)) {
      setSpeechNotice('القراءة الصوتية غير مدعومة على هذا المتصفح حالياً.');
      setTimeout(() => setSpeechNotice(null), 3500);
      return;
    }

    if (isReading) {
      window.speechSynthesis.cancel();
      setIsReading(false);
      return;
    }

    const fullText = `${lesson.title}. ${lesson.summary}. ${lesson.sections
      .map((s) => s.heading + '. ' + s.content)
      .join(' ')}`;

    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.lang = 'ar-SA';
    utterance.rate = 0.95;

    utterance.onend = () => setIsReading(false);
    utterance.onerror = () => setIsReading(false);

    window.speechSynthesis.speak(utterance);
    setIsReading(true);
  };

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleToggleBookmark = () => {
    toggleLessonBookmark(lesson.id);
    onProgressUpdated(getStudentProgress());
  };

  const handleSaveNote = () => {
    const updated = saveLessonNote(lesson.id, noteText);
    onProgressUpdated(updated);
    setIsNoteSaved(true);
    setTimeout(() => setIsNoteSaved(false), 2000);
  };

  const handleFinishLessonAndStartQuiz = () => {
    const { sectionIndex, pageRef } = detectCurrentSection();
    const updated = saveLessonPosition({
      lessonId: lesson.id,
      sectionIndex,
      pageRef,
      scrollY: Math.max(0, Math.round(window.scrollY)),
      updatedAt: new Date().toISOString(),
    });
    onProgressUpdated(updated);
    onStartQuiz(lesson);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 safe-top">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white transition shrink-0"
            aria-label="الرجوع"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <span className="text-[11px] text-emerald-400 font-bold block truncate">{unit.title}</span>
            <h1 className="text-sm font-bold text-slate-100 truncate max-w-[200px] sm:max-w-md">
              {lesson.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleSpeech}
            className={`p-2.5 rounded-xl transition ${
              isReading
                ? 'bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/40'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
            title="قراءة صوتية للدرس"
            aria-label="قراءة صوتية للدرس"
          >
            {isReading ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            onClick={handleToggleBookmark}
            className={`p-2.5 rounded-xl transition ${
              isBookmarked
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
            title="حفظ في المفضلة"
            aria-label="حفظ في المفضلة"
          >
            <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
          </button>
        </div>
      </header>

      {speechNotice && (
        <div className="max-w-3xl mx-auto w-full px-4 pt-3">
          <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-200 text-xs text-right">
            {speechNotice}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl mx-auto w-full p-4 space-y-6 text-right">
        {/* Source Citation & Mastery Metadata Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-900/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <BookOpen className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs text-slate-400 font-medium">مرجع الكتاب المدرسي الأصلي</p>
              <p className="text-sm font-bold text-emerald-300 font-mono">{lesson.pageRange}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {lesson.readDuration}
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-300 font-medium">الدرس {lesson.lessonNumber}</span>
          </div>
        </div>

        {/* Lesson Mastery Progress Banner */}
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
            lessonMastered
              ? 'bg-emerald-950/30 border-emerald-700/60'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                lessonMastered
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}
            >
              {lessonMastered ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Award className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-100">
                {lessonMastered
                  ? 'تم إتقان هذا الدرس بالكامل ✓'
                  : 'شرط فتح الدرس التالي: إتقان أسئلة الدرس عبر 3 جولات'}
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {lessonQuestions.length > 0
                  ? `الأسئلة المتقنة: ${masteredQuestionsCount} من ${lessonQuestions.length} (اختيار من متعدد ← أكمل الإجابة ← استدعاء من الذاكرة)`
                  : 'اختبار تفاعلي من 3 جولات لضمان الفهم العميق.'}
              </p>
            </div>
          </div>
        </div>

        {/* Lesson Summary & Overview */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            الملخص التنفيذي
          </h2>
          <p className="text-sm text-slate-200 leading-relaxed font-normal">{lesson.summary}</p>
        </div>

        {/* Key Concepts Grid */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 mb-2.5">المفاهيم الجوهرية للدرس:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {lesson.keyConcepts.map((concept, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-2 text-xs text-slate-300"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                <span>{concept}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Diagrams if present */}
        {lesson.diagrams && lesson.diagrams.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              الرسوم البيولوجية التفاعلية
            </h3>
            {lesson.diagrams.map((diag) => (
              <DiagramViewer key={diag.id} diagram={diag} />
            ))}
          </div>
        )}

        {/* Detailed Sections */}
        <div className="space-y-5">
          {lesson.sections.map((sec, idx) => (
            <article
              key={sec.id}
              ref={(el) => {
                sectionRefs.current[idx] = el;
              }}
              className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <h3 className="text-base font-bold text-slate-100">{sec.heading}</h3>
                <span className="text-[11px] font-mono bg-slate-800/80 text-emerald-400 px-2 py-0.5 rounded">
                  ص {sec.pageRef}
                </span>
              </div>

              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {sec.content}
              </p>

              {sec.bulletPoints && (
                <ul className="space-y-2 pr-2 my-2">
                  {sec.bulletPoints.map((pt, pIdx) => (
                    <li key={pIdx} className="text-xs text-slate-300 flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0"></span>
                      <span className="leading-relaxed">{pt}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Callout */}
              {sec.callout && (
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                    sec.callout.type === 'fact'
                      ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200'
                      : sec.callout.type === 'warning'
                      ? 'bg-amber-950/30 border-amber-800/50 text-amber-200'
                      : sec.callout.type === 'definition'
                      ? 'bg-teal-950/30 border-teal-800/50 text-teal-200'
                      : 'bg-cyan-950/30 border-cyan-800/50 text-cyan-200'
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {sec.callout.type === 'fact' && <Sparkles className="w-4 h-4 text-emerald-400" />}
                    {sec.callout.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                    {sec.callout.type === 'definition' && <Lightbulb className="w-4 h-4 text-teal-400" />}
                  </div>
                  <div>
                    <strong className="block font-bold mb-0.5">{sec.callout.title}</strong>
                    <span className="leading-relaxed text-slate-300">{sec.callout.text}</span>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>

        {/* Comparative Tables if present */}
        {lesson.tables && lesson.tables.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-teal-300 flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-400" />
              جداول المقارنة والتصنيف العلمي
            </h3>
            {lesson.tables.map((tbl) => (
              <div
                key={tbl.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-md"
              >
                <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-200">{tbl.title}</h4>
                  <span className="text-[11px] font-mono text-emerald-400 bg-slate-800 px-2 py-0.5 rounded">
                    ص {tbl.pageRef}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-950/60 text-slate-300 font-bold border-b border-slate-800">
                      <tr>
                        {tbl.headers.map((h, i) => (
                          <th key={i} className="p-3 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {tbl.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-800/40 transition">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="p-3 leading-relaxed">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {tbl.caption && (
                  <div className="p-2 bg-slate-950/40 text-[10px] text-slate-500 border-t border-slate-800/50">
                    {tbl.caption}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Scientific Terms Glossary */}
        {lesson.scientificTerms && lesson.scientificTerms.length > 0 && (
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
            <h3 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" />
              قاموس المصطلحات والمفاهيم العلمية
            </h3>
            <div className="space-y-3">
              {lesson.scientificTerms.map((term, tIdx) => (
                <div
                  key={tIdx}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-emerald-300">{term.term}</span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      ص {term.pageRef}
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">{term.definition}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Student Personal Notes Editor */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-emerald-400" />
              ملاحظاتي وتلخيصي لهذا الدرس (مخزنة محلياً)
            </h3>
            {isNoteSaved && <span className="text-xs text-emerald-400 font-bold">تم الحفظ ✓</span>}
          </div>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="اكتب ملاحظاتك أو أسئلتك أو التلخيص الشخصي هنا..."
            rows={4}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition leading-relaxed resize-none"
          ></textarea>
          <div className="flex justify-end">
            <button
              onClick={handleSaveNote}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition"
            >
              حفظ الملاحظة
            </button>
          </div>
        </div>

        {/* Finish Lesson -> Launch Mastery Quiz (NO manual unlock shortcut) */}
        <div className="pt-2 space-y-2.5">
          <button
            onClick={handleFinishLessonAndStartQuiz}
            className={`w-full py-4 px-5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg transition ${
              hasPausedLessonQuiz
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30'
                : lessonMastered
                ? 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-emerald-900/30'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
            }`}
          >
            {hasPausedLessonQuiz ? (
              <>
                <PlayCircle className="w-5 h-5" />
                <span>
                  متابعة اختبار الإتقان ({ROUND_LABELS[progress.activeQuizSession!.currentRound]})
                </span>
              </>
            ) : lessonMastered ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>تم إتقان الدرس ✓ — مراجعة وإعادة اختبار الإتقان</span>
              </>
            ) : (
              <>
                <HelpCircle className="w-5 h-5" />
                <span>إنهاء الدرس وبدء اختبار الإتقان (3 جولات)</span>
              </>
            )}
          </button>
          {!lessonMastered && (
            <p className="text-[11px] text-center text-slate-400">
              ملاحظة: يظل الدرس التالي مقفلاً حتى تُتقن جميع أسئلة هذا الدرس عبر الجولات الثلاث.
            </p>
          )}
        </div>
      </main>
    </div>
  );
};
