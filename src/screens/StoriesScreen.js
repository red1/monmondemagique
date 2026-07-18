import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, useWindowDimensions, Alert, ActivityIndicator, ScrollView, Modal, Pressable, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Header from '../components/shared/Header';
import AnimatedBackground from '../components/shared/AnimatedBackground';
import StoryGridCard from '../components/stories/StoryGridCard';
import PlaylistQueueBar from '../components/stories/PlaylistQueueBar';
import ResumePlaylistModal from '../components/stories/ResumePlaylistModal';
import SavePlaylistModal from '../components/stories/SavePlaylistModal';
import SavedPlaylistsModal from '../components/stories/SavedPlaylistsModal';
import { useSounds } from '../../contexts/SoundContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useParentalControl } from '../../contexts/ParentalControlContext';
import { getStrings } from '../../constants/Strings';
import {
  getSources, filterPlayableStories, getPlayableStories,
  getDownloadedStories, getValidPlaybackProgress, clearPlaybackProgress,
  getDownloadedStoryIds,
  rebuildLibraryFromDisk, debugLogLibraryFileSizes,
  isActiveDownloadInProgress,
  formatStoryDurationLabel, refreshSharedDownloads,
  getSavedPlaylists, saveNamedPlaylist, deleteSavedPlaylist, clearSavedPlaylistProgress,
  getPackUsageCounts, playlistsMatch, getStoryDisplayThumbnail, getPackById,
  repairStoryThumbnailsForLibrary, enrichStoriesLibrary, saveStoryExtraInfo,
  isStoriesLibraryFresh,
} from '../services/storyService';
import { useDebouncedValue } from '../utils/useDebouncedValue';
import { stopActiveStorySound } from '../utils/storyAudio';
import { isSharedMediaCacheFresh } from '../services/sharedMediaService';
import { useAppBootstrap } from '../../contexts/AppBootstrapContext';
import { getStoriesGridConfig, getStoryCardMetrics } from '../utils/storiesGridConfig';

const DURATION_MAX_CHIPS = [5, 10, 20];

const StoriesScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const { isActive, session, getStoriesRemaining, resetStoriesPlayed, verifyParentPin } = useParentalControl();
  const t = getStrings(language);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const gridConfig = getStoriesGridConfig(width);
  const { numColumns, pageRows } = gridConfig;
  const { cardWidth, gap: gridGap, thumbnailHeight } = getStoryCardMetrics(width, numColumns);
  const pageSize = pageRows * numColumns;

  const {
    bootstrapped,
    libraryMeta: downloadedMeta,
    playableStories,
    packUsageCounts,
    filterOptions,
    refreshLibrary,
  } = useAppBootstrap();
  const loading = !bootstrapped;

  const [nameFilter, setNameFilter] = useState('');
  const debouncedNameFilter = useDebouncedValue(nameFilter);
  const [sourceFilter, setSourceFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [artistFilter, setArtistFilter] = useState('');
  const debouncedArtistFilter = useDebouncedValue(artistFilter);
  const [genreFilter, setGenreFilter] = useState('');
  const [albumFilter, setAlbumFilter] = useState('');
  const [packFilter, setPackFilter] = useState('');
  const [showPackPicker, setShowPackPicker] = useState(false);
  const [showGenrePicker, setShowGenrePicker] = useState(false);
  const [durationFilter, setDurationFilter] = useState('min30');
  const [queue, setQueue] = useState([]);
  const [savedProgress, setSavedProgress] = useState(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showSavePlaylistModal, setShowSavePlaylistModal] = useState(false);
  const [showSavedPlaylistsModal, setShowSavedPlaylistsModal] = useState(false);
  const [savedPlaylists, setSavedPlaylists] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [extraInfoStory, setExtraInfoStory] = useState(null);
  const [extraInfoDraft, setExtraInfoDraft] = useState('');
  const [showResetQuotaModal, setShowResetQuotaModal] = useState(false);
  const [resetPin, setResetPin] = useState('');
  const [resettingQuota, setResettingQuota] = useState(false);

  const thumbnailRepairDoneRef = useRef(false);
  const launchingPlayerRef = useRef(false);
  const pendingLibraryRefreshRef = useRef(false);
  const autoLaunchDoneRef = useRef(false);
  const queueRef = useRef(queue);
  const listRef = useRef(null);
  queueRef.current = queue;

  const sources = getSources();

  const sourceNameById = useMemo(
    () => new Map(sources.map((s) => [s.id, s.name])),
    [sources],
  );

  const packThumbnailById = useMemo(() => {
    const map = new Map();
    playableStories.forEach((story) => {
      if (!story.packId || map.has(story.packId)) return;
      map.set(story.packId, getStoryDisplayThumbnail(story) || getPackById(story.packId)?.thumbnail || null);
    });
    return map;
  }, [playableStories]);

  const refreshStoriesLight = useCallback(async () => {
    if (isActiveDownloadInProgress()) {
      pendingLibraryRefreshRef.current = true;
      try {
        await refreshLibrary({ soft: true });
      } catch (_) { /* keep current list */ }
      return;
    }
    pendingLibraryRefreshRef.current = false;
    try {
      await refreshLibrary({ soft: isStoriesLibraryFresh() });
    } catch (_) {
      /* keep current list */
    }
  }, [refreshLibrary]);

  useEffect(() => {
    if (!pendingLibraryRefreshRef.current) return undefined;
    const timer = setInterval(() => {
      if (!isActiveDownloadInProgress()) {
        refreshStoriesLight();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [refreshStoriesLight]);

  const refreshStoriesFull = useCallback(async () => {
    setSyncing(true);
    try {
      await getPlayableStories({ syncOnLoad: true });
      const [meta, progress] = await Promise.all([
        getDownloadedStories(),
        getValidPlaybackProgress(),
      ]);
      await refreshLibrary();
      setSavedProgress(progress);
      setQueue((prev) => prev.filter((id) => meta[id]));
      await debugLogLibraryFileSizes();
    } catch (_) {
      await refreshStoriesLight();
    } finally {
      setSyncing(false);
    }
  }, [refreshStoriesLight, refreshLibrary]);

  useEffect(() => {
    getValidPlaybackProgress().then(setSavedProgress);
  }, []);

  useEffect(() => {
    // Only prune queue when we have a non-empty library snapshot.
    // An empty intermediate refresh must not wipe the selection (that caused
    // the next tap to auto-launch a story).
    const ids = Object.keys(downloadedMeta || {});
    if (!ids.length) return;
    setQueue((prev) => {
      const next = prev.filter((id) => downloadedMeta[id]);
      return next.length === prev.length ? prev : next;
    });
  }, [downloadedMeta]);

  useFocusEffect(useCallback(() => {
    launchingPlayerRef.current = false;
    getValidPlaybackProgress().then(setSavedProgress);
    getSavedPlaylists().then(setSavedPlaylists);
    // Soft refresh: keep in-memory library — do not re-scan disk on every visit.
    if (!isStoriesLibraryFresh() || !playableStories.length) {
      refreshLibrary({ soft: false }).catch(() => {});
    } else {
      refreshLibrary({ soft: true }).catch(() => {});
    }
    if (!isActiveDownloadInProgress() && !isSharedMediaCacheFresh()) {
      refreshSharedDownloads().catch(() => {});
      if (!thumbnailRepairDoneRef.current) {
        thumbnailRepairDoneRef.current = true;
        repairStoryThumbnailsForLibrary({ limit: 40 }).then(({ changed }) => {
          if (changed) refreshStoriesLight();
        });
      }
    }
  }, [refreshStoriesLight, refreshLibrary, playableStories.length]));

  const refreshSavedPlaylists = useCallback(async () => {
    setSavedPlaylists(await getSavedPlaylists());
  }, []);

  const parentalStoryLimit = isActive && session?.mode === 'stories'
    ? getStoriesRemaining()
    : null;


  const selectedPackLabel = useMemo(() => {
    if (!packFilter) return t.storiesAllPacks;
    return filterOptions.packs.find((p) => p.packId === packFilter)?.title || packFilter;
  }, [packFilter, filterOptions.packs, t.storiesAllPacks]);

  const launchPlayer = useCallback(async (storyIds, {
    resume = false, fresh = false, startStoryIndex = null, savedPlaylistId = null,
  } = {}) => {
    if (!storyIds.length) {
      Alert.alert(t.storiesGame, t.storiesNoDownloaded);
      return;
    }
    if (launchingPlayerRef.current) return;
    launchingPlayerRef.current = true;
    try {
      if (fresh) {
        await resetStoriesPlayed();
      }
      getDownloadedStories().catch(() => {});
      stopActiveStorySound().catch(() => {});
      playSound('pop');
      const navParams = {
        playlist: JSON.stringify(storyIds),
        parental: '1',
      };
      if (resume) navParams.resume = '1';
      if (fresh) navParams.fresh = '1';
      if (startStoryIndex != null) navParams.startStoryIndex = String(startStoryIndex);
      if (savedPlaylistId) navParams.savedPlaylistId = savedPlaylistId;
      router.replace({ pathname: '/story_player', params: navParams });
    } finally {
      setTimeout(() => { launchingPlayerRef.current = false; }, 1500);
    }
  }, [router, playSound, t, resetStoriesPlayed]);

  useEffect(() => {
    if (autoLaunchDoneRef.current) return;
    if (params.autoLaunch !== '1' || !isActive || session?.mode !== 'stories') return;
    autoLaunchDoneRef.current = true;
    (async () => {
      const downloadedIds = await getDownloadedStoryIds();
      const limit = getStoriesRemaining() ?? session.value;
      const playlist = downloadedIds.slice(0, limit);
      if (playlist.length > 0) launchPlayer(playlist);
      else Alert.alert(t.storiesGame, t.parentalNeedDownload);
    })();
  }, [params.autoLaunch, isActive, session, getStoriesRemaining, launchPlayer, t]);

  const filteredStories = useMemo(() => {
    const opts = {
      name: debouncedNameFilter,
      source: sourceFilter,
      contentType: typeFilter,
      artist: debouncedArtistFilter,
      album: albumFilter,
      genre: genreFilter,
      packId: packFilter,
      stories: playableStories,
    };
    if (durationFilter === 'min30') {
      opts.minDurationSeconds = 30;
      opts.includeUnknownDuration = true;
    } else if (durationFilter === 'under30') {
      opts.maxDurationSeconds = 30;
    } else if (durationFilter === 'all') {
      // no duration constraint
    } else if (durationFilter.startsWith('under')) {
      opts.maxDurationMinutes = parseInt(durationFilter.replace('under', ''), 10);
    }
    return filterPlayableStories(opts);
  }, [debouncedNameFilter, sourceFilter, typeFilter, debouncedArtistFilter, albumFilter, genreFilter, packFilter, durationFilter, playableStories]);

  useEffect(() => {
    setCurrentPage(1);
  }, [nameFilter, sourceFilter, typeFilter, artistFilter, genreFilter, albumFilter, packFilter, durationFilter, pageSize, playableStories.length]);

  const totalPages = Math.max(1, Math.ceil(filteredStories.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedStories = useMemo(
    () => filteredStories.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredStories, currentPage, pageSize],
  );

  const hasMoreStories = currentPage < totalPages;

  const visiblePageNumbers = useMemo(() => {
    const maxButtons = 5;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    const pages = [];
    for (let i = start; i <= end; i += 1) pages.push(i);
    return pages;
  }, [currentPage, totalPages]);

  const goToPage = useCallback((page) => {
    const nextPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(nextPage);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [totalPages]);

  const loadMoreStories = useCallback(() => {
    if (!hasMoreStories || loadingMore) return;
    setLoadingMore(true);
    requestAnimationFrame(() => {
      setCurrentPage((prev) => Math.min(prev + 1, totalPages));
      setLoadingMore(false);
    });
  }, [hasMoreStories, loadingMore, totalPages]);

  const hasStories = playableStories.some((story) => story.contentType === 'story');
  const hasSongs = playableStories.some((story) => story.contentType === 'song');
  const queueIndexMap = useMemo(() => {
    const map = new Map();
    queue.forEach((id, idx) => map.set(id, idx));
    return map;
  }, [queue]);

  const playQueue = useMemo(() => {
    if (!parentalStoryLimit) return queue;
    return queue.slice(0, parentalStoryLimit);
  }, [queue, parentalStoryLimit]);

  const toggleSelect = useCallback((id) => {
    playSound('pop');
    setQueue((prev) => {
      const idx = prev.indexOf(id);
      if (idx >= 0) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  }, [playSound]);

  const playStoryDirectly = useCallback((storyId) => {
    if (parentalStoryLimit === 0) {
      Alert.alert(t.storiesGame, t.parentalMaxSelected(0));
      return;
    }
    launchPlayer([storyId], { resume: true });
  }, [launchPlayer, parentalStoryLimit, t]);

  // Tap always toggles selection — never auto-launches (avoids accidental play while building a queue).
  const handleStoryPress = useCallback((storyId) => {
    toggleSelect(storyId);
  }, [toggleSelect]);

  // Long-press plays a single story immediately.
  const handleStoryLongPress = useCallback((storyId) => {
    if (queueRef.current.length > 0) {
      toggleSelect(storyId);
      return;
    }
    playStoryDirectly(storyId);
  }, [toggleSelect, playStoryDirectly]);

  const moveQueueItem = (index, direction) => {
    setQueue((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    playSound('pop');
  };

  const removeFromQueue = (id) => {
    setQueue((prev) => prev.filter((item) => item !== id));
    playSound('pop');
  };

  const hasSavedProgress = Boolean(savedProgress?.playlist?.length);

  const handlePlay = () => {
    if (playlistsMatch(playQueue, savedProgress?.playlist)) {
      launchPlayer(playQueue, {
        resume: true,
        savedPlaylistId: savedProgress?.savedPlaylistId || null,
      });
      return;
    }
    if (hasSavedProgress) {
      Alert.alert(
        t.storiesResumePlaylist,
        t.storiesReplaceProgressConfirm,
        [
          { text: t.storiesResume, onPress: () => setShowResumeModal(true) },
          { text: t.storiesPlayQueue, onPress: () => launchPlayer(playQueue, { fresh: true }) },
          { text: t.back, style: 'cancel' },
        ],
      );
      return;
    }
    launchPlayer(playQueue, { fresh: true });
  };

  const handleResume = () => {
    if (!hasSavedProgress) {
      Alert.alert(t.storiesGame, t.storiesNoProgress);
      return;
    }
    setShowResumeModal(true);
  };

  const handleStartNewPlaylist = async () => {
    setShowResumeModal(false);
    await clearPlaybackProgress();
    await resetStoriesPlayed();
    setSavedProgress(null);
    playSound('pop');
  };

  const handleResumeStory = (storyIndex) => {
    setShowResumeModal(false);
    launchPlayer(savedProgress.playlist, {
      resume: true,
      startStoryIndex: storyIndex,
      savedPlaylistId: savedProgress.savedPlaylistId || null,
    });
  };

  const handleSavePlaylist = async (name) => {
    try {
      await saveNamedPlaylist({ name, storyIds: queue });
      await refreshSavedPlaylists();
      setShowSavePlaylistModal(false);
      playSound('pop');
      Alert.alert(t.success, t.storiesSavePlaylistSuccess);
    } catch (err) {
      if (err.message === 'EMPTY_NAME') {
        Alert.alert(t.storiesGame, t.storiesSavePlaylistEmptyName);
      }
    }
  };

  const handleLoadSavedQueue = (playlist) => {
    setQueue(playlist.storyIds);
    setShowSavedPlaylistsModal(false);
    playSound('pop');
  };

  const handlePlaySavedFresh = async (playlist) => {
    setShowSavedPlaylistsModal(false);
    await clearSavedPlaylistProgress(playlist.id);
    await launchPlayer(playlist.storyIds, { fresh: true, savedPlaylistId: playlist.id });
  };

  const handleResumeSaved = async (playlist) => {
    setShowSavedPlaylistsModal(false);
    await launchPlayer(playlist.storyIds, { resume: true, savedPlaylistId: playlist.id });
  };

  const handleDeleteSavedPlaylist = async (playlistId) => {
    await deleteSavedPlaylist(playlistId);
    await refreshSavedPlaylists();
    getValidPlaybackProgress().then(setSavedProgress);
    playSound('pop');
  };

  const openSavedPlaylists = async () => {
    await refreshSavedPlaylists();
    setShowSavedPlaylistsModal(true);
    playSound('pop');
  };

  const handleRebuildLibrary = async () => {
    setRebuilding(true);
    setSyncing(true);
    try {
      await refreshStoriesFull();
      const count = Object.keys(await getDownloadedStories()).length;
      if (count > 0) Alert.alert(t.success, t.storiesLibraryRebuilt(count));
      else Alert.alert(t.storiesGame, t.storiesRebuildEmpty);
    } finally {
      setRebuilding(false);
      setSyncing(false);
    }
  };

  const handleEnrichLibrary = async () => {
    if (enriching) return;
    setEnriching(true);
    playSound('pop');
    try {
      const result = await enrichStoriesLibrary({ limit: 100 });
      await refreshStoriesLight();
      if (result.changed) {
        Alert.alert(t.success, t.storiesEnrichDone(result.enrichedCount));
      } else {
        Alert.alert(t.storiesGame, t.storiesEnrichNone);
      }
    } catch (_) {
      Alert.alert(t.error, t.storiesEnrichNone);
    } finally {
      setEnriching(false);
    }
  };

  const openExtraInfoEditor = useCallback((story) => {
    setExtraInfoStory(story);
    setExtraInfoDraft(story.extraInfo || '');
    playSound('pop');
  }, [playSound]);

  const handleSaveExtraInfo = async () => {
    if (!extraInfoStory) return;
    await saveStoryExtraInfo(extraInfoStory.storyId, extraInfoDraft);
    await refreshStoriesLight();
    setExtraInfoStory(null);
    setExtraInfoDraft('');
    playSound('success');
    Alert.alert(t.success, t.storiesExtraInfoSaved);
  };

  const openCatalog = () => {
    playSound('pop');
    router.push('/story_packages');
  };

  const openResetQuotaModal = () => {
    playSound('pop');
    setResetPin('');
    setShowResetQuotaModal(true);
  };

  const handleConfirmResetQuota = async () => {
    if (resetPin.length !== 4) {
      Alert.alert(t.error, t.parentalPin);
      return;
    }
    setResettingQuota(true);
    try {
      await verifyParentPin(resetPin);
      await resetStoriesPlayed();
      setShowResetQuotaModal(false);
      setResetPin('');
      playSound('success');
      Alert.alert(t.success, t.storiesResetQuotaDone);
    } catch (_) {
      Alert.alert(t.error, t.parentalWrongPin);
    } finally {
      setResettingQuota(false);
    }
  };

  const catalogButton = (
    <View style={styles.headerActions}>
      {parentalStoryLimit != null ? (
        <TouchableOpacity style={styles.catalogBtn} onPress={openResetQuotaModal}>
          <Ionicons name="refresh-circle" size={24} color="white" />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={styles.catalogBtn} onPress={openSavedPlaylists}>
        <Ionicons name="bookmark" size={22} color="white" />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.catalogBtn}
        onPress={handleEnrichLibrary}
        disabled={enriching}
      >
        {enriching ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Ionicons name="sparkles" size={22} color="white" />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.catalogBtn}
        onPress={handleRebuildLibrary}
        disabled={rebuilding}
      >
        {rebuilding ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Ionicons name="refresh" size={22} color="white" />
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.catalogBtn} onPress={openCatalog}>
        <Ionicons name="cloud-download" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );

  const renderStory = useCallback(({ item }) => {
    const storyId = item.storyId;
    const queueIdx = queueIndexMap.get(storyId);
    const isQueued = queueIdx != null;
    const willPlay = isQueued && queueIdx < (parentalStoryLimit ?? queue.length);
    const sourceName = sourceNameById.get(item.source) || item.source;
    const displayThumbnail = getStoryDisplayThumbnail(item);
    const packThumbnail = packThumbnailById.get(item.packId) || null;

    return (
      <StoryGridCard
        item={item}
        width={cardWidth}
        thumbnailHeight={thumbnailHeight}
        queueIdx={queueIdx ?? 0}
        isQueued={isQueued}
        willPlay={willPlay}
        sourceName={sourceName}
        displayThumbnail={displayThumbnail}
        fallbackThumbnail={packThumbnail !== displayThumbnail ? packThumbnail : null}
        onPress={() => handleStoryPress(storyId)}
        onLongPress={() => handleStoryLongPress(storyId)}
        onInfoPress={() => openExtraInfoEditor(item)}
        t={t}
      />
    );
  }, [
    cardWidth, thumbnailHeight, queueIndexMap, parentalStoryLimit, queue.length,
    sourceNameById, packThumbnailById, handleStoryPress, handleStoryLongPress, openExtraInfoEditor, t,
  ]);

  const renderFilterChip = (key, label, active, onPress) => (
    <TouchableOpacity
      key={key}
      style={[styles.filterChip, active && styles.filterChipActive]}
      onPress={onPress}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const selectedGenreLabel = useMemo(() => {
    if (!genreFilter) return t.storiesFilterGenre;
    return genreFilter;
  }, [genreFilter, t.storiesFilterGenre]);

  const listFooter = useMemo(() => {
    if (!filteredStories.length) return null;
    const showPagination = totalPages > 1;
    const showCount = filteredStories.length > pageSize;
    if (!showPagination && !showCount && !hasMoreStories) return null;
    return (
      <View style={styles.listFooter}>
        {showPagination ? (
          <View style={styles.paginationRow}>
            <TouchableOpacity
              style={[styles.pageBtn, currentPage <= 1 && styles.pageBtnDisabled]}
              onPress={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <Ionicons name="chevron-back" size={18} color={currentPage <= 1 ? '#ccc' : '#00CED1'} />
            </TouchableOpacity>
            {visiblePageNumbers.map((page) => (
              <TouchableOpacity
                key={`page-${page}`}
                style={[styles.pageNumBtn, page === currentPage && styles.pageNumBtnActive]}
                onPress={() => goToPage(page)}
              >
                <Text style={[styles.pageNumText, page === currentPage && styles.pageNumTextActive]}>
                  {page}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.pageBtn, currentPage >= totalPages && styles.pageBtnDisabled]}
              onPress={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              <Ionicons name="chevron-forward" size={18} color={currentPage >= totalPages ? '#ccc' : '#00CED1'} />
            </TouchableOpacity>
          </View>
        ) : null}
        {showPagination ? (
          <Text style={styles.pageIndicatorText}>
            {t.storiesPageIndicator(currentPage, totalPages)}
          </Text>
        ) : null}
        {hasMoreStories ? (
          <TouchableOpacity
            style={styles.loadMoreBtn}
            onPress={loadMoreStories}
            disabled={loadingMore}
            activeOpacity={0.85}
          >
            {loadingMore ? (
              <ActivityIndicator size="small" color="#00CED1" />
            ) : (
              <>
                <Ionicons name="chevron-down-circle" size={22} color="#00CED1" />
                <Text style={styles.loadMoreText}>{t.storiesLoadMore}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
        {showCount ? (
          <Text style={styles.listCountText}>
            {t.storiesShowingCount(paginatedStories.length, filteredStories.length)}
          </Text>
        ) : null}
      </View>
    );
  }, [
    filteredStories.length, hasMoreStories, loadMoreStories, loadingMore,
    t, paginatedStories.length, pageSize, totalPages, currentPage,
    visiblePageNumbers, goToPage,
  ]);

  return (
    <View style={styles.container}>
      <AnimatedBackground />
      <Header title={`📖 ${t.storiesGame}`} rightComponent={catalogButton} />

      <View style={[styles.filters, { paddingHorizontal: 16 }]}>
        {parentalStoryLimit != null && (
          <View style={styles.parentalBannerCompact}>
            <Text style={styles.parentalBannerTextCompact} numberOfLines={1}>
              🛡️ {t.parentalActiveStories(parentalStoryLimit)}
            </Text>
            <TouchableOpacity style={styles.resetQuotaInlineBtn} onPress={openResetQuotaModal}>
              <Ionicons name="refresh" size={14} color="white" />
              <Text style={styles.resetQuotaInlineText}>{t.storiesResetQuota}</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.filterRowCompact}>
          <TextInput
            style={[styles.filterInputCompact, styles.filterInputFlex]}
            placeholder={t.storiesSearchPlaceholder}
            placeholderTextColor="#999"
            value={nameFilter}
            onChangeText={setNameFilter}
          />
          <TextInput
            style={[styles.filterInputCompact, styles.filterInputFlex]}
            placeholder={t.storiesArtistFilter}
            placeholderTextColor="#999"
            value={artistFilter}
            onChangeText={setArtistFilter}
          />
        </View>
        <View style={styles.filterPickerRow}>
          <TouchableOpacity
            style={[styles.packPickerBtnCompact, styles.filterPickerFlex]}
            onPress={() => { playSound('pop'); setShowPackPicker(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="albums-outline" size={14} color="#9B59B6" />
            <Text style={styles.packPickerTextCompact} numberOfLines={1}>{selectedPackLabel}</Text>
            <Ionicons name="chevron-down" size={14} color="#9B59B6" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.packPickerBtnCompact, styles.filterPickerFlex, genreFilter && styles.packPickerBtnActive]}
            onPress={() => { playSound('pop'); setShowGenrePicker(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="musical-notes-outline" size={14} color="#9B59B6" />
            <Text style={styles.packPickerTextCompact} numberOfLines={1}>{selectedGenreLabel}</Text>
            <Ionicons name="chevron-down" size={14} color="#9B59B6" />
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollCompact}
        >
          {renderFilterChip('source-all', t.storiesAllSources, !sourceFilter, () => setSourceFilter(''))}
          {sources.map((s) => renderFilterChip(
            `source-${s.id}`,
            s.name,
            sourceFilter === s.id,
            () => setSourceFilter(s.id),
          ))}
          {(hasStories || hasSongs) && renderFilterChip(
            'type-all',
            t.storiesAllTypes,
            !typeFilter,
            () => setTypeFilter(''),
          )}
          {hasStories && renderFilterChip(
            'type-story',
            t.storiesTypeStory,
            typeFilter === 'story',
            () => setTypeFilter(typeFilter === 'story' ? '' : 'story'),
          )}
          {hasSongs && renderFilterChip(
            'type-song',
            t.storiesTypeSong,
            typeFilter === 'song',
            () => setTypeFilter(typeFilter === 'song' ? '' : 'song'),
          )}
          {renderFilterChip(
            'dur-min30',
            t.storiesDurationOver30,
            durationFilter === 'min30',
            () => setDurationFilter('min30'),
          )}
          {renderFilterChip(
            'dur-under30',
            t.storiesDurationUnder30,
            durationFilter === 'under30',
            () => setDurationFilter('under30'),
          )}
          {DURATION_MAX_CHIPS.map((mins) => renderFilterChip(
            `dur-under${mins}`,
            t.storiesDurationUnder(mins),
            durationFilter === `under${mins}`,
            () => setDurationFilter(durationFilter === `under${mins}` ? 'min30' : `under${mins}`),
          ))}
          {renderFilterChip(
            'dur-all',
            t.storiesDurationAll,
            durationFilter === 'all',
            () => setDurationFilter('all'),
          )}
        </ScrollView>
        {(loading || syncing) && (
          <View style={styles.syncBannerCompact}>
            <ActivityIndicator size="small" color="#00CED1" />
            <Text style={styles.syncBannerTextCompact}>
              {enriching ? t.storiesEnriching : loading ? t.appLoading : t.storiesSyncing}
            </Text>
          </View>
        )}
      </View>

      <Modal visible={showResetQuotaModal} transparent animationType="fade">
        <Pressable style={styles.packModalOverlay} onPress={() => setShowResetQuotaModal(false)}>
          <Pressable style={styles.resetQuotaSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.resetQuotaTitle}>{t.storiesResetQuotaTitle}</Text>
            <Text style={styles.resetQuotaHint}>{t.storiesResetQuotaHint}</Text>
            <TextInput
              style={styles.resetPinInput}
              value={resetPin}
              onChangeText={(v) => setResetPin(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder="••••"
              placeholderTextColor="#aaa"
              autoFocus
            />
            <View style={styles.extraInfoActions}>
              <TouchableOpacity
                style={styles.extraInfoCancel}
                onPress={() => setShowResetQuotaModal(false)}
              >
                <Text style={styles.extraInfoCancelText}>{t.back}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.extraInfoSave}
                onPress={handleConfirmResetQuota}
                disabled={resettingQuota}
              >
                {resettingQuota ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.extraInfoSaveText}>{t.storiesResetQuotaConfirm}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!extraInfoStory} transparent animationType="slide">
        <Pressable style={styles.packModalOverlay} onPress={() => setExtraInfoStory(null)}>
          <Pressable style={styles.extraInfoSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.extraInfoTitle}>{t.storiesExtraInfoTitle}</Text>
            {extraInfoStory ? (
              <Text style={styles.extraInfoStoryName} numberOfLines={2}>{extraInfoStory.title}</Text>
            ) : null}
            <Text style={styles.extraInfoHint}>{t.storiesExtraInfoHint}</Text>
            <TextInput
              style={styles.extraInfoInput}
              placeholder={t.storiesExtraInfoPlaceholder}
              placeholderTextColor="#999"
              value={extraInfoDraft}
              onChangeText={setExtraInfoDraft}
              multiline
              numberOfLines={4}
            />
            <View style={styles.extraInfoActions}>
              <TouchableOpacity style={styles.extraInfoCancel} onPress={() => setExtraInfoStory(null)}>
                <Text style={styles.extraInfoCancelText}>{t.back}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.extraInfoSave} onPress={handleSaveExtraInfo}>
                <Text style={styles.extraInfoSaveText}>{t.save}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showPackPicker} transparent animationType="slide">
        <Pressable style={styles.packModalOverlay} onPress={() => setShowPackPicker(false)}>
          <Pressable style={styles.packModalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.packModalHeader}>
              <Text style={styles.packModalTitle}>{t.storiesFilterPack}</Text>
              <TouchableOpacity onPress={() => setShowPackPicker(false)}>
                <Ionicons name="close" size={26} color="#666" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[{ packId: '', title: t.storiesAllPacks, storyCount: playableStories.length }, ...(filterOptions.packs ?? [])]}
              keyExtractor={(item) => item.packId || 'all'}
              contentContainerStyle={styles.packModalList}
              renderItem={({ item }) => {
                const isActive = packFilter === item.packId;
                const usage = item.packId ? (packUsageCounts[item.packId] || 0) : null;
                return (
                  <TouchableOpacity
                    style={[styles.packModalRow, isActive && styles.packModalRowActive]}
                    onPress={() => {
                      setPackFilter(item.packId);
                      setShowPackPicker(false);
                      playSound('pop');
                    }}
                  >
                    <View style={styles.packModalRowText}>
                      <Text style={[styles.packModalRowTitle, isActive && styles.packModalRowTitleActive]} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.packModalRowMeta}>
                        {t.storiesPackStoryCount(item.storyCount)}
                        {usage != null && usage > 0 ? ` · ${t.storiesPackUsageCount(usage)}` : ''}
                      </Text>
                    </View>
                    {isActive ? <Ionicons name="checkmark-circle" size={22} color="#9B59B6" /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showGenrePicker} transparent animationType="slide">
        <Pressable style={styles.packModalOverlay} onPress={() => setShowGenrePicker(false)}>
          <Pressable style={styles.packModalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.packModalHeader}>
              <Text style={styles.packModalTitle}>{t.storiesFilterGenre}</Text>
              <TouchableOpacity onPress={() => setShowGenrePicker(false)}>
                <Ionicons name="close" size={26} color="#666" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[{ genre: '', label: t.storiesAllGenres }, ...(filterOptions.genres ?? []).map((g) => ({ genre: g, label: g }))]}
              keyExtractor={(item) => item.genre || 'all-genres'}
              contentContainerStyle={styles.packModalList}
              renderItem={({ item }) => {
                const isActive = genreFilter === item.genre;
                return (
                  <TouchableOpacity
                    style={[styles.packModalRow, isActive && styles.packModalRowActive]}
                    onPress={() => {
                      setGenreFilter(item.genre);
                      setShowGenrePicker(false);
                      playSound('pop');
                    }}
                  >
                    <Text style={[styles.packModalRowTitle, isActive && styles.packModalRowTitleActive]} numberOfLines={2}>
                      {item.label}
                    </Text>
                    {isActive ? <Ionicons name="checkmark-circle" size={22} color="#9B59B6" /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <FlatList
        ref={listRef}
        style={styles.storyList}
        data={paginatedStories}
        keyExtractor={(item) => item.storyId}
        numColumns={numColumns}
        key={numColumns}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: queue.length ? 220 : 120 },
        ]}
        columnWrapperStyle={numColumns > 1 ? [styles.columnWrapper, { gap: gridGap }] : undefined}
        renderItem={renderStory}
        extraData={queue}
        initialNumToRender={Math.min(pageSize, 28)}
        maxToRenderPerBatch={numColumns * 3}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS === 'android'}
        onEndReached={loadMoreStories}
        onEndReachedThreshold={0.4}
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          loading && !playableStories.length ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator size="large" color="#00CED1" />
              {syncing ? (
                <Text style={styles.emptyHint}>{t.storiesSyncing}</Text>
              ) : null}
              <TouchableOpacity
                style={styles.rebuildBtn}
                onPress={handleRebuildLibrary}
                disabled={rebuilding}
              >
                {rebuilding ? (
                  <ActivityIndicator color="#00CED1" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={20} color="#00CED1" />
                    <Text style={styles.rebuildBtnText}>{t.storiesRebuildLibrary}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : filteredStories.length === 0 && playableStories.length > 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{t.storiesEmpty}</Text>
              {syncing && <ActivityIndicator size="small" color="#00CED1" />}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{t.storiesNoDownloaded}</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={openCatalog}>
                <Ionicons name="cloud-download" size={22} color="white" />
                <Text style={styles.emptyBtnText}>{t.storiesOpenCatalog}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rebuildBtn}
                onPress={handleRebuildLibrary}
                disabled={rebuilding}
              >
                {rebuilding ? (
                  <ActivityIndicator color="#00CED1" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={20} color="#00CED1" />
                    <Text style={styles.rebuildBtnText}>{t.storiesRebuildLibrary}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )
        }
      />

      {queue.length > 0 ? (
        <View style={[styles.queueBarWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <Text style={styles.queueSelectHint}>{t.storiesQueueSelectHint}</Text>
          <PlaylistQueueBar
            queue={queue}
            meta={downloadedMeta}
            playLimit={parentalStoryLimit}
            onMoveUp={(idx) => moveQueueItem(idx, -1)}
            onMoveDown={(idx) => moveQueueItem(idx, 1)}
            onRemove={removeFromQueue}
            onPlay={handlePlay}
            onResume={hasSavedProgress ? handleResume : null}
            onSave={() => setShowSavePlaylistModal(true)}
            labels={{
              title: (n) => t.storiesQueueTitle(n),
              willPlay: (n) => t.storiesWillPlay(n),
              play: t.storiesPlayQueue,
              resume: t.storiesResume,
              save: t.storiesSavePlaylist,
            }}
          />
        </View>
      ) : (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.bottomActions}>
            <TouchableOpacity style={styles.savedPlaylistsBtn} onPress={openSavedPlaylists}>
              <Ionicons name="bookmark" size={22} color="#9B59B6" />
              <Text style={styles.savedPlaylistsBtnText}>{t.storiesSavedPlaylists}</Text>
            </TouchableOpacity>
            {hasSavedProgress && (
              <TouchableOpacity style={styles.resumeBtn} onPress={handleResume}>
                <Ionicons name="play-circle" size={24} color="#32CD32" />
                <Text style={[styles.resumeBtnText, styles.resumeBtnTextActive]}>{t.storiesResume}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <ResumePlaylistModal
        visible={showResumeModal}
        onClose={() => setShowResumeModal(false)}
        progress={savedProgress}
        meta={downloadedMeta}
        onResumeStory={handleResumeStory}
        onStartNew={handleStartNewPlaylist}
        labels={{
          title: t.storiesResumePlaylist,
          empty: t.storiesNoProgress,
          continueAt: (time) => t.storiesContinueAt(time),
          startNew: t.storiesStartNewPlaylist,
        }}
      />

      <SavePlaylistModal
        visible={showSavePlaylistModal}
        onClose={() => setShowSavePlaylistModal(false)}
        onSave={handleSavePlaylist}
        storyCount={queue.length}
        labels={{
          title: t.storiesSavePlaylistTitle,
          subtitle: (n) => t.storiesSavePlaylistSubtitle(n),
          placeholder: t.storiesSavePlaylistPlaceholder,
          save: t.storiesSavePlaylist,
          cancel: t.back,
        }}
      />

      <SavedPlaylistsModal
        visible={showSavedPlaylistsModal}
        onClose={() => setShowSavedPlaylistsModal(false)}
        playlists={savedPlaylists}
        meta={downloadedMeta}
        onLoadQueue={handleLoadSavedQueue}
        onPlayFresh={handlePlaySavedFresh}
        onResume={handleResumeSaved}
        onDelete={handleDeleteSavedPlaylist}
        labels={{
          title: t.storiesSavedPlaylists,
          empty: t.storiesSavedPlaylistsEmpty,
          storyCount: (n) => t.storiesSavedStoryCount(n),
          continueAt: (title, time) => t.storiesSavedContinueAt(title, time),
          loadQueue: t.storiesLoadSavedQueue,
          play: t.storiesPlay,
          resume: t.storiesResume,
          delete: t.storiesDeleteSavedPlaylist,
          deleteTitle: t.storiesDeleteSavedPlaylistTitle,
          deleteMessage: (name) => t.storiesDeleteSavedPlaylistMessage(name),
          cancel: t.back,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5E1' },
  storyList: { flex: 1 },
  catalogBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filters: { paddingTop: 6, paddingBottom: 2, gap: 4 },
  filterRowCompact: { flexDirection: 'row', gap: 6 },
  filterInputFlex: { flex: 1, minWidth: 0 },
  filterPickerRow: { flexDirection: 'row', gap: 6 },
  filterPickerFlex: { flex: 1, minWidth: 0 },
  parentalBannerCompact: {
    backgroundColor: '#9B59B6', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  parentalBannerTextCompact: { color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 12, flex: 1 },
  resetQuotaInlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  resetQuotaInlineText: { color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 11 },
  resetQuotaSheet: {
    backgroundColor: 'white', borderRadius: 20, marginHorizontal: 28,
    padding: 20, gap: 12, alignSelf: 'center', width: '85%', maxWidth: 400,
    marginTop: '35%',
  },
  resetQuotaTitle: { fontFamily: 'Fredoka-SemiBold', fontSize: 18, color: '#333', textAlign: 'center' },
  resetQuotaHint: { fontFamily: 'Fredoka-SemiBold', fontSize: 13, color: '#888', textAlign: 'center' },
  resetPinInput: {
    backgroundColor: '#f9f9f9', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
    fontSize: 22, textAlign: 'center', letterSpacing: 8, borderWidth: 1, borderColor: '#ddd',
  },
  packPickerBtnCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8F0FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#9B59B6',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  packPickerBtnActive: { backgroundColor: '#EDE0FF', borderColor: '#7D3C98' },
  packPickerTextCompact: {
    flex: 1,
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 11,
    color: '#5a3e5c',
  },
  filterScrollCompact: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 1 },
  syncBannerCompact: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 2, paddingHorizontal: 4,
  },
  syncBannerTextCompact: { fontSize: 11, fontFamily: 'Fredoka-SemiBold', color: '#666' },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  pageBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#00CED1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnDisabled: { borderColor: '#ddd', backgroundColor: '#f5f5f5' },
  pageNumBtn: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 17,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNumBtnActive: { backgroundColor: '#00CED1', borderColor: '#00CED1' },
  pageNumText: { fontSize: 13, fontFamily: 'Fredoka-SemiBold', color: '#333' },
  pageNumTextActive: { color: 'white' },
  pageIndicatorText: { fontSize: 12, fontFamily: 'Fredoka-SemiBold', color: '#888' },
  parentalBanner: {
    backgroundColor: '#9B59B6', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12,
  },
  parentalBannerText: { color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 14, textAlign: 'center' },
  parentalHint: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Fredoka-SemiBold', fontSize: 11, textAlign: 'center', marginTop: 4 },
  filterInput: {
    backgroundColor: 'white', borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 16, fontFamily: 'Fredoka-SemiBold',
    borderWidth: 2, borderColor: '#00CED1',
  },
  filterInputCompact: {
    backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 10,
    paddingVertical: 6, fontSize: 12, fontFamily: 'Fredoka-SemiBold',
    borderWidth: 1, borderColor: '#ddd',
  },
  packPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8F0FF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#9B59B6',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  packPickerText: {
    flex: 1,
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 14,
    color: '#5a3e5c',
  },
  packModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  packModalSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  packModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  packModalTitle: { fontFamily: 'Fredoka-SemiBold', fontSize: 18, color: '#333' },
  packModalList: { paddingHorizontal: 12, paddingTop: 8 },
  packModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  packModalRowActive: { backgroundColor: '#F8F0FF' },
  packModalRowText: { flex: 1 },
  packModalRowTitle: { fontFamily: 'Fredoka-SemiBold', fontSize: 15, color: '#333' },
  packModalRowTitleActive: { color: '#9B59B6' },
  packModalRowMeta: { fontFamily: 'Fredoka-SemiBold', fontSize: 12, color: '#888', marginTop: 2 },
  filterInputSecondary: {
    backgroundColor: 'white', borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 8, fontSize: 14, fontFamily: 'Fredoka-SemiBold',
    borderWidth: 1, borderColor: '#ddd',
  },
  filterScroll: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  filterChip: {
    backgroundColor: 'white', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1, borderColor: '#ddd',
  },
  filterChipActive: { backgroundColor: '#00CED1', borderColor: '#00CED1' },
  filterChipText: { fontSize: 10, fontFamily: 'Fredoka-SemiBold', color: '#333' },
  filterChipTextActive: { color: 'white' },
  syncBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  syncBannerText: { fontSize: 12, fontFamily: 'Fredoka-SemiBold', color: '#666' },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },
  columnWrapper: { justifyContent: 'flex-start' },
  storyCard: {
    backgroundColor: 'white', borderRadius: 16, marginBottom: 12,
    overflow: 'hidden', elevation: 4, borderWidth: 3, borderColor: 'transparent',
  },
  storyCardQueued: { borderColor: '#00CED1' },
  storyCardWillPlay: { borderColor: '#32CD32', backgroundColor: '#FAFFFA' },
  thumbnail: { width: '100%', height: 120, backgroundColor: '#f0f0f0' },
  queueBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: '#00CED1', borderRadius: 14,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },
  queueBadgeActive: { backgroundColor: '#32CD32' },
  queueBadgeText: { color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 14 },
  storyTitle: {
    fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#333',
    padding: 8, paddingBottom: 2,
  },
  storyMeta: { fontSize: 11, color: '#888', paddingHorizontal: 8 },
  artistText: { fontSize: 11, color: '#666', paddingHorizontal: 8, fontStyle: 'italic' },
  metaTag: { fontSize: 10, color: '#9B59B6', paddingHorizontal: 8, paddingBottom: 2 },
  packSubtitle: { fontSize: 10, color: '#aaa', paddingHorizontal: 8, paddingBottom: 8, fontStyle: 'italic' },
  emptyBox: { alignItems: 'center', marginTop: 40, gap: 16, paddingHorizontal: 24 },
  emptyText: { textAlign: 'center', fontSize: 16, color: '#888', fontFamily: 'Fredoka-SemiBold' },
  emptyHint: { textAlign: 'center', fontSize: 13, color: '#999', fontFamily: 'Fredoka-SemiBold' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#9B59B6', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 25,
  },
  emptyBtnText: { color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 16 },
  rebuildBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  rebuildBtnText: { color: '#00CED1', fontFamily: 'Fredoka-SemiBold', fontSize: 14 },
  listFooter: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 20,
    marginTop: 4, marginBottom: 8, borderRadius: 20,
    backgroundColor: 'white', borderWidth: 2, borderColor: '#00CED1',
    alignSelf: 'stretch', marginHorizontal: 8,
  },
  loadMoreText: { fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#00CED1' },
  listCountText: { fontSize: 12, fontFamily: 'Fredoka-SemiBold', color: '#888', marginTop: 0 },
  extraInfoSheet: {
    backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 28, gap: 10,
  },
  extraInfoTitle: { fontSize: 20, fontFamily: 'Fredoka-SemiBold', color: '#333', textAlign: 'center' },
  extraInfoStoryName: { fontSize: 14, color: '#9B59B6', fontFamily: 'Fredoka-SemiBold', textAlign: 'center' },
  extraInfoHint: { fontSize: 12, color: '#888', fontFamily: 'Fredoka-SemiBold', textAlign: 'center' },
  extraInfoInput: {
    minHeight: 100, backgroundColor: '#f8f8f8', borderRadius: 16, padding: 14,
    fontSize: 15, fontFamily: 'Fredoka-SemiBold', borderWidth: 2, borderColor: '#9B59B6',
    textAlignVertical: 'top',
  },
  extraInfoActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  extraInfoCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 20, backgroundColor: '#eee', alignItems: 'center',
  },
  extraInfoCancelText: { fontFamily: 'Fredoka-SemiBold', color: '#666' },
  extraInfoSave: {
    flex: 1, paddingVertical: 12, borderRadius: 20, backgroundColor: '#9B59B6', alignItems: 'center',
  },
  extraInfoSaveText: { fontFamily: 'Fredoka-SemiBold', color: 'white' },
  queueBarWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'white', elevation: 12,
  },
  queueSelectHint: {
    fontSize: 11, fontFamily: 'Fredoka-SemiBold', color: '#888',
    textAlign: 'center', paddingTop: 8, paddingHorizontal: 16,
  },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'white', paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#eee', elevation: 10,
  },
  bottomActions: { flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' },
  savedPlaylistsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#9B59B6',
    backgroundColor: '#F8F0FF',
  },
  savedPlaylistsBtnText: { fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#9B59B6' },
  resumeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  resumeBtnText: { fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#00CED1' },
  resumeBtnTextActive: { color: '#228B22' },
});

export default StoriesScreen;
