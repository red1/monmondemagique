import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import { Alert } from 'react-native';
import {
  downloadPackage, getPackagesMeta, DownloadCancelledError,
  notifyStoriesLibraryUpdated, syncLibraryFromDisk,
} from '../src/services/storyService';
import { useSounds } from './SoundContext';
import { useLanguage } from './LanguageContext';
import { getStrings } from '../constants/Strings';

const StoryDownloadContext = createContext(null);

export const useStoryDownload = () => useContext(StoryDownloadContext);

export function StoryDownloadProvider({ children }) {
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);

  const [downloadProgress, setDownloadProgress] = useState({});
  const [packSizes, setPackSizes] = useState({});
  const handlesRef = useRef({});
  const countRef = useRef(0);

  const setPackProgress = useCallback((packId, update) => {
    setDownloadProgress((prev) => {
      const prevEntry = prev[packId] || { progress: 0, status: 'preparing' };
      const next = typeof update === 'object' && update !== null
        ? { ...prevEntry, ...update, progress: update.progress ?? prevEntry.progress }
        : { ...prevEntry, progress: update };
      return { ...prev, [packId]: next };
    });
  }, []);

  const clearPackProgress = useCallback((packId) => {
    setDownloadProgress((prev) => {
      const next = { ...prev };
      delete next[packId];
      return next;
    });
  }, []);

  const isDownloading = useCallback(
    (packId) => downloadProgress[packId] != null,
    [downloadProgress],
  );

  const startDownload = useCallback((packId) => {
    if (handlesRef.current[packId]) {
      return false;
    }

    countRef.current += 1;
    setPackProgress(packId, { progress: 0, status: 'preparing' });

    const handle = downloadPackage(packId, (update) => {
      setPackProgress(packId, update);
      if (update.totalBytes) {
        setPackSizes((prev) => ({ ...prev, [packId]: update.totalBytes }));
      }
    });
    handlesRef.current[packId] = handle;

    handle.promise
      .then((result) => {
        notifyStoriesLibraryUpdated();
        playSound('success');
        if (countRef.current === 1) {
          Alert.alert(t.success, t.storiesPackReady(result.stories.length));
        }
        return result;
      })
      .catch(async (e) => {
        await syncLibraryFromDisk();
        notifyStoriesLibraryUpdated();
        if (e instanceof DownloadCancelledError || e?.name === 'DownloadCancelledError') {
          const meta = await getPackagesMeta();
          const count = meta[packId]?.storyCount || 0;
          Alert.alert(
            t.storiesDownloadCancelled,
            count > 0 ? t.storiesPartialSaved(count) : t.storiesDownloadStoppedEmpty,
          );
          return;
        }
        Alert.alert(t.error, e.message || String(e));
      })
      .finally(() => {
        countRef.current = Math.max(0, countRef.current - 1);
        delete handlesRef.current[packId];
        clearPackProgress(packId);
      });

    return true;
  }, [clearPackProgress, playSound, setPackProgress, t]);

  const cancelDownload = useCallback((packId) => {
    handlesRef.current[packId]?.cancel();
  }, []);

  const pauseDownload = useCallback(async (packId) => {
    const handle = handlesRef.current[packId];
    if (!handle) return;
    const dl = downloadProgress[packId];
    if (dl?.status === 'paused') {
      const ok = await handle.resume();
      if (ok) setPackProgress(packId, { status: 'downloading' });
    } else if (handle.canPause()) {
      const ok = await handle.pause();
      if (ok) setPackProgress(packId, { status: 'paused' });
    }
  }, [downloadProgress, setPackProgress]);

  const activeCount = useMemo(
    () => Object.keys(downloadProgress).length,
    [downloadProgress],
  );

  const value = useMemo(() => ({
    downloadProgress,
    packSizes,
    setPackSizes,
    activeCount,
    isDownloading,
    startDownload,
    cancelDownload,
    pauseDownload,
  }), [
    downloadProgress, packSizes, activeCount, isDownloading,
    startDownload, cancelDownload, pauseDownload,
  ]);

  return (
    <StoryDownloadContext.Provider value={value}>
      {children}
    </StoryDownloadContext.Provider>
  );
}
