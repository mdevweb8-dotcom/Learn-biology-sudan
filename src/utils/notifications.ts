import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import {
  getStoredNotificationSettings,
  saveStoredNotificationSettings,
} from './storage';

export interface NotificationSettings {
  enabled: boolean;
  time: string; // HH:mm format, e.g. "19:00"
  sound: boolean;
  vibrate: boolean;
}

export const defaultNotificationSettings: NotificationSettings = {
  enabled: true,
  time: '18:30',
  sound: true,
  vibrate: true,
};

export function getNotificationSettings(): NotificationSettings {
  return getStoredNotificationSettings();
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  saveStoredNotificationSettings(settings);
}

// Request permissions
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await LocalNotifications.requestPermissions();
      return status.display === 'granted';
    } else if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      return perm === 'granted';
    }
  } catch (err) {
    console.warn('Error requesting notification permission', err);
  }
  return false;
}

// Schedule daily recurring reminder
export async function scheduleDailyStudyReminder(settings: NotificationSettings): Promise<boolean> {
  saveNotificationSettings(settings);

  if (!settings.enabled) {
    await cancelDailyReminder();
    return true;
  }

  try {
    const [hourStr, minuteStr] = settings.time.split(':');
    const hour = parseInt(hourStr, 10) || 18;
    const minute = parseInt(minuteStr, 10) || 30;

    if (Capacitor.isNativePlatform()) {
      // Cancel previous scheduled notification ID 1001
      await LocalNotifications.cancel({ notifications: [{ id: 1001 }] });

      // Calculate next trigger date
      const now = new Date();
      const scheduledTime = new Date();
      scheduledTime.setHours(hour, minute, 0, 0);

      if (scheduledTime <= now) {
        // If time already passed today, schedule for tomorrow
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            id: 1001,
            title: '🌿 وقت مراجعة مادة الأحياء!',
            body: 'تابع درس اليوم واستعد للاختبارات التفاعلية لكتاب الأحياء المدرسي.',
            schedule: {
              at: scheduledTime,
              repeats: true,
              every: 'day',
            },
            sound: settings.sound ? 'res://raw/notification' : undefined,
            smallIcon: 'ic_launcher',
            actionTypeId: '',
            extra: {
              type: 'daily_study_reminder',
            },
          },
        ],
      });
      return true;
    } else {
      // Browser preview mode
      if ('Notification' in window && Notification.permission === 'granted') {
        console.log(`[Web Notification] Scheduled daily at ${hour}:${minute}`);
      }
      return true;
    }
  } catch (err) {
    console.error('Failed scheduling notification', err);
    return false;
  }
}

// Cancel daily reminder
export async function cancelDailyReminder(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.cancel({ notifications: [{ id: 1001 }] });
    }
  } catch (err) {
    console.warn('Error cancelling notification', err);
  }
}

// Send immediate test notification
export async function triggerImmediateTestNotification(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: 9999,
            title: '🌿 تجربة تنبيه: أحياء - Biology',
            body: 'التنبيهات المحلية تعمل بنجاح! سيتم تذكيرك يومياً بمتابعة دروسك.',
            schedule: { at: new Date(Date.now() + 1000) },
            smallIcon: 'ic_launcher',
          },
        ],
      });
      return true;
    } else if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('🌿 تجربة تنبيه: أحياء - Biology', {
          body: 'التنبيهات المحلية تعمل بنجاح! سيتم تذكيرك يومياً بمتابعة دروسك.',
          icon: '/favicon.ico',
        });
        return true;
      } else {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          new Notification('🌿 تجربة تنبيه: أحياء - Biology', {
            body: 'التنبيهات المحلية تعمل بنجاح! سيتم تذكيرك يومياً بمتابعة دروسك.',
            icon: '/favicon.ico',
          });
          return true;
        }
      }
    }
  } catch (e) {
    console.warn(e);
  }
  return false;
}
