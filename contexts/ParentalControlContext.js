import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Brightness from 'expo-brightness';

const STORAGE_KEY = 'PARENTAL_SESSION';
const PIN_KEY = 'PARENTAL_PIN';
export const PARENTAL_PREFS_KEY = 'PARENTAL_PREFS';
export const DEFAULT_PARENTAL_PREFS = {
  mode: 'timer', timerMinutes: 10, storyCount: 3, videoCount: 3,
};
const DEFAULT_PIN = '1234';
const WARNING_MS = 30 * 1000;

const ParentalControlContext = createContext(null);

export const useParentalControl = () => useContext(ParentalControlContext);

export async function loadParentalPrefs() {
  try {
    const raw = await AsyncStorage.getItem(PARENTAL_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PARENTAL_PREFS };
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === 'stories' ? 'stories' : 'timer',
      timerMinutes: Math.min(180, Math.max(1, Number(parsed.timerMinutes) || DEFAULT_PARENTAL_PREFS.timerMinutes)),
      storyCount: Math.min(20, Math.max(1, Number(parsed.storyCount) || DEFAULT_PARENTAL_PREFS.storyCount)),
      videoCount: Math.min(20, Math.max(1, Number(parsed.videoCount) || DEFAULT_PARENTAL_PREFS.videoCount)),
    };
  } catch (_) {
    return { ...DEFAULT_PARENTAL_PREFS };
  }
}

export async function saveParentalPrefs(prefs) {
  await AsyncStorage.setItem(PARENTAL_PREFS_KEY, JSON.stringify({
    mode: prefs.mode === 'stories' ? 'stories' : 'timer',
    timerMinutes: Math.min(180, Math.max(1, Number(prefs.timerMinutes) || DEFAULT_PARENTAL_PREFS.timerMinutes)),
    storyCount: Math.min(20, Math.max(1, Number(prefs.storyCount) || DEFAULT_PARENTAL_PREFS.storyCount)),
    videoCount: Math.min(20, Math.max(1, Number(prefs.videoCount) || DEFAULT_PARENTAL_PREFS.videoCount)),
  }));
}

async function loadPin() {
  const stored = await AsyncStorage.getItem(PIN_KEY);
  return stored || DEFAULT_PIN;
}

export function ParentalControlProvider({ children }) {
  const [pin, setPin] = useState(DEFAULT_PIN);
  const [session, setSession] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(null);
  const warningShownRef = useRef(false);
  const originalBrightnessRef = useRef(null);

  useEffect(() => {
    (async () => {
      const [storedPin, storedSession] = await Promise.all([
        loadPin(),
        AsyncStorage.getItem(STORAGE_KEY),
      ]);
      setPin(storedPin);
      if (storedSession) {
        try {
          const parsed = JSON.parse(storedSession);
          if (parsed?.active) setSession(parsed);
        } catch (_) { /* ignore */ }
      }
    })();
  }, []);

  const persistSession = useCallback(async (next) => {
    setSession(next);
    if (next?.active) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const lockScreen = useCallback(async () => {
    setIsLocked(true);
    setShowWarning(false);
    try {
      if (originalBrightnessRef.current == null) {
        originalBrightnessRef.current = await Brightness.getBrightnessAsync();
      }
      await Brightness.setBrightnessAsync(0.01);
    } catch (_) { /* ignore */ }
  }, []);

  const activateSession = useCallback(async ({ mode, value, videoValue, parentPin }) => {
    const currentPin = await loadPin();
    if (parentPin !== currentPin) {
      throw new Error('INVALID_PIN');
    }
    const next = {
      active: true,
      mode,
      value,
      videoValue: mode === 'stories' ? (videoValue ?? value) : undefined,
      startedAt: Date.now(),
      storiesPlayed: 0,
      videosPlayed: 0,
      warningShown: false,
    };
    warningShownRef.current = false;
    setIsLocked(false);
    setShowWarning(false);
    await persistSession(next);
  }, [persistSession]);

  const restoreBrightness = useCallback(async () => {
    try {
      if (originalBrightnessRef.current != null) {
        await Brightness.setBrightnessAsync(originalBrightnessRef.current);
        originalBrightnessRef.current = null;
      }
    } catch (_) { /* ignore */ }
  }, []);

  const resetSessionAndUnlock = useCallback(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      warningShownRef.current = false;
      setIsLocked(false);
      setShowWarning(false);
      setRemainingMs(null);
      await restoreBrightness();
      return;
    }

    let current;
    try { current = JSON.parse(raw); } catch {
      warningShownRef.current = false;
      setIsLocked(false);
      setShowWarning(false);
      setRemainingMs(null);
      await restoreBrightness();
      return;
    }

    if (!current?.active) {
      warningShownRef.current = false;
      setIsLocked(false);
      setShowWarning(false);
      setRemainingMs(null);
      await restoreBrightness();
      return;
    }

    const prefs = await loadParentalPrefs();
    let next;
    if (current.mode === 'timer') {
      next = {
        ...current,
        mode: 'timer',
        value: prefs.timerMinutes,
        startedAt: Date.now(),
        warningShown: false,
      };
    } else {
      next = {
        ...current,
        mode: 'stories',
        value: prefs.storyCount,
        videoValue: prefs.videoCount,
        storiesPlayed: 0,
        videosPlayed: 0,
        warningShown: false,
      };
    }

    warningShownRef.current = false;
    setIsLocked(false);
    setShowWarning(false);
    setRemainingMs(current.mode === 'timer' ? next.value * 60 * 1000 : null);
    await persistSession(next);
    await restoreBrightness();
  }, [persistSession, restoreBrightness]);

  const deactivateSession = useCallback(async (parentPin) => {
    const currentPin = await loadPin();
    if (parentPin !== currentPin) {
      throw new Error('INVALID_PIN');
    }
    warningShownRef.current = false;
    setIsLocked(false);
    setShowWarning(false);
    setRemainingMs(null);
    await persistSession(null);
    await restoreBrightness();
  }, [persistSession, restoreBrightness]);

  const verifyParentPin = useCallback(async (parentPin) => {
    const currentPin = await loadPin();
    if (parentPin !== currentPin) {
      throw new Error('INVALID_PIN');
    }
    return true;
  }, []);

  const unlockScreen = useCallback(async (parentPin) => {
    const currentPin = await loadPin();
    if (parentPin !== currentPin) {
      throw new Error('INVALID_PIN');
    }
    await resetSessionAndUnlock();
  }, [resetSessionAndUnlock]);

  const unlockAfterMathVerification = useCallback(async () => {
    await resetSessionAndUnlock();
  }, [resetSessionAndUnlock]);

  const changePin = useCallback(async (currentPinInput, newPin) => {
    const currentPin = await loadPin();
    if (currentPinInput !== currentPin) {
      throw new Error('INVALID_PIN');
    }
    if (!/^\d{4}$/.test(newPin)) {
      throw new Error('INVALID_NEW_PIN');
    }
    await AsyncStorage.setItem(PIN_KEY, newPin);
    setPin(newPin);
  }, []);

  const resetPin = useCallback(async (newPin) => {
    if (!/^\d{4}$/.test(newPin)) {
      throw new Error('INVALID_NEW_PIN');
    }
    await AsyncStorage.setItem(PIN_KEY, newPin);
    setPin(newPin);
  }, []);

  const recordStoryCompleted = useCallback(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    let current;
    try { current = JSON.parse(raw); } catch { return false; }
    if (!current?.active || current.mode !== 'stories') return false;

    const nextCount = (current.storiesPlayed || 0) + 1;
    const next = { ...current, storiesPlayed: nextCount };
    await persistSession(next);
    if (nextCount >= current.value) {
      await lockScreen();
      return true;
    }
    return false;
  }, [persistSession, lockScreen]);

  const recordVideoCompleted = useCallback(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    let current;
    try { current = JSON.parse(raw); } catch { return false; }
    if (!current?.active || current.mode !== 'stories') return false;

    const videoLimit = current.videoValue ?? current.value;
    const nextCount = (current.videosPlayed || 0) + 1;
    const next = { ...current, videosPlayed: nextCount };
    await persistSession(next);
    if (nextCount >= videoLimit) {
      await lockScreen();
      return true;
    }
    return false;
  }, [persistSession, lockScreen]);

  const resetStoriesPlayed = useCallback(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setIsLocked(false);
      setShowWarning(false);
      return;
    }
    let current;
    try { current = JSON.parse(raw); } catch { return; }
    if (!current?.active || current.mode !== 'stories') return;

    warningShownRef.current = false;
    setIsLocked(false);
    setShowWarning(false);
    await persistSession({
      ...current,
      storiesPlayed: 0,
      warningShown: false,
    });
    try {
      if (originalBrightnessRef.current != null) {
        await Brightness.setBrightnessAsync(originalBrightnessRef.current);
        originalBrightnessRef.current = null;
      }
    } catch (_) { /* ignore */ }
  }, [persistSession]);

  const resetVideosPlayed = useCallback(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setIsLocked(false);
      setShowWarning(false);
      return;
    }
    let current;
    try { current = JSON.parse(raw); } catch { return; }
    if (!current?.active || current.mode !== 'stories') return;

    warningShownRef.current = false;
    setIsLocked(false);
    setShowWarning(false);
    await persistSession({
      ...current,
      videosPlayed: 0,
      warningShown: false,
    });
    try {
      if (originalBrightnessRef.current != null) {
        await Brightness.setBrightnessAsync(originalBrightnessRef.current);
        originalBrightnessRef.current = null;
      }
    } catch (_) { /* ignore */ }
  }, [persistSession]);

  const getStoriesRemaining = useCallback(() => {
    if (!session?.active || session.mode !== 'stories') return null;
    return Math.max(0, session.value - (session.storiesPlayed || 0));
  }, [session]);

  const getVideosRemaining = useCallback(() => {
    if (!session?.active || session.mode !== 'stories') return null;
    const limit = session.videoValue ?? session.value;
    return Math.max(0, limit - (session.videosPlayed || 0));
  }, [session]);

  const shouldWarnForStoryEnd = useCallback((remainingAudioMs) => {
    if (!session?.active || session.mode !== 'stories') return false;
    const remaining = getStoriesRemaining();
    return remaining === 1 && remainingAudioMs <= WARNING_MS && remainingAudioMs > 0;
  }, [session, getStoriesRemaining]);

  const shouldWarnForVideoEnd = useCallback((remainingVideoMs) => {
    if (!session?.active || session.mode !== 'stories') return false;
    const remaining = getVideosRemaining();
    return remaining === 1 && remainingVideoMs <= WARNING_MS && remainingVideoMs > 0;
  }, [session, getVideosRemaining]);

  const isStoryLimitReached = useCallback(() => {
    if (!session?.active || session.mode !== 'stories') return false;
    return (session.storiesPlayed || 0) >= session.value;
  }, [session]);

  const isVideoLimitReached = useCallback(() => {
    if (!session?.active || session.mode !== 'stories') return false;
    const limit = session.videoValue ?? session.value;
    return (session.videosPlayed || 0) >= limit;
  }, [session]);

  useEffect(() => {
    if (!session?.active || session.mode !== 'timer' || isLocked) {
      setRemainingMs(null);
      return undefined;
    }

    const tick = () => {
      const limitMs = session.value * 60 * 1000;
      const elapsed = Date.now() - session.startedAt;
      const left = Math.max(0, limitMs - elapsed);
      setRemainingMs(left);

      if (left <= WARNING_MS && left > 0 && !warningShownRef.current) {
        warningShownRef.current = true;
        setShowWarning(true);
        persistSession({ ...session, warningShown: true });
      }

      if (left <= 0) {
        lockScreen();
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session, isLocked, lockScreen, persistSession]);

  const dismissWarning = useCallback(() => setShowWarning(false), []);

  const triggerWarning = useCallback(() => {
    if (!warningShownRef.current) {
      warningShownRef.current = true;
      setShowWarning(true);
    }
  }, []);

  const value = useMemo(() => ({
    pin,
    session,
    isLocked,
    showWarning,
    remainingMs,
    activateSession,
    deactivateSession,
    unlockScreen,
    unlockAfterMathVerification,
    verifyParentPin,
    changePin,
    resetPin,
    recordStoryCompleted,
    recordVideoCompleted,
    resetStoriesPlayed,
    resetVideosPlayed,
    getStoriesRemaining,
    getVideosRemaining,
    shouldWarnForStoryEnd,
    shouldWarnForVideoEnd,
    isStoryLimitReached,
    isVideoLimitReached,
    dismissWarning,
    triggerWarning,
    lockScreen,
    isActive: !!session?.active,
    mode: session?.mode || 'off',
  }), [
    pin, session, isLocked, showWarning, remainingMs,
    activateSession, deactivateSession, unlockScreen, unlockAfterMathVerification, verifyParentPin, changePin, resetPin,
    recordStoryCompleted, recordVideoCompleted, resetStoriesPlayed, resetVideosPlayed,
    getStoriesRemaining, getVideosRemaining, shouldWarnForStoryEnd, shouldWarnForVideoEnd,
    isStoryLimitReached, isVideoLimitReached, dismissWarning, triggerWarning, lockScreen,
  ]);

  return (
    <ParentalControlContext.Provider value={value}>
      {children}
    </ParentalControlContext.Provider>
  );
}
