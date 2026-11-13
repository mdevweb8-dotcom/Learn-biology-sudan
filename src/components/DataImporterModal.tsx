import React, { useState } from 'react';
import { BiologyDatabase } from '../types/biology';
import {
  saveBiologyData,
  resetBiologyData,
} from '../utils/storage';
import {
  Upload,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileJson,
  X,
  Database,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface DataImporterModalProps {
  currentDb: BiologyDatabase;
  onUpdateDb: (newDb: BiologyDatabase) => void;
  onClose: () => void;
}

export const DataImporterModal: React.FC<DataImporterModalProps> = ({
  currentDb,
  onUpdateDb,
  onClose,
}) => {
  const [jsonText, setJsonText] = useState('');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        setJsonText(content);
        validateAndImport(content);
      } catch (err) {
        setStatusMessage({
          type: 'error',
          text: 'تعذر قراءة الملف المرفوع. تأكد من أنه ملف JSON صالح.',
        });
      }
    };
    reader.readAsText(file);
  };

  const validateAndImport = (content: string) => {
    try {
      const parsed = JSON.parse(content);
      if (!parsed || !Array.isArray(parsed.units) || !Array.isArray(parsed.lessons) || !Array.isArray(parsed.questions)) {
        throw new Error('هيكل البيانات غير متوافق. يجب أن يحتوي على units و lessons و questions.');
      }

      saveBiologyData(parsed);
      onUpdateDb(parsed);
      setStatusMessage({
        type: 'success',
        text: `تم استيراد المحتوى بنجاح! تم تحميل ${parsed.units.length} وحدات و ${parsed.lessons.length} دروس و ${parsed.questions.length} سؤال.`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'خطأ في التحقق من صيغة JSON.',
      });
    }
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(currentDb, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `biology-database-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleReset = () => {
    if (window.confirm('هل أنت متأكد من استعادة قاعدة بيانات الكتاب الافتراضية؟')) {
      resetBiologyData();
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 text-right">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">إدارة قاعدة بيانات كتاب الأحياء</h2>
              <p className="text-xs text-slate-400">استيراد وتصدير ملفات JSON للكتاب والمحتوى</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Database Summary */}
        <div className="my-4 p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <p className="text-xs text-slate-400 font-bold">إحصائيات المحتوى المحمل حالياً في الذاكرة (Offline):</p>
          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="p-2 rounded-xl bg-slate-900">
              <span className="text-sm font-bold text-emerald-400 font-mono">
                {currentDb.units.length}
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">وحدات دراسية</p>
            </div>
            <div className="p-2 rounded-xl bg-slate-900">
              <span className="text-sm font-bold text-teal-400 font-mono">
                {currentDb.lessons.length}
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">دروس مشروحة</p>
            </div>
            <div className="p-2 rounded-xl bg-slate-900">
              <span className="text-sm font-bold text-cyan-400 font-mono">
                {currentDb.questions.length}
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">أسئلة باختبارات</p>
            </div>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl mb-4 text-xs flex items-start gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60'
                : 'bg-rose-950/40 text-rose-300 border border-rose-800/60'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{statusMessage.text}</span>
          </div>
        )}

        {/* Upload File Input */}
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">
              رفع ملف JSON مستخرج من الكتاب:
            </label>
            <label className="flex flex-col items-center justify-center w-full p-4 border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-2xl cursor-pointer bg-slate-950/60 transition group">
              <FileJson className="w-8 h-8 text-slate-500 group-hover:text-emerald-400 transition mb-2" />
              <span className="text-xs font-medium text-slate-300">
                اضغط لاختيار ملف JSON من هاتفك أو جهازك
              </span>
              <span className="text-[11px] text-slate-500 mt-1">يتم التخزين محلياً على هاتفك دون حاجة للإنترنت</span>
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">
              أو الصق محتوى JSON هنا مباشرة:
            </label>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='الصق نص الـ JSON هنا ثم اضغط تطبيق...'
              rows={4}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-300 focus:outline-none focus:border-emerald-500 transition resize-none"
            ></textarea>
            {jsonText && (
              <button
                onClick={() => validateAndImport(jsonText)}
                className="mt-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition"
              >
                تطبيق وحفظ بيانات الـ JSON
              </button>
            )}
          </div>
        </div>

        {/* Actions Footer */}
        <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={handleExportJson}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            تصدير JSON
          </button>

          <button
            onClick={handleReset}
            className="py-2.5 px-3 rounded-xl text-rose-400 hover:bg-rose-950/40 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            استعادة الأصل
          </button>
        </div>
      </div>
    </div>
  );
};
