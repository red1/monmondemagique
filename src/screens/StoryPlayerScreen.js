import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, BackHandler, FlatList,
  Alert, useWindowDimensions, AppState,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Audio } from 'expo-av';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Brightness from 'expo-brightness';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WarningBanner from '../components/shared/WarningBanner';
import ParentalLockScreen from '../components/shared/ParentalLockScreen';
import AnimatedBackground from '../components/shared/AnimatedBackground';
import StoryCoverImage from '../components/shared/StoryCoverImage';
import { useSounds } from '../../contexts/SoundContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useParentalControl } from '../../contexts/ParentalControlContext';
import { getStrings } from '../../constants/Strings';
import {
  getDownloadedStories, buildPlaylist, savePlaybackProgress,
  loadPlaybackProgress, clearPlaybackProgress, MIN_PLAYABLE_DURATION_MS,
  getSavedPlaylistProgress, clearSavedPlaylistProgress,
  recordPackUsage, getStoryResumePosition,
} from '../services/storyService';
import { safeGoBack } from '../utils/safeNavigation';
import { stopActiveStorySound, registerStorySound, clearStorySound } from '../utils/storyAudio';
import PlayerControlBtn, { playerControlStyles } from '../components/shared/PlayerControlBtn';
import VolumeControls from '../components/shared/VolumeControls';

const WARNING_SECONDS = 30;
const SKIP_MS = 10_000;
const PROGRESS_SAVE_INTERVAL_MS = 5_000;
const PINK = '#FF69B4';
const DEFAULT_VOLUME = 0.85;

function isHashFilename(name) {
  return /^[a-f0-9]{20,}\.mp3$/i.test(name || '');
}

export default function StoryPlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { beginStoryPlayback, endStoryPlayback } = useSounds();
  const beginStoryPlaybackRef = useRef(beginStoryPlayback);
  const endStoryPlaybackRef = useRef(endStoryPlayback);
  beginStoryPlaybackRef.current = beginStoryPlayback;
  endStoryPlaybackRef.current = endStoryPlayback;
  const { language } = useLanguage();
  const {
    shouldWarnForStoryEnd, recordStoryCompleted, triggerWarning, getStoriesRemaining,
    isActive, session, isLocked, lockScreen, resetStoriesPlayed,
  } = useParentalControl();
  const t = getStrings(language);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const artworkSize = width >= 768 ? 180 : 140;
  const playlistPanelMaxHeight = width >= 768 ? '42%' : '38%';

  const playlistIds = useMemo(() => {
    try { return JSON.parse(params.playlist || '[]'); }
    catch { return []; }
  }, [params.playlist]);

  const savedPlaylistId = params.savedPlaylistId || null;

  const [playlist, setPlaylist] = useState([]);
  const [storyIndex, setStoryIndex] = useState(0);
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [showBedtime, setShowBedtime] = useState(false);
  const [warningShown, setWarningShown] = useState(false);
  const [ready, setReady] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);

  const lastPlaybackUiRef = useRef(0);
  const positionMsRef = useRef(0);
  const soundRef = useRef(null);
  const totalRemainingRef = useRef(0);
  const playlistRef = useRef([]);
  const storyIndexRef = useRef(0);
  const trackIndexRef = useRef(0);
  const warningShownRef = useRef(false);
  const resumeStartMsRef = useRef(0);
  const playbackSessionRef = useRef(0);
  const lastSavedRef = useRef({ sIdx: 0, tIdx: 0, pos: 0 });
  const playlistListRef = useRef(null);
  const progressFinalizedRef = useRef(false);
  const seekingRef = useRef(false);
  const exitProgressSavedRef = useRef(false);

  const currentStory = playlist[storyIndex];
  const currentTrack = currentStory?.tracks?.[trackIndex];

  const displayTitle = currentStory?.title || currentTrack?.name || t.storiesGame;
  const displaySubtitle = (() => {
    const trackName = currentTrack?.name;
    if (trackName && !isHashFilename(trackName) && trackName !== currentStory?.title) {
      return trackName;
    }
    return null;
  })();

  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { storyIndexRef.current = storyIndex; }, [storyIndex]);
  useEffect(() => { trackIndexRef.current = trackIndex; }, [trackIndex]);
  useEffect(() => { warningShownRef.current = warningShown; }, [warningShown]);

  const computeTotalRemaining = useCallback((pl, sIdx, tIdx, posMs) => {
    let total = 0;
    for (let s = sIdx; s < pl.length; s++) {
      const tracks = pl[s].tracks || [];
      for (let tr = s === sIdx ? tIdx : 0; tr < tracks.length; tr++) {
        const dur = tracks[tr].durationMs || 0;
        if (s === sIdx && tr === tIdx) {
          total += Math.max(0, dur - posMs);
        } else {
          total += dur;
        }
      }
    }
    return total;
  }, []);

  const computeCurrentStoryRemaining = useCallback((pl, sIdx, tIdx, posMs) => {
    const tracks = pl[sIdx]?.tracks || [];
    let total = 0;
    for (let tr = tIdx; tr < tracks.length; tr++) {
      const dur = tracks[tr].durationMs || 0;
      if (tr === tIdx) total += Math.max(0, dur - posMs);
      else total += dur;
    }
    return total;
  }, []);

  const persistProgress = useCallback(async (sIdx, tIdx, pos) => {
    lastSavedRef.current = { sIdx, tIdx, pos };
    await savePlaybackProgress({
      playlist: playlistIds,
      savedPlaylistId: savedPlaylistId || undefined,
      currentStoryIndex: sIdx,
      currentTrackIndex: tIdx,
      positionMs: pos,
    });
  }, [playlistIds, savedPlaylistId]);

  const loadPlaylist = useCallback(async () => {
    exitProgressSavedRef.current = false;
    const meta = await getDownloadedStories();
    let pl = buildPlaylist(playlistIds, meta);

    const progress = await loadPlaybackProgress();
    const shouldResume = params.resume === '1';
    const isFreshStart = params.fresh === '1';

    if (isFreshStart) {
      await resetStoriesPlayed();
      if (savedPlaylistId) {
        await clearSavedPlaylistProgress(savedPlaylistId);
      }
    }

    if (params.parental === '1' && isActive && session?.mode === 'stories') {
      const limit = getStoriesRemaining() ?? session.value;
      pl = pl.slice(0, Math.max(limit, 0));
    }
    setPlaylist(pl);

    let resumeProgress = progress;
    if (savedPlaylistId && shouldResume) {
      const savedProgress = await getSavedPlaylistProgress(savedPlaylistId);
      if (savedProgress) resumeProgress = savedProgress;
    }

    if (shouldResume && resumeProgress) {
      const startIdx = params.startStoryIndex != null
        ? Math.min(parseInt(String(params.startStoryIndex), 10) || 0, Math.max(pl.length - 1, 0))
        : (pl.length === 1
          ? 0
          : Math.min(resumeProgress.currentStoryIndex || 0, Math.max(pl.length - 1, 0)));
      const { trackIndex: tIdx, positionMs: posMs } = getStoryResumePosition(
        resumeProgress, playlistIds, startIdx,
      );
      const tracks = pl[startIdx]?.tracks || [];
      const safeTIdx = Math.min(tIdx, Math.max(tracks.length - 1, 0));
      resumeStartMsRef.current = posMs;
      setStoryIndex(startIdx);
      setTrackIndex(safeTIdx);
      setPositionMs(posMs);
    } else if (isFreshStart && pl.length > 0) {
      await savePlaybackProgress({
        playlist: playlistIds,
        savedPlaylistId: savedPlaylistId || undefined,
        currentStoryIndex: 0,
        currentTrackIndex: 0,
        positionMs: 0,
        resetStoryPositions: true,
      });
    }
    setReady(true);
  }, [playlistIds, params.resume, params.fresh, params.startStoryIndex, params.parental, isActive, session, getStoriesRemaining, resetStoriesPlayed, savedPlaylistId]);

  useEffect(() => { loadPlaylist(); }, [loadPlaylist]);

  const unloadSound = useCallback(async () => {
    const sound = soundRef.current;
    if (!sound) return;
    clearStorySound(sound);
    soundRef.current = null;
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch (_) { /* ignore */ }
  }, []);

  const stopPlayback = useCallback(async () => {
    playbackSessionRef.current += 1;
    await unloadSound();
    await stopActiveStorySound();
  }, [unloadSound]);

  const stopPlaybackRef = useRef(stopPlayback);
  stopPlaybackRef.current = stopPlayback;

  const saveCurrentProgress = useCallback(async ({ force = false } = {}) => {
    if (progressFinalizedRef.current || !playlistRef.current.length) return;
    if (!force && exitProgressSavedRef.current) return;

    let pos = lastSavedRef.current.pos || 0;
    if (soundRef.current) {
      try {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) pos = status.positionMillis ?? pos;
      } catch (_) { /* ignore */ }
    }

    await persistProgress(storyIndexRef.current, trackIndexRef.current, pos);
    if (force) exitProgressSavedRef.current = true;
  }, [persistProgress]);

  useEffect(() => {
    beginStoryPlaybackRef.current();
    stopActiveStorySound();
    return () => {
      stopPlaybackRef.current();
      endStoryPlaybackRef.current();
    };
  }, []);

  const finishPlaylist = useCallback(async () => {
    progressFinalizedRef.current = true;
    setIsPlaying(false);
    await unloadSound();
    await clearPlaybackProgress();
    deactivateKeepAwake('story-player');

    const storiesLeft = getStoriesRemaining();
    if (params.parental === '1' && isActive && session?.mode === 'stories' && storiesLeft > 0) {
      router.replace('/stories');
      return;
    }

    try {
      await Brightness.setBrightnessAsync(0.01);
    } catch (_) { /* ignore */ }

    if (isActive) {
      await lockScreen();
    }

    setShowBedtime(true);
  }, [unloadSound, params.parental, isActive, session, getStoriesRemaining, router, lockScreen]);

  const handleTrackEnd = useCallback(async () => {
    const pl = playlistRef.current;
    const sIdx = storyIndexRef.current;
    const tIdx = trackIndexRef.current;
    const story = pl[sIdx];
    const nextTrack = tIdx + 1;
    if (story?.tracks && nextTrack < story.tracks.length) {
      setTrackIndex(nextTrack);
      await persistProgress(sIdx, nextTrack, 0);
      return;
    }

    const locked = await recordStoryCompleted();
    if (locked) {
      setIsPlaying(false);
      await unloadSound();
      await clearPlaybackProgress();
      deactivateKeepAwake('story-player');
      setShowBedtime(true);
      return;
    }

    const nextStory = sIdx + 1;
    if (nextStory < pl.length) {
      let pos = lastSavedRef.current.pos || 0;
      if (soundRef.current) {
        try {
          const status = await soundRef.current.getStatusAsync();
          if (status.isLoaded) pos = status.positionMillis || 0;
        } catch (_) { /* ignore */ }
      }
      await persistProgress(sIdx, tIdx, pos);

      const progress = await loadPlaybackProgress();
      const { trackIndex: nextTIdx, positionMs: nextPos } = getStoryResumePosition(
        progress, playlistIds, nextStory,
      );
      const nextTracks = pl[nextStory]?.tracks || [];
      const safeTIdx = Math.min(nextTIdx, Math.max(nextTracks.length - 1, 0));
      resumeStartMsRef.current = nextPos;
      setStoryIndex(nextStory);
      setTrackIndex(safeTIdx);
      setPositionMs(nextPos);
      await persistProgress(nextStory, safeTIdx, nextPos);
      return;
    }
    await finishPlaylist();
  }, [persistProgress, finishPlaylist, recordStoryCompleted, unloadSound, playlistIds]);

  const playCurrentTrackRef = useRef(null);

  const playCurrentTrack = useCallback(async (sessionId) => {
    const track = playlistRef.current[storyIndexRef.current]?.tracks?.[trackIndexRef.current];
    if (!track?.uri || sessionId !== playbackSessionRef.current) return;

    await stopActiveStorySound();
    await unloadSound();

    if (sessionId !== playbackSessionRef.current) return;

    const startMs = resumeStartMsRef.current || 0;
    resumeStartMsRef.current = 0;

    let sound;
    try {
      const created = await Audio.Sound.createAsync(
        { uri: track.uri },
        { shouldPlay: true, positionMillis: startMs },
      );
      sound = created.sound;
    } catch (_) {
      return;
    }

    if (sessionId !== playbackSessionRef.current) {
      try { await sound.unloadAsync(); } catch (_) { /* ignore */ }
      return;
    }

    const initialStatus = await sound.getStatusAsync();
    if (initialStatus.isLoaded
      && initialStatus.durationMillis
      && initialStatus.durationMillis < MIN_PLAYABLE_DURATION_MS) {
      await sound.unloadAsync();
      handleTrackEnd();
      return;
    }

    soundRef.current = sound;
    registerStorySound(sound);
    try {
      await sound.setVolumeAsync(volume);
    } catch (_) { /* ignore */ }
    setIsPlaying(true);
    const playingStory = playlistRef.current[storyIndexRef.current];
    if (playingStory?.packId) recordPackUsage(playingStory.packId);
    await persistProgress(
      storyIndexRef.current,
      trackIndexRef.current,
      initialStatus.positionMillis || startMs,
    );

    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded || sessionId !== playbackSessionRef.current) return;

      const pos = status.positionMillis || 0;
      positionMsRef.current = pos;

      totalRemainingRef.current = computeTotalRemaining(
        playlistRef.current,
        storyIndexRef.current,
        trackIndexRef.current,
        pos,
      );

      const storyRemaining = computeCurrentStoryRemaining(
        playlistRef.current,
        storyIndexRef.current,
        trackIndexRef.current,
        pos,
      );

      if (!warningShownRef.current && totalRemainingRef.current <= WARNING_SECONDS * 1000 && totalRemainingRef.current > 0) {
        warningShownRef.current = true;
        setWarningShown(true);
        setShowWarning(true);
      } else if (!warningShownRef.current && shouldWarnForStoryEnd(storyRemaining)) {
        warningShownRef.current = true;
        triggerWarning();
      }

      const now = Date.now();
      const shouldRefreshUi = status.didJustFinish
        || now - lastPlaybackUiRef.current >= 250;
      if (shouldRefreshUi) {
        lastPlaybackUiRef.current = now;
        if (!seekingRef.current) {
          setPositionMs(pos);
        }
        setDurationMs(status.durationMillis || 0);
        setIsPlaying(status.isPlaying);
      }

      if (status.didJustFinish) {
        handleTrackEnd();
      }
    });
  }, [unloadSound, volume, computeTotalRemaining, computeCurrentStoryRemaining, handleTrackEnd, shouldWarnForStoryEnd, triggerWarning, persistProgress]);

  const applyVolume = useCallback(async (nextVolume) => {
    setVolume(nextVolume);
    if (soundRef.current) {
      try {
        await soundRef.current.setVolumeAsync(nextVolume);
      } catch (_) { /* ignore */ }
    }
  }, []);

  playCurrentTrackRef.current = playCurrentTrack;

  useEffect(() => {
    if (!ready || !currentTrack?.uri) return undefined;

    const sessionId = playbackSessionRef.current + 1;
    playbackSessionRef.current = sessionId;

    playCurrentTrackRef.current?.(sessionId);
    activateKeepAwakeAsync('story-player');

    return () => {
      playbackSessionRef.current += 1;
      unloadSound();
      stopActiveStorySound();
      deactivateKeepAwake('story-player');
    };
  }, [ready, storyIndex, trackIndex, currentTrack?.uri, unloadSound]);

  useEffect(() => {
    if (!ready) return undefined;
    const timer = setInterval(async () => {
      if (!soundRef.current || seekingRef.current) return;
      try {
        const status = await soundRef.current.getStatusAsync();
        if (!status.isLoaded) return;
        const pos = status.positionMillis || 0;
        const { sIdx, tIdx, pos: lastPos } = lastSavedRef.current;
        if (sIdx !== storyIndexRef.current || tIdx !== trackIndexRef.current || Math.abs(pos - lastPos) > 2000) {
          await persistProgress(storyIndexRef.current, trackIndexRef.current, pos);
        }
      } catch (_) { /* ignore */ }
    }, PROGRESS_SAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [ready, persistProgress]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        saveCurrentProgress();
      }
    });
    return () => sub.remove();
  }, [saveCurrentProgress]);

  const seekTo = useCallback(async (nextMs) => {
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    const duration = status.durationMillis || durationMs || 0;
    const next = Math.max(0, Math.min(duration, Math.round(nextMs)));
    await soundRef.current.setPositionAsync(next);
    setPositionMs(next);
    await persistProgress(storyIndexRef.current, trackIndexRef.current, next);
  }, [durationMs, persistProgress]);

  const togglePlay = useCallback(async () => {
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync();
    if (status.isPlaying) {
      await soundRef.current.pauseAsync();
      await persistProgress(storyIndex, trackIndex, status.positionMillis || 0);
    } else {
      await soundRef.current.playAsync();
    }
  }, [storyIndex, trackIndex, persistProgress]);

  const seekBy = useCallback(async (deltaMs) => {
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    const duration = status.durationMillis || durationMs || 0;
    const next = Math.max(0, Math.min(duration, (status.positionMillis || 0) + deltaMs));
    await seekTo(next);
  }, [durationMs, seekTo]);

  const goToStory = useCallback(async (index) => {
    if (index < 0 || index >= playlistRef.current.length) return;
    if (index === storyIndexRef.current) return;

    let currentPos = lastSavedRef.current.pos || 0;
    if (soundRef.current) {
      try {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) currentPos = status.positionMillis || 0;
      } catch (_) { /* ignore */ }
    }
    const prevIdx = storyIndexRef.current;
    const prevTIdx = trackIndexRef.current;
    await persistProgress(prevIdx, prevTIdx, currentPos);

    const progress = await loadPlaybackProgress();
    const { trackIndex: tIdx, positionMs: posMs } = getStoryResumePosition(
      progress, playlistIds, index,
    );
    const tracks = playlistRef.current[index]?.tracks || [];
    const safeTIdx = Math.min(tIdx, Math.max(tracks.length - 1, 0));

    await stopPlayback();
    resumeStartMsRef.current = posMs;
    setStoryIndex(index);
    setTrackIndex(safeTIdx);
    setPositionMs(posMs);
    await persistProgress(index, safeTIdx, posMs);
  }, [stopPlayback, persistProgress, playlistIds]);

  const skipPreviousStory = useCallback(() => {
    goToStory(storyIndex - 1);
  }, [goToStory, storyIndex]);

  const skipNextStory = useCallback(() => {
    goToStory(storyIndex + 1);
  }, [goToStory, storyIndex]);

  const canGoPrevious = storyIndex > 0;
  const canGoNext = storyIndex < playlist.length - 1;

  useEffect(() => {
    if (!playlist.length) return;
    const maxIdx = playlist.length - 1;
    if (storyIndexRef.current > maxIdx) {
      setStoryIndex(maxIdx);
      setTrackIndex(0);
      setPositionMs(0);
    }
  }, [playlist.length]);

  useEffect(() => {
    if (!playlist.length || storyIndex < 0) return;
    const safeIndex = Math.min(storyIndex, playlist.length - 1);
    const timer = setTimeout(() => {
      try {
        playlistListRef.current?.scrollToIndex({
          index: safeIndex,
          animated: true,
          viewPosition: 0.5,
        });
      } catch (_) { /* list may not be measured yet */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [storyIndex, playlist.length]);

  const handleBack = useCallback(async () => {
    await saveCurrentProgress({ force: true });
    await stopPlayback();
    deactivateKeepAwake('story-player');
    safeGoBack(router, '/stories');
  }, [router, saveCurrentProgress, stopPlayback]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const handleBedtimeUnlocked = useCallback(() => {
    setShowBedtime(false);
    safeGoBack(router, '/stories');
  }, [router]);

  const bedtimeVisible = showBedtime || isLocked;
  const bedtimeMessage = isLocked && session?.mode === 'timer'
    ? t.parentalLockDetail
    : t.storiesGoodNightDetail(playlist.length);

  return (
    <View style={styles.container}>
      <AnimatedBackground />

      <View style={[styles.playerHeader, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={28} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {displayTitle}
        </Text>
        <Text style={styles.trackInfo}>
          {trackIndex + 1}/{currentStory?.tracks?.length || 0}
        </Text>
      </View>

      <View style={styles.playerBody}>
        <StoryCoverImage
          thumbnail={currentStory?.thumbnail}
          contentType={currentStory?.contentType}
          style={[styles.artwork, { width: artworkSize, height: artworkSize }]}
          placeholderStyle={styles.artworkPlaceholder}
        />
        {displaySubtitle ? (
          <Text style={styles.trackName} numberOfLines={1}>{displaySubtitle}</Text>
        ) : null}
        <Text style={styles.playlistInfo}>
          {t.storiesProgress(storyIndex + 1, playlist.length)}
        </Text>

        <Slider
          style={styles.progressSlider}
          minimumValue={0}
          maximumValue={Math.max(durationMs, 1)}
          value={Math.min(positionMs, Math.max(durationMs, 1))}
          onSlidingStart={() => { seekingRef.current = true; }}
          onValueChange={(value) => {
            if (seekingRef.current) setPositionMs(value);
          }}
          onSlidingComplete={(value) => {
            seekingRef.current = false;
            seekTo(value);
          }}
          minimumTrackTintColor={PINK}
          maximumTrackTintColor="rgba(255,105,180,0.25)"
          thumbTintColor={PINK}
          disabled={!durationMs}
        />
        <Text style={styles.timeText}>
          {formatTime(positionMs)} / {formatTime(durationMs)}
        </Text>

        <View style={playerControlStyles.controlsRow}>
          <PlayerControlBtn
            icon="play-skip-back"
            label={t.storiesPrevious}
            onPress={skipPreviousStory}
            disabled={!canGoPrevious}
            color={PINK}
          />
          <PlayerControlBtn
            icon="reload"
            label={t.storiesSkipBack}
            onPress={() => seekBy(-SKIP_MS)}
            flip
            color={PINK}
          />
          <PlayerControlBtn
            icon={isPlaying ? 'pause' : 'play'}
            onPress={togglePlay}
            primary
            color={PINK}
          />
          <PlayerControlBtn
            icon="reload"
            label={t.storiesSkipForward}
            onPress={() => seekBy(SKIP_MS)}
            color={PINK}
          />
          <PlayerControlBtn
            icon="play-skip-forward"
            label={t.storiesNext}
            onPress={skipNextStory}
            disabled={!canGoNext}
            color={PINK}
          />
        </View>

        <View style={styles.inlineFooter}>
          <View style={{ flex: 1 }} />
          <VolumeControls
            volume={volume}
            onVolumeChange={applyVolume}
            accentColor={PINK}
          />
        </View>
      </View>

      {playlist.length > 0 && (
        <View style={[
          styles.playlistPanel,
          { paddingBottom: Math.max(insets.bottom, 8), maxHeight: playlistPanelMaxHeight },
        ]}>
          <Text style={styles.playlistPanelTitle}>{t.storiesPlaylist}</Text>
          <FlatList
            ref={playlistListRef}
            data={playlist}
            keyExtractor={(item) => item.storyId}
            style={styles.playlistList}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                playlistListRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true,
                });
              }, 100);
            }}
            renderItem={({ item, index }) => {
              const isActive = index === storyIndex;
              const isPast = index < storyIndex;
              return (
                <TouchableOpacity
                  style={[styles.playlistItem, isActive && styles.playlistItemActive]}
                  onPress={() => goToStory(index)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.playlistIndex, isActive && styles.playlistIndexActive]}>
                    {isPast ? (
                      <Ionicons name="checkmark" size={16} color="#32CD32" />
                    ) : (
                      <Text style={[styles.playlistIndexText, isActive && styles.playlistIndexTextActive]}>
                        {index + 1}
                      </Text>
                    )}
                  </View>
                  <StoryCoverImage
                    thumbnail={item.thumbnail}
                    contentType={item.contentType}
                    style={styles.playlistThumb}
                    placeholderStyle={styles.playlistThumbPlaceholder}
                  />
                  <View style={styles.playlistItemText}>
                    <Text
                      style={[styles.playlistItemTitle, isActive && styles.playlistItemTitleActive]}
                      numberOfLines={2}
                    >
                      {item.title}
                    </Text>
                    {isActive && isPlaying && (
                      <Text style={styles.playlistItemStatus}>{t.storiesNowPlaying}</Text>
                    )}
                  </View>
                  {isActive && (
                    <Ionicons name="volume-medium" size={22} color="#FF69B4" />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      <WarningBanner
        visible={showWarning}
        title={t.storiesEndingSoon}
        message={t.storiesEndingSoonDetail(playlist.length)}
        onDismiss={() => setShowWarning(false)}
      />

      <Modal visible={bedtimeVisible} animationType="fade">
        <ParentalLockScreen
          title={t.storiesGoodNight}
          message={bedtimeMessage}
          hint={t.storiesBedtimeHint}
          onUnlocked={handleBedtimeUnlocked}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  playerHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingBottom: 12, backgroundColor: 'rgba(0,206,209,0.9)',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, fontSize: 18, fontFamily: 'Fredoka-SemiBold', color: 'white',
    textAlign: 'center', marginHorizontal: 8,
  },
  trackInfo: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontFamily: 'Fredoka-SemiBold' },
  playerBody: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  artwork: {
    borderRadius: 16,
    marginBottom: 12, borderWidth: 2, borderColor: PINK,
  },
  artworkPlaceholder: { backgroundColor: 'rgba(255,255,255,0.85)' },
  trackName: { fontSize: 16, fontFamily: 'Fredoka-SemiBold', color: '#5a3e5c', textAlign: 'center' },
  playlistInfo: { fontSize: 13, color: '#7a5a6a', marginTop: 4, fontFamily: 'Fredoka-SemiBold' },
  progressSlider: {
    width: '92%',
    height: 36,
    marginTop: 14,
  },
  timeText: { fontSize: 13, color: '#6a5060', marginTop: 6, fontFamily: 'Fredoka-SemiBold' },
  playlistPanel: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 12,
    minHeight: 140,
  },
  playlistPanelTitle: {
    fontFamily: 'Fredoka-SemiBold', fontSize: 16, color: '#333',
    marginBottom: 8, paddingHorizontal: 4,
  },
  playlistList: { flex: 1 },
  playlistItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 12, marginBottom: 4,
  },
  playlistThumb: {
    width: 44, height: 44, borderRadius: 8, backgroundColor: '#f0f0f0',
  },
  playlistThumbPlaceholder: { backgroundColor: '#f5f5f5' },
  playlistItemActive: { backgroundColor: '#FFF0F5' },
  playlistIndex: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center',
  },
  playlistIndexActive: { backgroundColor: '#FF69B4' },
  playlistIndexText: { fontFamily: 'Fredoka-SemiBold', fontSize: 13, color: '#666' },
  playlistIndexTextActive: { color: 'white' },
  playlistItemText: { flex: 1 },
  playlistItemTitle: { fontFamily: 'Fredoka-SemiBold', fontSize: 14, color: '#444' },
  playlistItemTitleActive: { color: '#FF69B4' },
  playlistItemStatus: { fontFamily: 'Fredoka-SemiBold', fontSize: 11, color: '#888', marginTop: 2 },
  bedtimeScreen: {
    flex: 1, backgroundColor: '#0d0d1a',
  },
  bedtimeScroll: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingTop: 32, paddingBottom: 16,
  },
  bedtimeEmoji: { fontSize: 64, marginBottom: 24 },
  bedtimeTitle: { fontSize: 32, fontFamily: 'Fredoka-SemiBold', color: '#FFD700', marginBottom: 16 },
  bedtimeText: { fontSize: 18, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 28 },
  bedtimeHint: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 16, textAlign: 'center' },
  bedtimeUnlockFooter: {
    paddingHorizontal: 32, paddingTop: 16, paddingBottom: 32,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', backgroundColor: '#0d0d1a',
  },
});
