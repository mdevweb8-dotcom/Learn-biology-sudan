import React, { useState } from 'react';
import {
  NotificationSettings,
  getNotificationSettings,
  scheduleDailyStudyReminder,
  triggerImmediateTestNotification,
  requestNotificationPermission,
} from '../utils/notifications';
import { getStudentProgress, updateAppSettings } from '../utils/storage';
import { StudentProgress } from '../types/biology';
import { PWAInstallButton } from './PWAInstallButton';
import {
  Bell,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  X,
  BookOpen,
  Smartphone,
  Target,
} from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
  onProgressUpdated?: (updated: StudentProgress) => void;
}

const DAILY_QUESTION_OPTIONS = [5, 10, 15, 20];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  onProgressUpdated,
}) => {
  const [settings, setSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [dailyCount, setDailyCount] = useState<number>(
    () => getStudentProgress().settings.dailyQuizQuestionCount
  );
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleToggleEnabled = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (
        !granted &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'denied'
      ) {
        setStatusMessage({
          type: 'error',
          text: 'يرجى السماح بإذن الإشعارات من إعدادات المتصفح أو الهاتف.',
        });
      }
    }

    const updated = { ...settings, enabled };
    setSettings(updated);
    await scheduleDailyStudyReminder(updated);
    setStatusMessage({
      type: 'success',
      text: enabled
        ? 'تم تفعيل التنبيهات اليومية لمتابعة الدروس'
        : 'تم إيقاف التنبيهات اليومية',
    });
  };

  const handleTimeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const updated = { ...settings, time: e.target.value };
    setSettings(updated);
    if (updated.enabled) {
      await scheduleDailyStudyReminder(updated);
      setStatusMessage({
        type: 'success',
        text: `تم ضبط وقت التنبيه اليومي عند الساعة ${updated.time}`,
      });
    }
  };

  const handleTestNotification = async () => {
    const success = await triggerImmediateTestNotification();
    if (success) {
      setStatusMessage({
        type: 'success',
        text: 'تم إرسال إشعار تجريبي بنجاح!',
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: 'تعذر إرسال الإشعار. تأكد من إعطاء إذن التنبيهات للتطبيق.',
      });
    }
  };

  const handleChangeDailyCount = (count: number) => {
    setDailyCount(count);
    const updated = updateAppSettings({ dailyQuizQuestionCount: count });
    onProgressUpdated?.(updated);
    setStatusMessage({
      type: 'success',
      text: `تم ضبط عدد أسئلة الاختبار اليومي القادمة إلى ${count} أسئلة`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 text-right">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">إعدادات التطبيق والتنبيهات</h2>
              <p className="text-xs text-slate-400">الاختبار اليومي والتنبيهات المحلية</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
            aria-label="إغلاق الإعدادات"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status notification */}
        {statusMessage && (
          <div
            className={`p-3 rounded-2xl my-3 text-xs flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60'
                : 'bg-rose-950/40 text-rose-300 border border-rose-800/60'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <div className="space-y-4 my-3">
          {/* Daily Quiz Question Count */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-xs font-bold text-slate-200 block">
                  عدد أسئلة الاختبار اليومي
                </span>
                <span className="text-[11px] text-slate-400">
                  يسري على الاختبارات اليومية الجديدة (الافتراضي: 10 أسئلة)
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {DAILY_QUESTION_OPTIONS.map((num) => (
                <button
                  key={num}
                  onClick={() => handleChangeDailyCount(num)}
                  className={`py-2.5 rounded-xl text-xs font-bold font-mono border transition ${
                    dailyCount === num
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Notifications Setting Section */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-200 block">
                  تفعيل التنبيه اليومي للدراسة
                </span>
                <span className="text-[11px] text-slate-400">
                  تذكير محلي منتظم عبر الهاتف لمتابعة مذاكرة الأحياء
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => handleToggleEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {/* Time Picker */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-300">وقت التنبيه اليومي:</span>
              </div>
              <input
                type="time"
                value={settings.time}
                onChange={handleTimeChange}
                disabled={!settings.enabled}
                className="bg-slate-900 border border-slate-700 text-emerald-300 text-sm font-mono font-bold rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500 disabled:opacity-40"
              />
            </div>

            {/* Test notification button */}
            <div className="pt-2">
              <button
                onClick={handleTestNotification}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 border border-slate-700/80 transition"
              >
                <Send className="w-3.5 h-3.5 text-emerald-400" />
                إرسال إشعار تجريبي الآن للتأكد
              </button>
            </div>
          </div>

          {/* Book Information & Credential */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs text-slate-400">
            <div className="flex items-center gap-2 text-slate-200 font-bold">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              <span>المرجع والمقرر المعتمد في التطبيق:</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              كتاب الأحياء – المرحلة الثانوية (الصف الأول الثانوي)
              <br />
              جمهورية السودان – وزارة التعليم والتربية الوطنية
              <br />
              المركز القومي للمناهج والبحث التربوي (بخت الرضا) – الطبعة الأولى 2025م.
            </p>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5" />
                PWA + IndexedDB Offline
              </span>
              <span className="font-mono text-emerald-500">Capacitor v8</span>
            </div>
          </div>

          <PWAInstallButton variant="full" />
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
