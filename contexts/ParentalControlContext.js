import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Brightness from 'expo-brightness';

const STORAGE_KEY = 'PARENTAL_SESSION';
const PIN_KEY = 'PARENTAL_PIN';
export const PARENTAL_PREFS_KEY = 'PARENTAL_PREFS';
export const DEFAULT_PARENTAL_PREFS = { mode: 'timer', timerMinutes: 10, storyCount: 3 };
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

  const activateSession = useCallback(async ({ mode, value, parentPin }) => {
    const currentPin = await loadPin();
    if (parentPin !== currentPin) {
      throw new Error('INVALID_PIN');
    }
    const next = {
      active: true,
      mode,
      value,
      startedAt: Date.now(),
      storiesPlayed: 0,
      warningShown: false,
    };
    warningShownRef.current = false;
    setIsLocked(false);
    setShowWarning(false);
    await persistSession(next);
  }, [persistSession]);

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
    try {
      if (originalBrightnessRef.current != null) {
        await Brightness.setBrightnessAsync(originalBrightnessRef.current);
        originalBrightnessRef.current = null;
      }
    } catch (_) { /* ignore */ }
  }, [persistSession]);

  const unlockScreen = useCallback(async (parentPin) => {
    await deactivateSession(parentPin);
  }, [deactivateSession]);

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

  const getStoriesRemaining = useCallback(() => {
    if (!session?.active || session.mode !== 'stories') return null;
    return Math.max(0, session.value - (session.storiesPlayed || 0));
  }, [session]);

  const shouldWarnForStoryEnd = useCallback((remainingAudioMs) => {
    if (!session?.active || session.mode !== 'stories') return false;
    const remaining = getStoriesRemaining();
    return remaining === 1 && remainingAudioMs <= WARNING_MS && remainingAudioMs > 0;
  }, [session, getStoriesRemaining]);

  const isStoryLimitReached = useCallback(() => {
    if (!session?.active || session.mode !== 'stories') return false;
    return (session.storiesPlayed || 0) >= session.value;
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
    changePin,
    resetPin,
    recordStoryCompleted,
    resetStoriesPlayed,
    getStoriesRemaining,
    shouldWarnForStoryEnd,
    isStoryLimitReached,
    dismissWarning,
    triggerWarning,
    lockScreen,
    isActive: !!session?.active,
    mode: session?.mode || 'off',
  }), [
    pin, session, isLocked, showWarning, remainingMs,
    activateSession, deactivateSession, unlockScreen, changePin, resetPin,
    recordStoryCompleted, resetStoriesPlayed, getStoriesRemaining, shouldWarnForStoryEnd,
    isStoryLimitReached, dismissWarning, triggerWarning, lockScreen,
  ]);

  return (
    <ParentalControlContext.Provider value={value}>
      {children}
    </ParentalControlContext.Provider>
  );
}
