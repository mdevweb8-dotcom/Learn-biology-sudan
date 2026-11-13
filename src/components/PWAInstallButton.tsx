import React, { useState } from 'react';
import { Download, Share, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={
          variant === 'full'
            ? 'w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-950/50 transition'
            : 'p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-md shadow-emerald-950/40'
        }
        title="تثبيت التطبيق للعمل بدون إنترنت"
      >
        <Download className="w-4 h-4" />
        <span className={variant === 'compact' ? 'hidden sm:inline' : ''}>
          تثبيت التطبيق (أوفلاين)
        </span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'full'
              ? 'w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-emerald-700/60 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition'
              : 'p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-emerald-400 hover:border-emerald-600 text-xs font-bold flex items-center gap-1.5 transition'
          }
          title="تثبيت التطبيق على iPhone / iPad"
        >
          <Smartphone className="w-4 h-4" />
          <span className={variant === 'compact' ? 'hidden sm:inline' : ''}>
            تثبيت على iOS
          </span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4 text-right">
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-black text-slate-100">
                  تثبيت التطبيق على iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2.5 text-xs text-slate-300 leading-relaxed list-decimal pr-4">
                <li>
                  اضغط على زر <strong className="text-emerald-400 inline-flex items-center gap-1">المشاركة <Share className="w-3.5 h-3.5 inline" /></strong> في شريط متصفح Safari بالأسفل.
                </li>
                <li>
                  مرر لأسفل واختر <strong className="text-emerald-400">إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                </li>
                <li>سيعمل التطبيق بعدها كبرنامج مستقل بدون إنترنت بالكامل.</li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
              >
                فهمت
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
