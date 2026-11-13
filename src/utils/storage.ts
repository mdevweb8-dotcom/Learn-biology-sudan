import {
  BiologyDatabase,
  StudentProgress,
  QuizAttemptRecord,
  ActiveQuizSession,
  DailyQuizRecord,
  LessonPositionState,
  AppSettings,
  QuestionReviewStats,
} from '../types/biology';
import { initialBiologyData } from '../data/biologyData';

const DB_NAME = 'biology_school_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';

const IDB_KEYS = {
  BIOLOGY_DB: 'biology_database',
  PROGRESS: 'student_progress',
  NOTIFICATION_SETTINGS: 'notification_settings',
} as const;

const LEGACY_LOCAL_KEYS = {
  DB: 'BIOLOGY_DATABASE_DATA_V1',
  PROGRESS: 'BIOLOGY_STUDENT_PROGRESS_V1',
  NOTIFICATIONS: 'BIOLOGY_NOTIFICATION_SETTINGS_V1',
} as const;

export interface NotificationSettingsRecord {
  enabled: boolean;
  time: string;
  sound: boolean;
  vibrate: boolean;
}

export const defaultNotificationSettingsRecord: NotificationSettingsRecord = {
  enabled: true,
  time: '18:30',
  sound: true,
  vibrate: true,
};

function generateDeviceId(): string {
  return 'dev-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

export function createDefaultStudentProgress(): StudentProgress {
  const now = new Date().toISOString();
  return {
    completedLessons: [],
    masteredLessons: [],
    bookmarkedLessons: [],
    bookmarkedQuestions: [],
    lessonNotes: {},
    quizHistory: [],
    lastActiveLessonId: null,
    lastLessonPosition: null,
    questionStats: {},
    activeQuizSession: null,
    activeDailySession: null,
    dailyQuizByDate: {},
    settings: {
      dailyQuizQuestionCount: 10,
    },
    syncMetadata: {
      schemaVersion: 2,
      deviceId: generateDeviceId(),
      lastLocalMutationAt: now,
      lastSyncedAt: null,
      pendingSyncQueue: [],
    },
  };
}

export const defaultStudentProgress: StudentProgress = createDefaultStudentProgress();

// In-memory hydrated cache for synchronous UI reads while IndexedDB remains source of truth
let isInitialized = false;
let initPromise: Promise<void> | null = null;
let cachedBiologyData: BiologyDatabase = initialBiologyData;
let cachedProgress: StudentProgress = createDefaultStudentProgress();
let cachedNotificationSettings: NotificationSettingsRecord = { ...defaultNotificationSettingsRecord };
let pendingWriteChain: Promise<void> = Promise.resolve();

function getIDBFactory(): IDBFactory | null {
  try {
    if (typeof globalThis !== 'undefined' && 'indexedDB' in globalThis && globalThis.indexedDB) {
      return globalThis.indexedDB;
    }
  } catch {
    // ignore
  }
  return null;
}

function openDatabase(): Promise<IDBDatabase | null> {
  const idb = getIDBFactory();
  if (!idb) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const request = idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        console.warn('IndexedDB open error:', request.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB exception:', err);
      resolve(null);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        resolve((req.result as T) ?? null);
      };
      req.onerror = () => {
        resolve(null);
      };
      tx.oncomplete = () => {
        db.close();
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function idbSet<T>(key: string, value: T): Promise<boolean> {
  const db = await openDatabase();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

function enqueueWrite(task: () => Promise<void>): void {
  pendingWriteChain = pendingWriteChain
    .then(task)
    .catch((err) => {
      console.warn('IndexedDB queued write failed:', err);
    });
}

export async function flushStorageWrites(): Promise<void> {
  await pendingWriteChain;
}

export function normalizeStudentProgress(raw: unknown): StudentProgress {
  const base = createDefaultStudentProgress();
  if (!raw || typeof raw !== 'object') return base;
  const parsed = raw as Partial<StudentProgress>;

  const questionStats: Record<string, QuestionReviewStats> = {};
  if (parsed.questionStats && typeof parsed.questionStats === 'object') {
    for (const [qId, stat] of Object.entries(parsed.questionStats)) {
      if (stat && typeof stat === 'object') {
        const masteredRounds = Array.isArray(stat.masteredRounds)
          ? stat.masteredRounds.filter((r): r is 1 | 2 | 3 => r === 1 || r === 2 || r === 3)
          : [];
        questionStats[qId] = {
          questionId: qId,
          attempts: typeof stat.attempts === 'number' ? stat.attempts : 0,
          correctCount: typeof stat.correctCount === 'number' ? stat.correctCount : 0,
          wrongCount: typeof stat.wrongCount === 'number' ? stat.wrongCount : 0,
          consecutiveCorrect: typeof stat.consecutiveCorrect === 'number' ? stat.consecutiveCorrect : 0,
          masteredRounds,
          isMastered:
            typeof stat.isMastered === 'boolean'
              ? stat.isMastered
              : [1, 2, 3].every((r) => masteredRounds.includes(r as 1 | 2 | 3)),
          lastAttemptAt: typeof stat.lastAttemptAt === 'string' ? stat.lastAttemptAt : new Date().toISOString(),
          lastWrongAt: typeof stat.lastWrongAt === 'string' ? stat.lastWrongAt : undefined,
        };
      }
    }
  }

  const dailyQuizByDate: Record<string, DailyQuizRecord> =
    parsed.dailyQuizByDate && typeof parsed.dailyQuizByDate === 'object'
      ? parsed.dailyQuizByDate
      : {};

  const dailyCountRaw = parsed.settings?.dailyQuizQuestionCount;
  const dailyQuizQuestionCount =
    typeof dailyCountRaw === 'number' && dailyCountRaw >= 3 && dailyCountRaw <= 30
      ? Math.round(dailyCountRaw)
      : 10;

  return {
    completedLessons: Array.isArray(parsed.completedLessons) ? parsed.completedLessons : [],
    masteredLessons: Array.isArray(parsed.masteredLessons) ? parsed.masteredLessons : [],
    bookmarkedLessons: Array.isArray(parsed.bookmarkedLessons) ? parsed.bookmarkedLessons : [],
    bookmarkedQuestions: Array.isArray(parsed.bookmarkedQuestions) ? parsed.bookmarkedQuestions : [],
    lessonNotes:
      typeof parsed.lessonNotes === 'object' && parsed.lessonNotes !== null
        ? parsed.lessonNotes
        : {},
    quizHistory: Array.isArray(parsed.quizHistory) ? parsed.quizHistory : [],
    lastActiveLessonId:
      typeof parsed.lastActiveLessonId === 'string' ? parsed.lastActiveLessonId : null,
    lastLessonPosition:
      parsed.lastLessonPosition && typeof parsed.lastLessonPosition === 'object'
        ? parsed.lastLessonPosition
        : null,
    questionStats,
    activeQuizSession:
      parsed.activeQuizSession && typeof parsed.activeQuizSession === 'object'
        ? parsed.activeQuizSession
        : null,
    activeDailySession:
      parsed.activeDailySession && typeof parsed.activeDailySession === 'object'
        ? parsed.activeDailySession
        : null,
    dailyQuizByDate,
    settings: {
      dailyQuizQuestionCount,
    },
    syncMetadata: {
      schemaVersion: 2,
      deviceId: parsed.syncMetadata?.deviceId || base.syncMetadata.deviceId,
      lastLocalMutationAt:
        parsed.syncMetadata?.lastLocalMutationAt || base.syncMetadata.lastLocalMutationAt,
      lastSyncedAt: parsed.syncMetadata?.lastSyncedAt ?? null,
      pendingSyncQueue: Array.isArray(parsed.syncMetadata?.pendingSyncQueue)
        ? parsed.syncMetadata.pendingSyncQueue
        : [],
    },
  };
}

function readLegacyLocalStorage<T>(key: string): T | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeLegacyMirror(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Quota or SSR/Node test environment — IndexedDB remains primary
  }
}

function removeLegacyMirror(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function isValidBiologyDatabase(candidate: unknown): candidate is BiologyDatabase {
  if (!candidate || typeof candidate !== 'object') return false;
  const db = candidate as Partial<BiologyDatabase>;
  return Array.isArray(db.units) && Array.isArray(db.lessons) && Array.isArray(db.questions);
}

/**
 * Hydrate unified offline IndexedDB and safely migrate any legacy localStorage state.
 * Must be called on startup before reading data; safe to call multiple times.
 */
export async function initStorage(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // 1. Biology Database
      const idbDb = await idbGet<BiologyDatabase>(IDB_KEYS.BIOLOGY_DB);
      if (isValidBiologyDatabase(idbDb)) {
        cachedBiologyData = idbDb;
      } else {
        const legacyDb = readLegacyLocalStorage<BiologyDatabase>(LEGACY_LOCAL_KEYS.DB);
        if (isValidBiologyDatabase(legacyDb)) {
          cachedBiologyData = legacyDb;
          await idbSet(IDB_KEYS.BIOLOGY_DB, legacyDb);
        } else {
          cachedBiologyData = initialBiologyData;
          await idbSet(IDB_KEYS.BIOLOGY_DB, initialBiologyData);
        }
      }

      // 2. Student Progress (migrate legacy progress without losing bookmarks/notes/history)
      const idbProgress = await idbGet<StudentProgress>(IDB_KEYS.PROGRESS);
      if (idbProgress) {
        cachedProgress = normalizeStudentProgress(idbProgress);
      } else {
        const legacyProgress = readLegacyLocalStorage<unknown>(LEGACY_LOCAL_KEYS.PROGRESS);
        if (legacyProgress) {
          cachedProgress = normalizeStudentProgress(legacyProgress);
        } else {
          cachedProgress = createDefaultStudentProgress();
        }
        await idbSet(IDB_KEYS.PROGRESS, cachedProgress);
      }

      // 3. Notification Settings
      const idbNotif = await idbGet<NotificationSettingsRecord>(IDB_KEYS.NOTIFICATION_SETTINGS);
      if (idbNotif && typeof idbNotif === 'object') {
        cachedNotificationSettings = {
          enabled: typeof idbNotif.enabled === 'boolean' ? idbNotif.enabled : true,
          time: typeof idbNotif.time === 'string' ? idbNotif.time : '18:30',
          sound: typeof idbNotif.sound === 'boolean' ? idbNotif.sound : true,
          vibrate: typeof idbNotif.vibrate === 'boolean' ? idbNotif.vibrate : true,
        };
      } else {
        const legacyNotif = readLegacyLocalStorage<Partial<NotificationSettingsRecord>>(
          LEGACY_LOCAL_KEYS.NOTIFICATIONS
        );
        cachedNotificationSettings = {
          enabled: typeof legacyNotif?.enabled === 'boolean' ? legacyNotif.enabled : true,
          time: typeof legacyNotif?.time === 'string' ? legacyNotif.time : '18:30',
          sound: typeof legacyNotif?.sound === 'boolean' ? legacyNotif.sound : true,
          vibrate: typeof legacyNotif?.vibrate === 'boolean' ? legacyNotif.vibrate : true,
        };
        await idbSet(IDB_KEYS.NOTIFICATION_SETTINGS, cachedNotificationSettings);
      }
    } catch (err) {
      console.warn('Storage initialization warning, using in-memory state:', err);
    } finally {
      isInitialized = true;
    }
  })();

  return initPromise;
}

/**
 * Reset only the in-memory cache (for simulating app reload/restart in automated IndexedDB tests).
 */
export function resetMemoryCacheForReloadTest(): void {
  isInitialized = false;
  initPromise = null;
  cachedBiologyData = initialBiologyData;
  cachedProgress = createDefaultStudentProgress();
  cachedNotificationSettings = { ...defaultNotificationSettingsRecord };
}

/**
 * Retrieve current offline biology database.
 */
export function getStoredBiologyData(): BiologyDatabase {
  if (!isInitialized) {
    const legacyDb = readLegacyLocalStorage<BiologyDatabase>(LEGACY_LOCAL_KEYS.DB);
    if (isValidBiologyDatabase(legacyDb)) {
      cachedBiologyData = legacyDb;
    }
  }
  return cachedBiologyData;
}

/**
 * Save or replace biology database (e.g., from uploaded JSON) to IndexedDB + fallback mirror.
 */
export function saveBiologyData(data: BiologyDatabase): boolean {
  if (!isValidBiologyDatabase(data)) return false;
  cachedBiologyData = data;
  writeLegacyMirror(LEGACY_LOCAL_KEYS.DB, data);
  enqueueWrite(async () => {
    await idbSet(IDB_KEYS.BIOLOGY_DB, data);
  });
  return true;
}

/**
 * Reset biology database back to default initial book curriculum (does NOT delete student progress).
 */
export function resetBiologyData(): void {
  cachedBiologyData = initialBiologyData;
  removeLegacyMirror(LEGACY_LOCAL_KEYS.DB);
  enqueueWrite(async () => {
    await idbDelete(IDB_KEYS.BIOLOGY_DB);
    await idbSet(IDB_KEYS.BIOLOGY_DB, initialBiologyData);
  });
}

/**
 * Get current student progress (always normalized).
 */
export function getStudentProgress(): StudentProgress {
  if (!isInitialized) {
    const legacyProgress = readLegacyLocalStorage<unknown>(LEGACY_LOCAL_KEYS.PROGRESS);
    if (legacyProgress) {
      cachedProgress = normalizeStudentProgress(legacyProgress);
    }
  }
  return cachedProgress;
}

/**
 * Persist student progress immediately in memory and asynchronously to IndexedDB.
 */
export function saveStudentProgress(
  progress: StudentProgress,
  syncEntity: 'progress' | 'daily_quiz' | 'lesson_mastery' | 'question_stat' = 'progress',
  entityId: string = 'global'
): StudentProgress {
  const now = new Date().toISOString();
  const normalized = normalizeStudentProgress(progress);

  const prevQueue = normalized.syncMetadata.pendingSyncQueue || [];
  const filteredQueue = prevQueue.filter(
    (item) => !(item.entity === syncEntity && item.entityId === entityId)
  );
  const nextQueue = [
    ...filteredQueue.slice(-199),
    {
      id: `${syncEntity}:${entityId}`,
      entity: syncEntity,
      entityId,
      updatedAt: now,
    },
  ];

  const enriched: StudentProgress = {
    ...normalized,
    syncMetadata: {
      ...normalized.syncMetadata,
      schemaVersion: 2,
      lastLocalMutationAt: now,
      pendingSyncQueue: nextQueue,
    },
  };

  cachedProgress = enriched;
  writeLegacyMirror(LEGACY_LOCAL_KEYS.PROGRESS, enriched);
  enqueueWrite(async () => {
    await idbSet(IDB_KEYS.PROGRESS, enriched);
  });
  return enriched;
}

export function getStoredNotificationSettings(): NotificationSettingsRecord {
  if (!isInitialized) {
    const legacy = readLegacyLocalStorage<Partial<NotificationSettingsRecord>>(
      LEGACY_LOCAL_KEYS.NOTIFICATIONS
    );
    if (legacy) {
      cachedNotificationSettings = {
        enabled: typeof legacy.enabled === 'boolean' ? legacy.enabled : true,
        time: typeof legacy.time === 'string' ? legacy.time : '18:30',
        sound: typeof legacy.sound === 'boolean' ? legacy.sound : true,
        vibrate: typeof legacy.vibrate === 'boolean' ? legacy.vibrate : true,
      };
    }
  }
  return cachedNotificationSettings;
}

export function saveStoredNotificationSettings(settings: NotificationSettingsRecord): void {
  cachedNotificationSettings = { ...settings };
  writeLegacyMirror(LEGACY_LOCAL_KEYS.NOTIFICATIONS, settings);
  enqueueWrite(async () => {
    await idbSet(IDB_KEYS.NOTIFICATION_SETTINGS, settings);
  });
}

/**
 * Save active reading position inside a lesson for exact resume ("متابعة من حيث توقفت").
 */
export function saveLessonPosition(position: LessonPositionState): StudentProgress {
  const current = getStudentProgress();
  const updated: StudentProgress = {
    ...current,
    lastActiveLessonId: position.lessonId,
    lastLessonPosition: position,
  };
  return saveStudentProgress(updated, 'progress', position.lessonId);
}

/**
 * Save active quiz session (lesson mastery, daily quiz, or smart review) immediately to IndexedDB.
 */
export function saveActiveSession(session: ActiveQuizSession | null, mode?: 'daily_quiz' | 'other'): StudentProgress {
  const current = getStudentProgress();
  const isDaily = mode === 'daily_quiz' || session?.mode === 'daily_quiz';
  const updated: StudentProgress = isDaily
    ? {
        ...current,
        activeDailySession: session,
      }
    : {
        ...current,
        activeQuizSession: session,
      };
  return saveStudentProgress(
    updated,
    isDaily ? 'daily_quiz' : 'lesson_mastery',
    session?.sessionId || 'cleared'
  );
}

/**
 * Update app settings (e.g., dailyQuizQuestionCount).
 */
export function updateAppSettings(partial: Partial<AppSettings>): StudentProgress {
  const current = getStudentProgress();
  const count = partial.dailyQuizQuestionCount ?? current.settings.dailyQuizQuestionCount;
  const clampedCount = Math.max(3, Math.min(30, Math.round(count)));
  const updated: StudentProgress = {
    ...current,
    settings: {
      ...current.settings,
      ...partial,
      dailyQuizQuestionCount: clampedCount,
    },
  };
  return saveStudentProgress(updated, 'progress', 'settings');
}

/**
 * Toggle bookmark for lesson.
 */
export function toggleLessonBookmark(lessonId: string): boolean {
  const current = getStudentProgress();
  const isBookmarked = current.bookmarkedLessons.includes(lessonId);
  const updated: StudentProgress = {
    ...current,
    bookmarkedLessons: isBookmarked
      ? current.bookmarkedLessons.filter((id) => id !== lessonId)
      : [...current.bookmarkedLessons, lessonId],
  };
  saveStudentProgress(updated, 'progress', `bookmark:${lessonId}`);
  return !isBookmarked;
}

/**
 * Toggle bookmark for quiz question.
 */
export function toggleQuestionBookmark(questionId: string): boolean {
  const current = getStudentProgress();
  const isBookmarked = current.bookmarkedQuestions.includes(questionId);
  const updated: StudentProgress = {
    ...current,
    bookmarkedQuestions: isBookmarked
      ? current.bookmarkedQuestions.filter((id) => id !== questionId)
      : [...current.bookmarkedQuestions, questionId],
  };
  saveStudentProgress(updated, 'progress', `qbookmark:${questionId}`);
  return !isBookmarked;
}

/**
 * Save note for lesson.
 */
export function saveLessonNote(lessonId: string, noteText: string): StudentProgress {
  const current = getStudentProgress();
  const updated: StudentProgress = {
    ...current,
    lessonNotes: {
      ...current.lessonNotes,
      [lessonId]: noteText,
    },
  };
  return saveStudentProgress(updated, 'progress', `note:${lessonId}`);
}

/**
 * Record quiz attempt to history.
 */
export function recordQuizAttempt(record: QuizAttemptRecord): StudentProgress {
  const current = getStudentProgress();
  const updated: StudentProgress = {
    ...current,
    quizHistory: [record, ...current.quizHistory.slice(0, 99)],
  };
  return saveStudentProgress(updated, 'progress', record.id);
}
