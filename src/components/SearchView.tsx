import React, { useState, useMemo } from 'react';
import { BiologyDatabase, Lesson, QuizQuestion } from '../types/biology';
import { Search, BookOpen, HelpCircle, Info, ChevronLeft, Filter, X } from 'lucide-react';

interface SearchViewProps {
  database: BiologyDatabase;
  onSelectLesson: (lesson: Lesson) => void;
  onOpenQuestion?: (question: QuizQuestion) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  database,
  onSelectLesson,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'lessons' | 'terms' | 'questions'>('all');

  const searchResults = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return { lessons: [], terms: [], questions: [] };

    // Search Lessons
    const matchedLessons = database.lessons.filter((l) => {
      const inTitle = l.title.toLowerCase().includes(query) || l.titleEn.toLowerCase().includes(query);
      const inSummary = l.summary.toLowerCase().includes(query);
      const inSections = l.sections.some(
        (s) => s.heading.toLowerCase().includes(query) || s.content.toLowerCase().includes(query)
      );
      return inTitle || inSummary || inSections;
    });

    // Search Terms
    const matchedTerms: Array<{
      term: string;
      definition: string;
      pageRef: number;
      lessonTitle: string;
      lesson: Lesson;
    }> = [];

    database.lessons.forEach((l) => {
      l.scientificTerms.forEach((t) => {
        if (
          t.term.toLowerCase().includes(query) ||
          (t.termEn && t.termEn.toLowerCase().includes(query)) ||
          t.definition.toLowerCase().includes(query)
        ) {
          matchedTerms.push({
            ...t,
            lessonTitle: l.title,
            lesson: l,
          });
        }
      });
    });

    // Search Questions
    const matchedQuestions = database.questions.filter((q) => {
      return (
        q.question.toLowerCase().includes(query) ||
        q.explanation.toLowerCase().includes(query) ||
        q.scientificConcept.toLowerCase().includes(query)
      );
    });

    return {
      lessons: matchedLessons,
      terms: matchedTerms,
      questions: matchedQuestions,
    };
  }, [searchTerm, database]);

  const totalResultsCount =
    searchResults.lessons.length + searchResults.terms.length + searchResults.questions.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 safe-top text-right">
      {/* Search Header */}
      <div className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 p-4 space-y-3">
        <h1 className="text-base font-bold text-slate-100">البحث الشامل في كتاب الأحياء</h1>
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ابحث عن مفهوم، عضية، قانون، صفحة (مثل: ميتوكوندريا، DNA، أسموزية)..."
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 pr-11 pl-10 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            autoFocus
          />
          <Search className="w-5 h-5 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="p-1 rounded-full text-slate-500 hover:text-white absolute left-3 top-1/2 -translate-y-1/2"
              aria-label="مسح البحث"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-medium shrink-0 transition ${
              activeFilter === 'all'
                ? 'bg-emerald-600 text-white font-bold'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            الكل ({searchTerm ? totalResultsCount : 0})
          </button>
          <button
            onClick={() => setActiveFilter('lessons')}
            className={`px-3 py-1.5 rounded-xl font-medium shrink-0 transition ${
              activeFilter === 'lessons'
                ? 'bg-emerald-600 text-white font-bold'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            الدروس ({searchResults.lessons.length})
          </button>
          <button
            onClick={() => setActiveFilter('terms')}
            className={`px-3 py-1.5 rounded-xl font-medium shrink-0 transition ${
              activeFilter === 'terms'
                ? 'bg-emerald-600 text-white font-bold'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            المصطلحات ({searchResults.terms.length})
          </button>
          <button
            onClick={() => setActiveFilter('questions')}
            className={`px-3 py-1.5 rounded-xl font-medium shrink-0 transition ${
              activeFilter === 'questions'
                ? 'bg-emerald-600 text-white font-bold'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            الأسئلة والاختبارات ({searchResults.questions.length})
          </button>
        </div>
      </div>

      {/* Results View */}
      <main className="flex-1 max-w-2xl mx-auto w-full p-4 space-y-6">
        {!searchTerm ? (
          <div className="text-center py-16 space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center text-slate-600">
              <Search className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-slate-300">ابحث فوراً بدون إنترنت</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
              جميع صفحات ومفاهيم وجداول وأسئلة كتاب الأحياء مفهرسة ومخزنة على هاتفك.
            </p>
          </div>
        ) : totalResultsCount === 0 ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-sm font-bold text-slate-400">لم يتم العثور على نتائج تطابق: "{searchTerm}"</p>
            <p className="text-xs text-slate-500">جرب كتابة جزء من الكلمة أو مصطلح علمي آخر.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Lessons Results */}
            {(activeFilter === 'all' || activeFilter === 'lessons') && searchResults.lessons.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4" />
                  دروس الكتاب ذات الصلة ({searchResults.lessons.length})
                </h3>
                <div className="space-y-2.5">
                  {searchResults.lessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      onClick={() => onSelectLesson(lesson)}
                      className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-600/60 transition cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-xs font-bold text-slate-100 group-hover:text-emerald-300 transition truncate">
                            {lesson.title}
                          </h4>
                          <span className="text-[10px] font-mono text-emerald-400 bg-slate-950 px-2 py-0.5 rounded">
                            {lesson.pageRange}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                          {lesson.summary}
                        </p>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Terms Results */}
            {(activeFilter === 'all' || activeFilter === 'terms') && searchResults.terms.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
                  <Info className="w-4 h-4" />
                  المصطلحات العلمية ({searchResults.terms.length})
                </h3>
                <div className="space-y-2.5">
                  {searchResults.terms.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => onSelectLesson(item.lesson)}
                      className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-teal-600/60 transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-bold text-teal-300">{item.term}</span>
                        <span className="text-[10px] font-mono bg-slate-950 text-emerald-400 px-2 py-0.5 rounded">
                          ص {item.pageRef}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed mb-2">{item.definition}</p>
                      <span className="text-[10px] text-slate-500 block">
                        ورد في: {item.lessonTitle}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Questions Results */}
            {(activeFilter === 'all' || activeFilter === 'questions') && searchResults.questions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4" />
                  أسئلة الاختبارات المطابقة ({searchResults.questions.length})
                </h3>
                <div className="space-y-2.5">
                  {searchResults.questions.map((q) => (
                    <div
                      key={q.id}
                      className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-mono text-[10px] text-emerald-400 bg-slate-950 px-2 py-0.5 rounded">
                          {q.pageSource}
                        </span>
                        <span className="text-[10px] text-slate-400">{q.scientificConcept}</span>
                      </div>
                      <p className="text-xs text-slate-200 font-medium mb-2">{q.question}</p>
                      <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400">
                        <span className="text-emerald-400 font-bold">الإجابة المعتمدة: </span>
                        {q.options[q.correctAnswerIndex]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
