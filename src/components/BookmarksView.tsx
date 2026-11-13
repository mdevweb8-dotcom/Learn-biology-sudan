import React, { useState } from 'react';
import { BiologyDatabase, Lesson, StudentProgress } from '../types/biology';
import {
  Bookmark,
  Edit3,
  BookOpen,
  ChevronLeft,
  Trash2,
  Share2,
  Copy,
  Check,
  Clock,
} from 'lucide-react';
import {
  saveLessonNote,
  toggleLessonBookmark,
} from '../utils/storage';

interface BookmarksViewProps {
  database: BiologyDatabase;
  progress: StudentProgress;
  onSelectLesson: (lesson: Lesson) => void;
  onRefreshProgress: () => void;
}

export const BookmarksView: React.FC<BookmarksViewProps> = ({
  database,
  progress,
  onSelectLesson,
  onRefreshProgress,
}) => {
  const [activeTab, setActiveTab] = useState<'bookmarks' | 'notes'>('bookmarks');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const bookmarkedLessons = database.lessons.filter((l) =>
    progress.bookmarkedLessons.includes(l.id)
  );

  const lessonsWithNotes = database.lessons.filter((l) => {
    const note = progress.lessonNotes[l.id];
    return note && note.trim().length > 0;
  });

  const handleRemoveBookmark = (e: React.MouseEvent, lessonId: string) => {
    e.stopPropagation();
    toggleLessonBookmark(lessonId);
    onRefreshProgress();
  };

  const handleDeleteNote = (lessonId: string) => {
    saveLessonNote(lessonId, '');
    onRefreshProgress();
  };

  const handleCopyNote = (lessonId: string, noteText: string) => {
    navigator.clipboard.writeText(noteText);
    setCopiedKey(lessonId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 safe-top text-right">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 p-4 space-y-3">
        <h1 className="text-base font-bold text-slate-100">المفضلة والملاحظات الشخصية</h1>

        {/* Tab switch */}
        <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-2xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('bookmarks')}
            className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition ${
              activeTab === 'bookmarks'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            الدروس المفضلة ({bookmarkedLessons.length})
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition ${
              activeTab === 'notes'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            دفتر الملاحظات ({lessonsWithNotes.length})
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full p-4 space-y-4">
        {activeTab === 'bookmarks' ? (
          bookmarkedLessons.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center text-slate-600">
                <Bookmark className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-slate-300">لا توجد دروس في المفضلة بعد</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                يمكنك الضغط على أيقونة الإشارة المرجعية داخل أي درس لإضافته للمفضلة للرجوع السريع.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {bookmarkedLessons.map((lesson) => (
                <div
                  key={lesson.id}
                  onClick={() => onSelectLesson(lesson)}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-600/60 transition cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono text-emerald-400 bg-slate-950 px-2 py-0.5 rounded">
                        {lesson.pageRange}
                      </span>
                      <h4 className="text-xs font-bold text-slate-100 group-hover:text-emerald-300 transition truncate">
                        {lesson.title}
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1">{lesson.summary}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={(e) => handleRemoveBookmark(e, lesson.id)}
                      className="p-2 rounded-xl text-rose-400 hover:bg-rose-950/40 transition"
                      title="إزالة من المفضلة"
                      aria-label="إزالة من المفضلة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="p-2 rounded-xl bg-slate-800 text-slate-400 group-hover:bg-emerald-600 group-hover:text-white transition">
                      <ChevronLeft className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : lessonsWithNotes.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center text-slate-600">
              <Edit3 className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-300">دفتر الملاحظات فارغ حالياً</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              عند قراءة أي درس، يمكنك كتابة تلخيصك أو ملاحظاتك في الصندوق السفلي وسيتم حفظها هنا بشكل دائم بدون إنترنت.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {lessonsWithNotes.map((lesson) => {
              const noteText = progress.lessonNotes[lesson.id];
              return (
                <div
                  key={lesson.id}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-slate-200">{lesson.title}</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 bg-slate-950 px-2 py-0.5 rounded">
                      {lesson.pageRange}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
                    {noteText}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => onSelectLesson(lesson)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1"
                    >
                      <span>فتح الدرس الكامل</span>
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyNote(lesson.id, noteText)}
                        className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1 text-[11px]"
                      >
                        {copiedKey === lesson.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>تم النسخ</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>نسخ</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteNote(lesson.id)}
                        className="p-2 rounded-xl text-rose-400 hover:bg-rose-950/40 transition"
                        title="حذف الملاحظة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
