import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, BackHandler, FlatList,
  Alert, useWindowDimensions, StatusBar, PanResponder, Animated, Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Brightness from 'expo-brightness';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WarningBanner from '../components/shared/WarningBanner';
import ParentalLockScreen from '../components/shared/ParentalLockScreen';
import AnimatedBackground from '../components/shared/AnimatedBackground';
import PlayerControlBtn, { playerControlStyles } from '../components/shared/PlayerControlBtn';
import VolumeControls from '../components/shared/VolumeControls';
import { useSounds } from '../../contexts/SoundContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useParentalControl } from '../../contexts/ParentalControlContext';
import { getStrings } from '../../constants/Strings';
import { getSharedVideos } from '../services/sharedMediaService';
import { getActiveSubtitle } from '../utils/subtitles';
import { safeGoBack } from '../utils/safeNavigation';

const WARNING_SECONDS = 30;
const SKIP_MS = 10_000;
const TEAL = '#00CED1';
const DEFAULT_VOLUME = 0.85;
const FS_CONTROLS_HIDE_MS = 4500;
const FS_CONTROLS_FADE_MS = 350;

export default function VideoPlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { beginStoryPlayback, endStoryPlayback } = useSounds();
  const beginStoryPlaybackRef = useRef(beginStoryPlayback);
  const endStoryPlaybackRef = useRef(endStoryPlayback);
  beginStoryPlaybackRef.current = beginStoryPlayback;
  endStoryPlaybackRef.current = endStoryPlayback;
  const { language } = useLanguage();
  const {
    shouldWarnForVideoEnd, recordVideoCompleted, triggerWarning, getVideosRemaining,
    isActive, session, isLocked, lockScreen, resetVideosPlayed,
  } = useParentalControl();
  const t = getStrings(language);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const playlistIds = useMemo(() => {
    try { return JSON.parse(params.playlist || '[]'); }
    catch { return []; }
  }, [params.playlist]);

  const [playlist, setPlaylist] = useState([]);
  const [videoIndex, setVideoIndex] = useState(
    Math.max(0, parseInt(String(params.startIndex || '0'), 10) || 0),
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsControlsVisible, setFsControlsVisible] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [showBedtime, setShowBedtime] = useState(false);
  const [warningShown, setWarningShown] = useState(false);
  const [ready, setReady] = useState(false);

  const videoRef = useRef(null);
  const playlistRef = useRef([]);
  const videoIndexRef = useRef(0);
  const warningShownRef = useRef(false);
  const playbackSessionRef = useRef(0);
  const seekingRef = useRef(false);
  const fsControlsTimerRef = useRef(null);
  const fsControlsOpacity = useRef(new Animated.Value(0)).current;
  const lastPlaybackUiRef = useRef(0);
  const volumeStartRef = useRef(DEFAULT_VOLUME);
  const fsGestureMovedRef = useRef(false);
  const parentalRef = useRef({ isActive, session, getVideosRemaining });
  parentalRef.current = { isActive, session, getVideosRemaining };
  const playlistLoadKeyRef = useRef(null);

  const clampVolume = useCallback((value) => Math.min(1, Math.max(0, value)), []);

  const applyVolume = useCallback(async (nextVolume) => {
    const clamped = clampVolume(nextVolume);
    setVolume(clamped);
    if (videoRef.current) {
      try {
        await videoRef.current.setVolumeAsync(clamped);
      } catch (_) { /* ignore */ }
    }
  }, [clampVolume]);

  const hideFsControls = useCallback(() => {
    Animated.timing(fsControlsOpacity, {
      toValue: 0,
      duration: FS_CONTROLS_FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setFsControlsVisible(false);
    });
  }, [fsControlsOpacity]);

  const showFsControls = useCallback((autoHide = true) => {
    if (fsControlsTimerRef.current) clearTimeout(fsControlsTimerRef.current);
    setFsControlsVisible(true);
    Animated.timing(fsControlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    if (autoHide) {
      fsControlsTimerRef.current = setTimeout(hideFsControls, FS_CONTROLS_HIDE_MS);
    }
  }, [fsControlsOpacity, hideFsControls]);

  const fullscreenPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !fsControlsVisible,
    onMoveShouldSetPanResponder: (_, gestureState) => (
      !fsControlsVisible
      && (Math.abs(gestureState.dy) > 8 || Math.abs(gestureState.dx) > 8)
    ),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      fsGestureMovedRef.current = false;
      volumeStartRef.current = volume;
    },
    onPanResponderMove: (_, gestureState) => {
      if (Math.abs(gestureState.dy) > 12) {
        fsGestureMovedRef.current = true;
        applyVolume(volumeStartRef.current + (-gestureState.dy * 0.004));
        showFsControls(true);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (!fsGestureMovedRef.current
        && Math.abs(gestureState.dx) < 12
        && Math.abs(gestureState.dy) < 12) {
        if (fsControlsVisible) {
          hideFsControls();
        } else {
          showFsControls(true);
        }
      }
    },
  }), [applyVolume, showFsControls, hideFsControls, fsControlsVisible, volume]);

  const currentVideo = playlist[videoIndex];
  const activeSubtitle = showSubtitles
    ? getActiveSubtitle(currentVideo?.subtitleCues, positionMs)?.text
    : null;

  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { videoIndexRef.current = videoIndex; }, [videoIndex]);
  useEffect(() => { warningShownRef.current = warningShown; }, [warningShown]);

  const loadPlaylist = useCallback(async () => {
    let ids = [...playlistIds];
    const { isActive: parentalActive, session: parentalSession, getVideosRemaining: getRemaining } = parentalRef.current;
    if (params.parental === '1' && parentalActive && parentalSession?.mode === 'stories') {
      const limit = getRemaining() ?? parentalSession.videoValue ?? parentalSession.value;
      ids = ids.slice(0, Math.max(limit, 0));
    }

    const allVideos = await getSharedVideos({ force: false });
    const byId = new Map(allVideos.map((video) => [video.videoId, video]));
    const items = ids.map((id) => byId.get(id)).filter(Boolean);
    setPlaylist(items);

    if (!items.length) {
      Alert.alert(t.error, t.videosNoDownloaded, [
        { text: 'OK', onPress: () => safeGoBack(router, '/videos') },
      ]);
      setReady(true);
      return;
    }

    if (params.fresh === '1') {
      await resetVideosPlayed();
    }

    const start = Math.min(
      parseInt(String(params.startIndex || '0'), 10) || 0,
      Math.max(items.length - 1, 0),
    );
    setVideoIndex(start);
    setReady(true);
  }, [playlistIds, params.parental, params.fresh, params.startIndex, resetVideosPlayed, router, t]);

  useEffect(() => {
    const loadKey = [
      params.playlist,
      params.fresh,
      params.startIndex,
      params.parental,
    ].join('|');
    if (playlistLoadKeyRef.current === loadKey) return;
    playlistLoadKeyRef.current = loadKey;
    setReady(false);
    loadPlaylist();
  }, [loadPlaylist, params.playlist, params.fresh, params.startIndex, params.parental]);

  useEffect(() => {
    beginStoryPlaybackRef.current();
    return () => {
      endStoryPlaybackRef.current();
    };
  }, []);

  const finishPlaylist = useCallback(async () => {
    setIsPlaying(false);
    try {
      await videoRef.current?.stopAsync();
      await videoRef.current?.unloadAsync();
    } catch (_) { /* ignore */ }
    deactivateKeepAwake('video-player');

    const videosLeft = getVideosRemaining();
    if (params.parental === '1' && isActive && session?.mode === 'stories' && videosLeft > 0) {
      router.replace('/videos');
      return;
    }

    try {
      await Brightness.setBrightnessAsync(0.01);
    } catch (_) { /* ignore */ }

    if (isActive) await lockScreen();
    setShowBedtime(true);
  }, [params.parental, isActive, session, getVideosRemaining, router, lockScreen]);

  const handleVideoEnd = useCallback(async () => {
    const locked = await recordVideoCompleted();
    if (locked) {
      setIsPlaying(false);
      deactivateKeepAwake('video-player');
      setShowBedtime(true);
      return;
    }

    const nextIndex = videoIndexRef.current + 1;
    if (nextIndex < playlistRef.current.length) {
      setVideoIndex(nextIndex);
      setPositionMs(0);
      return;
    }
    await finishPlaylist();
  }, [recordVideoCompleted, finishPlaylist]);

  const onPlaybackStatusUpdate = useCallback((status) => {
    if (!status.isLoaded) return;

    const pos = status.positionMillis || 0;
    const dur = status.durationMillis || 0;
    const remaining = Math.max(0, dur - pos);

    if (!warningShownRef.current && remaining <= WARNING_SECONDS * 1000 && remaining > 0) {
      warningShownRef.current = true;
      setWarningShown(true);
      setShowWarning(true);
    } else if (!warningShownRef.current && shouldWarnForVideoEnd(remaining)) {
      warningShownRef.current = true;
      triggerWarning();
    }

    const now = Date.now();
    const shouldRefreshUi = status.didJustFinish || now - lastPlaybackUiRef.current >= 250;
    if (shouldRefreshUi) {
      lastPlaybackUiRef.current = now;
      if (!seekingRef.current) setPositionMs(pos);
      setDurationMs(dur);
      setIsPlaying(status.isPlaying);
    }

    if (status.didJustFinish) {
      handleVideoEnd();
    }
  }, [shouldWarnForVideoEnd, triggerWarning, handleVideoEnd]);

  useEffect(() => {
    if (!ready || !currentVideo?.uri) return undefined;

    const sessionId = playbackSessionRef.current + 1;
    playbackSessionRef.current = sessionId;
    activateKeepAwakeAsync('video-player');

    (async () => {
      try {
        await videoRef.current?.unloadAsync();
      } catch (_) { /* ignore */ }

      if (sessionId !== playbackSessionRef.current) return;

      try {
        await videoRef.current?.loadAsync(
          { uri: currentVideo.uri },
          { shouldPlay: true, volume },
          false,
        );
        await videoRef.current?.setVolumeAsync(volume);
        setIsPlaying(true);
      } catch (err) {
        if (sessionId !== playbackSessionRef.current) return;
        Alert.alert(
          t.error,
          'Impossible de lire cette vidéo.',
          [
            { text: t.storiesNext, onPress: () => { handleVideoEnd(); } },
            { text: 'Retour', style: 'cancel', onPress: () => safeGoBack(router, '/videos') },
          ],
        );
      }
    })();

    return () => {
      playbackSessionRef.current += 1;
      deactivateKeepAwake('video-player');
    };
  }, [ready, videoIndex, currentVideo?.uri, volume, handleVideoEnd, router, t]);

  const seekTo = useCallback(async (nextMs) => {
    if (!videoRef.current) return;
    const status = await videoRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    const duration = status.durationMillis || durationMs || 0;
    const next = Math.max(0, Math.min(duration, Math.round(nextMs)));
    await videoRef.current.setPositionAsync(next);
    setPositionMs(next);
  }, [durationMs]);

  const togglePlay = useCallback(async () => {
    if (!videoRef.current) return;
    const status = await videoRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) await videoRef.current.pauseAsync();
    else await videoRef.current.playAsync();
  }, []);

  const seekBy = useCallback(async (deltaMs) => {
    if (!videoRef.current) return;
    const status = await videoRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    const duration = status.durationMillis || durationMs || 0;
    const next = Math.max(0, Math.min(duration, (status.positionMillis || 0) + deltaMs));
    await seekTo(next);
  }, [durationMs, seekTo]);

  const goToVideo = useCallback(async (index) => {
    if (index < 0 || index >= playlistRef.current.length) return;
    if (index === videoIndexRef.current) return;
    playbackSessionRef.current += 1;
    setVideoIndex(index);
    setPositionMs(0);
  }, []);

  const skipPrevious = useCallback(() => goToVideo(videoIndex - 1), [goToVideo, videoIndex]);
  const skipNext = useCallback(() => goToVideo(videoIndex + 1), [goToVideo, videoIndex]);

  const enterFullscreen = useCallback(() => {
    setIsFullscreen(true);
    setFsControlsVisible(false);
    fsControlsOpacity.setValue(0);
    if (fsControlsTimerRef.current) clearTimeout(fsControlsTimerRef.current);
  }, [fsControlsOpacity]);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setFsControlsVisible(false);
    if (fsControlsTimerRef.current) clearTimeout(fsControlsTimerRef.current);
    fsControlsOpacity.setValue(0);
  }, [fsControlsOpacity]);

  const handleBack = useCallback(async () => {
    playbackSessionRef.current += 1;
    try {
      await videoRef.current?.stopAsync();
      await videoRef.current?.unloadAsync();
    } catch (_) { /* ignore */ }
    deactivateKeepAwake('video-player');
    exitFullscreen();
    safeGoBack(router, '/videos');
  }, [router, exitFullscreen]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isFullscreen) {
        exitFullscreen();
        return true;
      }
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack, isFullscreen, exitFullscreen]);

  useEffect(() => () => {
    if (fsControlsTimerRef.current) clearTimeout(fsControlsTimerRef.current);
  }, []);

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const handleBedtimeUnlocked = useCallback(() => {
    setShowBedtime(false);
    safeGoBack(router, '/videos');
  }, [router]);

  const canGoPrevious = videoIndex > 0;
  const canGoNext = videoIndex < playlist.length - 1;
  const bedtimeVisible = showBedtime || isLocked;
  const videoWidth = isFullscreen ? width : Math.min(width * 0.92, 560);
  const videoHeight = isFullscreen ? height : videoWidth * 9 / 16;

  const renderPlaybackControls = (accentColor = TEAL, overlay = false) => {
    const onInteract = overlay ? () => showFsControls(true) : undefined;
    const btnVariant = overlay ? 'overlay' : 'default';
    return (
    <>
      <Slider
        style={[styles.progressSlider, overlay && styles.progressSliderOverlay]}
        minimumValue={0}
        maximumValue={Math.max(durationMs, 1)}
        value={Math.min(positionMs, Math.max(durationMs, 1))}
        onSlidingStart={() => {
          seekingRef.current = true;
          if (overlay) showFsControls(false);
        }}
        onValueChange={(value) => {
          if (seekingRef.current) setPositionMs(value);
        }}
        onSlidingComplete={(value) => {
          seekingRef.current = false;
          seekTo(value);
          if (overlay) showFsControls(true);
        }}
        minimumTrackTintColor={overlay ? 'white' : accentColor}
        maximumTrackTintColor={overlay ? 'rgba(255,255,255,0.25)' : 'rgba(0,206,209,0.25)'}
        thumbTintColor={overlay ? 'white' : accentColor}
        disabled={!durationMs}
      />
      <Text style={[styles.timeText, overlay && styles.timeTextOverlay]}>
        {formatTime(positionMs)} / {formatTime(durationMs)}
      </Text>

      <View style={[playerControlStyles.controlsRow, overlay && styles.fsControlsRow]}>
        <PlayerControlBtn
          icon="play-skip-back"
          label={t.storiesPrevious}
          onPress={() => { onInteract?.(); skipPrevious(); }}
          disabled={!canGoPrevious}
          color={accentColor}
          variant={btnVariant}
        />
        <PlayerControlBtn
          icon="reload"
          label={t.storiesSkipBack}
          onPress={() => { onInteract?.(); seekBy(-SKIP_MS); }}
          flip
          color={accentColor}
          variant={btnVariant}
        />
        <PlayerControlBtn
          icon={isPlaying ? 'pause' : 'play'}
          onPress={() => { onInteract?.(); togglePlay(); }}
          primary
          color={accentColor}
          variant={btnVariant}
        />
        <PlayerControlBtn
          icon="reload"
          label={t.storiesSkipForward}
          onPress={() => { onInteract?.(); seekBy(SKIP_MS); }}
          color={accentColor}
          variant={btnVariant}
        />
        <PlayerControlBtn
          icon="play-skip-forward"
          label={t.storiesNext}
          onPress={() => { onInteract?.(); skipNext(); }}
          disabled={!canGoNext}
          color={accentColor}
          variant={btnVariant}
        />
      </View>
    </>
    );
  };

  const renderInlineControls = () => (
    <>
      {renderPlaybackControls(TEAL, false)}
      <View style={styles.inlineFooter}>
        <View style={styles.secondaryControls}>
          <TouchableOpacity
            style={[styles.secondaryBtn, showSubtitles && styles.secondaryBtnActive]}
            onPress={() => setShowSubtitles((prev) => !prev)}
            disabled={!currentVideo?.hasSubtitles}
          >
            <Ionicons name="text" size={18} color={currentVideo?.hasSubtitles ? TEAL : '#aaa'} />
            <Text style={styles.secondaryBtnText}>
              {showSubtitles ? t.videosSubtitles : t.videosSubtitlesOff}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={enterFullscreen}>
            <Ionicons name="expand" size={18} color={TEAL} />
            <Text style={styles.secondaryBtnText}>{t.videosFullscreen}</Text>
          </TouchableOpacity>
        </View>
        <VolumeControls
          volume={volume}
          onVolumeChange={applyVolume}
          accentColor={TEAL}
        />
      </View>
    </>
  );

  return (
    <View style={isFullscreen ? styles.fullscreenContainer : styles.container}>
      <StatusBar hidden={isFullscreen} />
      {!isFullscreen && <AnimatedBackground />}

      {!isFullscreen && (
        <View style={[styles.playerHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={28} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentVideo?.title || t.videosGame}
          </Text>
          <Text style={styles.trackInfo}>
            {videoIndex + 1}/{playlist.length || 0}
          </Text>
        </View>
      )}

      <View style={isFullscreen ? StyleSheet.absoluteFill : styles.videoSection}>
        <View
          style={
            isFullscreen
              ? StyleSheet.absoluteFill
              : [styles.videoFrame, { width: videoWidth, height: videoHeight }]
          }
        >
          <Video
            ref={videoRef}
            style={isFullscreen ? StyleSheet.absoluteFill : styles.video}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls={false}
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          />
          {activeSubtitle ? (
            <View
              style={[
                isFullscreen ? styles.subtitleOverlayFullscreen : styles.subtitleOverlay,
                isFullscreen && { bottom: Math.max(insets.bottom, 24) + 120 },
              ]}
            >
              <Text style={isFullscreen ? styles.subtitleTextFullscreen : styles.subtitleText}>
                {activeSubtitle}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {isFullscreen ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View
            style={StyleSheet.absoluteFill}
            {...fullscreenPanResponder.panHandlers}
            pointerEvents={fsControlsVisible ? 'none' : 'auto'}
          />
          <Animated.View
            style={[styles.fsControlsLayer, { opacity: fsControlsOpacity }]}
            pointerEvents={fsControlsVisible ? 'box-none' : 'none'}
          >
            <View style={[styles.fsTopBar, { paddingTop: insets.top + 8 }]} pointerEvents="auto">
              <TouchableOpacity style={styles.fsIconBtn} onPress={exitFullscreen} activeOpacity={0.8}>
                <Ionicons name="contract" size={22} color="white" />
              </TouchableOpacity>
              <Text style={styles.fsTitle} numberOfLines={1}>
                {currentVideo?.title || t.videosGame}
              </Text>
              <VolumeControls
                volume={volume}
                onVolumeChange={(v) => { applyVolume(v); showFsControls(true); }}
                accentColor="white"
                iconColor="white"
                sliderTrackColor="white"
                variant="overlay"
              />
            </View>

            <Pressable
              style={styles.fsDismissArea}
              onPress={hideFsControls}
              pointerEvents={fsControlsVisible ? 'auto' : 'none'}
            />

            <View style={[styles.fsBottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]} pointerEvents="auto">
              {renderPlaybackControls(TEAL, true)}
              <View style={styles.fsSecondaryRow}>
                <TouchableOpacity
                  style={[styles.fsSecondaryBtn, showSubtitles && styles.fsSecondaryBtnActive]}
                  onPress={() => {
                    setShowSubtitles((prev) => !prev);
                    showFsControls(true);
                  }}
                  disabled={!currentVideo?.hasSubtitles}
                >
                  <Ionicons
                    name="text"
                    size={18}
                    color={currentVideo?.hasSubtitles ? 'white' : 'rgba(255,255,255,0.35)'}
                  />
                  <Text style={styles.fsSecondaryBtnText}>
                    {showSubtitles ? t.videosSubtitles : t.videosSubtitlesOff}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </View>
      ) : (
        <>
          <View style={styles.playerBody}>
            <Text style={styles.playlistInfo}>
              {t.videosProgress(videoIndex + 1, playlist.length)}
            </Text>
            {renderInlineControls()}
          </View>

          {playlist.length > 0 && (
            <View style={[styles.playlistPanel, { paddingBottom: Math.max(insets.bottom, 8) }]}>
              <Text style={styles.playlistPanelTitle}>{t.videosPlaylist}</Text>
              <FlatList
                data={playlist}
                keyExtractor={(item) => item.videoId}
                style={styles.playlistList}
                renderItem={({ item, index }) => {
                  const active = index === videoIndex;
                  const isPast = index < videoIndex;
                  return (
                    <TouchableOpacity
                      style={[styles.playlistItem, active && styles.playlistItemActive]}
                      onPress={() => goToVideo(index)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.playlistIndex, active && styles.playlistIndexActive]}>
                        {isPast ? (
                          <Ionicons name="checkmark" size={16} color="#32CD32" />
                        ) : (
                          <Text style={[styles.playlistIndexText, active && styles.playlistIndexTextActive]}>
                            {index + 1}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="videocam" size={22} color={active ? TEAL : '#888'} />
                      <View style={styles.playlistItemText}>
                        <Text
                          style={[styles.playlistItemTitle, active && styles.playlistItemTitleActive]}
                          numberOfLines={2}
                        >
                          {item.title}
                        </Text>
                        {active && isPlaying && (
                          <Text style={styles.playlistItemStatus}>{t.storiesNowPlaying}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          )}
        </>
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
          message={t.storiesGoodNightDetail(playlist.length)}
          hint={t.storiesBedtimeHint}
          onUnlocked={handleBedtimeUnlocked}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  fullscreenContainer: { flex: 1, backgroundColor: '#000' },
  fsControlsLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  fsDismissArea: {
    flex: 1,
  },
  fsTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: 'rgba(30,30,30,0.72)',
    gap: 10,
  },
  fsIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Fredoka-SemiBold',
    color: 'white',
    textAlign: 'center',
  },
  fsBottomBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: 'rgba(20,20,20,0.82)',
    alignItems: 'stretch',
  },
  fsSecondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  fsSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  fsSecondaryBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  fsSecondaryBtnText: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 12,
    color: 'white',
  },
  progressSliderOverlay: { marginTop: 0, width: '100%' },
  timeTextOverlay: { color: 'rgba(255,255,255,0.9)', alignSelf: 'flex-start' },
  fsControlsRow: { marginTop: 10 },
  inlineFooter: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
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
  videoSection: { width: '100%', alignItems: 'center', paddingTop: 8 },
  videoFrame: {
    borderRadius: 14, overflow: 'hidden', backgroundColor: '#000',
    borderWidth: 2, borderColor: TEAL,
  },
  video: { width: '100%', height: '100%' },
  subtitleOverlay: {
    position: 'absolute', left: 8, right: 8, bottom: 10,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8, padding: 8,
  },
  subtitleOverlayFullscreen: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8, padding: 10,
  },
  subtitleText: {
    color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 14, textAlign: 'center',
  },
  subtitleTextFullscreen: {
    color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 16, textAlign: 'center',
  },
  playlistInfo: { fontSize: 13, color: '#7a5a6a', marginTop: 8, fontFamily: 'Fredoka-SemiBold' },
  progressSlider: { width: '92%', height: 36, marginTop: 14 },
  timeText: { fontSize: 13, color: '#6a5060', marginTop: 6, fontFamily: 'Fredoka-SemiBold' },
  secondaryControls: {
    flexDirection: 'row', gap: 10, flexWrap: 'wrap', flex: 1,
  },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(0,206,209,0.35)',
  },
  secondaryBtnActive: { backgroundColor: '#e8fffe' },
  secondaryBtnText: { fontFamily: 'Fredoka-SemiBold', fontSize: 12, color: '#333' },
  playlistPanel: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 12,
    minHeight: 120,
    maxHeight: '34%',
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
  playlistItemActive: { backgroundColor: '#E8FFFE' },
  playlistIndex: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center',
  },
  playlistIndexActive: { backgroundColor: TEAL },
  playlistIndexText: { fontFamily: 'Fredoka-SemiBold', fontSize: 13, color: '#666' },
  playlistIndexTextActive: { color: 'white' },
  playlistItemText: { flex: 1 },
  playlistItemTitle: { fontFamily: 'Fredoka-SemiBold', fontSize: 14, color: '#444' },
  playlistItemTitleActive: { color: TEAL },
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
