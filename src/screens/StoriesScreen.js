import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, useWindowDimensions, Alert, ActivityIndicator, ScrollView, Modal, Pressable,
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
  subscribeStoriesLibrary, rebuildLibraryFromDisk, debugLogLibraryFileSizes, getStoryFilterOptions,
  formatStoryDurationLabel,
  getSavedPlaylists, saveNamedPlaylist, deleteSavedPlaylist, clearSavedPlaylistProgress,
  getPackUsageCounts, playlistsMatch, getStoryDisplayThumbnail, getPackById,
  repairStoryThumbnailsForLibrary,
} from '../services/storyService';
import { useDebouncedValue } from '../utils/useDebouncedValue';

const DURATION_MAX_CHIPS = [5, 10, 20];
const STORIES_PAGE_ROWS = 8;

const sortStoriesByTitle = (stories) => [...stories].sort((a, b) => (a.title || '').localeCompare(b.title || ''));

const StoriesScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const { isActive, session, getStoriesRemaining, resetStoriesPlayed } = useParentalControl();
  const t = getStrings(language);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const numColumns = isTablet ? 3 : 2;

  const [nameFilter, setNameFilter] = useState('');
  const debouncedNameFilter = useDebouncedValue(nameFilter);
  const [sourceFilter, setSourceFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [artistFilter, setArtistFilter] = useState('');
  const debouncedArtistFilter = useDebouncedValue(artistFilter);
  const [genreFilter, setGenreFilter] = useState('');
  const [albumFilter, setAlbumFilter] = useState('');
  const [packFilter, setPackFilter] = useState('');
  const [packUsageCounts, setPackUsageCounts] = useState({});
  const [showPackPicker, setShowPackPicker] = useState(false);
  const [durationFilter, setDurationFilter] = useState('min30');
  const [queue, setQueue] = useState([]);
  const [playableStories, setPlayableStories] = useState([]);
  const [downloadedMeta, setDownloadedMeta] = useState({});
  const [savedProgress, setSavedProgress] = useState(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showSavePlaylistModal, setShowSavePlaylistModal] = useState(false);
  const [showSavedPlaylistsModal, setShowSavedPlaylistsModal] = useState(false);
  const [savedPlaylists, setSavedPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [visibleCount, setVisibleCount] = useState(STORIES_PAGE_ROWS * numColumns);
  const [loadingMore, setLoadingMore] = useState(false);

  const pageSize = STORIES_PAGE_ROWS * numColumns;

  const thumbnailRepairDoneRef = useRef(false);

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

  const applyLibraryMeta = useCallback((meta) => {
    setPlayableStories(sortStoriesByTitle(Object.values(meta)));
    setDownloadedMeta(meta);
    setQueue((prev) => prev.filter((id) => meta[id]));
  }, []);

  const refreshStoriesLight = useCallback(async () => {
    try {
      const meta = await getDownloadedStories();
      applyLibraryMeta(meta);
    } catch (_) {
      applyLibraryMeta({});
    } finally {
      setLoading(false);
    }
  }, [applyLibraryMeta]);

  const refreshStoriesFull = useCallback(async () => {
    setSyncing(true);
    try {
      const stories = await getPlayableStories({ syncOnLoad: true });
      const [meta, progress] = await Promise.all([
        getDownloadedStories(),
        getValidPlaybackProgress(),
      ]);
      setPlayableStories(stories);
      setDownloadedMeta(meta);
      setSavedProgress(progress);
      setQueue((prev) => prev.filter((id) => meta[id]));
      await debugLogLibraryFileSizes();
    } catch (_) {
      await refreshStoriesLight();
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, [refreshStoriesLight]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [meta, progress] = await Promise.all([
        getDownloadedStories(),
        getValidPlaybackProgress(),
      ]);
      if (cancelled) return;
      applyLibraryMeta(meta);
      setSavedProgress(progress);
      setLoading(false);
      getPlayableStories({ syncOnLoad: false });
    })();
    return () => { cancelled = true; };
  }, [applyLibraryMeta]);

  useEffect(() => subscribeStoriesLibrary(refreshStoriesLight), [refreshStoriesLight]);

  useFocusEffect(useCallback(() => {
    getValidPlaybackProgress().then(setSavedProgress);
    getSavedPlaylists().then(setSavedPlaylists);
    getPackUsageCounts().then(setPackUsageCounts);
    if (!thumbnailRepairDoneRef.current) {
      thumbnailRepairDoneRef.current = true;
      repairStoryThumbnailsForLibrary({ limit: 40 }).then(({ changed }) => {
        if (changed) refreshStoriesLight();
      });
    }
  }, [refreshStoriesLight]));

  const refreshSavedPlaylists = useCallback(async () => {
    setSavedPlaylists(await getSavedPlaylists());
  }, []);

  const parentalStoryLimit = isActive && session?.mode === 'stories'
    ? getStoriesRemaining()
    : null;

  const filterOptions = useMemo(
    () => getStoryFilterOptions(playableStories, packUsageCounts),
    [playableStories, packUsageCounts],
  );

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
    if (fresh) {
      await resetStoriesPlayed();
    }
    playSound('pop');
    const navParams = {
      playlist: JSON.stringify(storyIds),
      parental: '1',
    };
    if (resume) navParams.resume = '1';
    if (fresh) navParams.fresh = '1';
    if (startStoryIndex != null) navParams.startStoryIndex = String(startStoryIndex);
    if (savedPlaylistId) navParams.savedPlaylistId = savedPlaylistId;
    router.push({ pathname: '/story_player', params: navParams });
  }, [router, playSound, t, resetStoriesPlayed]);

  useEffect(() => {
    if (params.autoLaunch !== '1' || !isActive || session?.mode !== 'stories') return;
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
    setVisibleCount(pageSize);
  }, [nameFilter, sourceFilter, typeFilter, artistFilter, genreFilter, albumFilter, packFilter, durationFilter, pageSize, playableStories.length]);

  const paginatedStories = useMemo(
    () => filteredStories.slice(0, visibleCount),
    [filteredStories, visibleCount],
  );

  const hasMoreStories = visibleCount < filteredStories.length;

  const loadMoreStories = useCallback(() => {
    if (!hasMoreStories || loadingMore) return;
    setLoadingMore(true);
    requestAnimationFrame(() => {
      setVisibleCount((prev) => Math.min(prev + pageSize, filteredStories.length));
      setLoadingMore(false);
    });
  }, [hasMoreStories, loadingMore, pageSize, filteredStories.length]);

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
      setLoading(false);
    }
  };

  const openCatalog = () => {
    playSound('pop');
    router.push('/story_packages');
  };

  const catalogButton = (
    <View style={styles.headerActions}>
      <TouchableOpacity style={styles.catalogBtn} onPress={openSavedPlaylists}>
        <Ionicons name="bookmark" size={22} color="white" />
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

  const cardWidth = (width - 48) / numColumns - 8;

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
        queueIdx={queueIdx ?? 0}
        isQueued={isQueued}
        willPlay={willPlay}
        sourceName={sourceName}
        displayThumbnail={displayThumbnail}
        fallbackThumbnail={packThumbnail !== displayThumbnail ? packThumbnail : null}
        onPress={() => toggleSelect(storyId)}
        t={t}
      />
    );
  }, [
    cardWidth, queueIndexMap, parentalStoryLimit, queue.length,
    sourceNameById, packThumbnailById, toggleSelect, t,
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

  const listFooter = useMemo(() => {
    if (loading || !filteredStories.length) return null;
    if (loadingMore) {
      return (
        <View style={styles.listFooter}>
          <ActivityIndicator size="small" color="#00CED1" />
        </View>
      );
    }
    if (hasMoreStories) {
      return (
        <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMoreStories}>
          <Text style={styles.loadMoreText}>{t.storiesLoadMore}</Text>
          <Text style={styles.listCountText}>
            {t.storiesShowingCount(paginatedStories.length, filteredStories.length)}
          </Text>
        </TouchableOpacity>
      );
    }
    if (filteredStories.length > pageSize) {
      return (
        <View style={styles.listFooter}>
          <Text style={styles.listCountText}>
            {t.storiesShowingCount(filteredStories.length, filteredStories.length)}
          </Text>
        </View>
      );
    }
    return null;
  }, [
    loading, filteredStories.length, loadingMore, hasMoreStories, loadMoreStories,
    t, paginatedStories.length, pageSize,
  ]);

  return (
    <View style={styles.container}>
      <AnimatedBackground />
      <Header title={`📖 ${t.storiesGame}`} rightComponent={catalogButton} />

      <View style={[styles.filters, { paddingHorizontal: 16 }]}>
        {parentalStoryLimit != null && (
          <View style={styles.parentalBanner}>
            <Text style={styles.parentalBannerText}>
              🛡️ {t.parentalActiveStories(parentalStoryLimit)}
            </Text>
            <Text style={styles.parentalHint}>{t.storiesParentalQueueHint}</Text>
          </View>
        )}
        <TextInput
          style={styles.filterInput}
          placeholder={t.storiesSearchPlaceholder}
          placeholderTextColor="#999"
          value={nameFilter}
          onChangeText={setNameFilter}
        />
        {(filterOptions.packs ?? []).length > 0 && (
          <TouchableOpacity
            style={styles.packPickerBtn}
            onPress={() => { playSound('pop'); setShowPackPicker(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="albums-outline" size={18} color="#9B59B6" />
            <Text style={styles.packPickerText} numberOfLines={1}>{selectedPackLabel}</Text>
            <Ionicons name="chevron-down" size={18} color="#9B59B6" />
          </TouchableOpacity>
        )}
        <TextInput
          style={styles.filterInputCompact}
          placeholder={t.storiesArtistFilter}
          placeholderTextColor="#999"
          value={artistFilter}
          onChangeText={setArtistFilter}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
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
          {(filterOptions.genres ?? []).slice(0, 6).map((genre) => renderFilterChip(
            `genre-${genre}`,
            genre,
            genreFilter === genre,
            () => setGenreFilter(genreFilter === genre ? '' : genre),
          ))}
        </ScrollView>
        {syncing && (
          <View style={styles.syncBanner}>
            <ActivityIndicator size="small" color="#00CED1" />
            <Text style={styles.syncBannerText}>{t.storiesSyncing}</Text>
          </View>
        )}
      </View>

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

      <FlatList
        data={paginatedStories}
        keyExtractor={(item) => item.storyId}
        numColumns={numColumns}
        key={numColumns}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: queue.length ? 220 : 120 },
        ]}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        renderItem={renderStory}
        extraData={queue}
        initialNumToRender={Math.min(10, pageSize)}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews
        onEndReached={loadMoreStories}
        onEndReachedThreshold={0.35}
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
  catalogBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filters: { paddingTop: 8, paddingBottom: 4, gap: 6 },
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
    backgroundColor: 'white', borderRadius: 16, paddingHorizontal: 14,
    paddingVertical: 8, fontSize: 14, fontFamily: 'Fredoka-SemiBold',
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
  filters: { paddingTop: 8, paddingBottom: 4, gap: 6 },
  filterScroll: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  filterChip: {
    backgroundColor: 'white', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14, borderWidth: 1, borderColor: '#ddd',
  },
  filterChipActive: { backgroundColor: '#00CED1', borderColor: '#00CED1' },
  filterChipText: { fontSize: 12, fontFamily: 'Fredoka-SemiBold', color: '#333' },
  filterChipTextActive: { color: 'white' },
  syncBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  syncBannerText: { fontSize: 12, fontFamily: 'Fredoka-SemiBold', color: '#666' },
  listContent: { padding: 16 },
  columnWrapper: { justifyContent: 'flex-start', gap: 8 },
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
    alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20,
    marginTop: 4, marginBottom: 8, borderRadius: 20,
    backgroundColor: 'white', borderWidth: 2, borderColor: '#00CED1',
  },
  loadMoreText: { fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#00CED1' },
  listCountText: { fontSize: 12, fontFamily: 'Fredoka-SemiBold', color: '#888', marginTop: 4 },
  queueBarWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'white', elevation: 12,
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
