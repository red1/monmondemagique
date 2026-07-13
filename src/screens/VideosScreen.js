import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  useWindowDimensions, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Header from '../components/shared/Header';
import AnimatedBackground from '../components/shared/AnimatedBackground';
import { useSounds } from '../../contexts/SoundContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useParentalControl } from '../../contexts/ParentalControlContext';
import { getStrings } from '../../constants/Strings';
import {
  subscribeSharedMedia, getSharedVideoIds,
  SYSTEM_DOWNLOADS_LABEL, requestDownloadsAccess,
  scanDownloadsFolder, isSharedMediaCacheFresh, getCachedSharedScan,
} from '../services/sharedMediaService';
import { refreshSharedDownloads, isActiveDownloadInProgress } from '../services/storyService';

const TEAL = '#00CED1';

const VideoGridCard = memo(function VideoGridCard({ video, onPress, width }) {
  return (
    <TouchableOpacity
      style={[styles.card, { width }]}
      onPress={() => onPress(video)}
      activeOpacity={0.85}
    >
      <View style={styles.thumb}>
        <Ionicons name="videocam" size={36} color="white" />
        {video.hasSubtitles ? (
          <View style={styles.subBadge}>
            <Ionicons name="text" size={12} color="white" />
          </View>
        ) : null}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{video.title}</Text>
    </TouchableOpacity>
  );
});

export default function VideosScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const {
    isActive, session, getVideosRemaining, resetVideosPlayed,
  } = useParentalControl();
  const t = getStrings(language);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const numColumns = isTablet ? 3 : 2;
  const gap = 12;
  const cardWidth = (width * 0.92 - gap * (numColumns - 1)) / numColumns;

  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);

  const loadInFlightRef = useRef(null);
  const launchingPlayerRef = useRef(false);
  const autoLaunchDoneRef = useRef(false);

  const parentalVideoLimit = isActive && session?.mode === 'stories'
    ? getVideosRemaining()
    : null;

  const loadVideos = useCallback(async ({ showSpinner = false, force = false } = {}) => {
    if (loadInFlightRef.current) {
      return loadInFlightRef.current;
    }

    if (showSpinner) setRefreshing(true);

    const run = (async () => {
      try {
        const permission = await requestDownloadsAccess();
        const allowed = permission.granted || permission.accessPrivileges === 'limited';
        setNeedsPermission(!allowed);

        let result;
        if (force && !isActiveDownloadInProgress()) {
          result = await refreshSharedDownloads();
        } else {
          result = await scanDownloadsFolder({ force: force && !isActiveDownloadInProgress() });
        }
        setVideos(result?.videos || []);
      } catch (e) {
        if (__DEV__) console.warn('[VideosScreen] load failed', e?.message || e);
        setVideos([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    })();

    loadInFlightRef.current = run;
    try {
      await run;
    } finally {
      if (loadInFlightRef.current === run) {
        loadInFlightRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const cached = getCachedSharedScan();
    if (cached?.videos?.length) {
      setVideos(cached.videos);
      setLoading(false);
    }
    loadVideos({ force: false });
  }, [loadVideos]);

  useEffect(() => subscribeSharedMedia(() => {
    if (isSharedMediaCacheFresh()) return;
    loadVideos({ force: false });
  }), [loadVideos]);

  useFocusEffect(useCallback(() => {
    launchingPlayerRef.current = false;
    if (!isSharedMediaCacheFresh()) {
      loadVideos({ force: false });
    }
  }, [loadVideos]));

  const launchPlayer = useCallback(async (videoIds, { fresh = false } = {}) => {
    if (!videoIds.length) {
      Alert.alert(t.videosGame, t.videosNoDownloaded);
      return;
    }
    if (launchingPlayerRef.current) return;
    launchingPlayerRef.current = true;
    try {
      if (fresh) await resetVideosPlayed();
      playSound('pop');
      router.push({
        pathname: '/video_player',
        params: {
          playlist: JSON.stringify(videoIds),
          startIndex: '0',
          parental: '1',
          ...(fresh ? { fresh: '1' } : {}),
        },
      });
    } finally {
      setTimeout(() => { launchingPlayerRef.current = false; }, 1500);
    }
  }, [playSound, resetVideosPlayed, router, t]);

  const handleVideoPress = useCallback((video) => {
    let playlist = videos.map((item) => item.videoId);
    if (parentalVideoLimit != null) {
      playlist = playlist.slice(0, parentalVideoLimit);
      if (!playlist.includes(video.videoId)) {
        Alert.alert(t.videosGame, t.parentalMaxVideosSelected(parentalVideoLimit));
        return;
      }
    }
    launchPlayer(playlist, { fresh: false });
  }, [videos, parentalVideoLimit, launchPlayer, t]);

  useEffect(() => {
    if (autoLaunchDoneRef.current) return;
    if (params.autoLaunch !== '1' || loading) return;
    autoLaunchDoneRef.current = true;
    (async () => {
      const ids = await getSharedVideoIds({ force: false });
      const limit = parentalVideoLimit ?? ids.length;
      const playlist = ids.slice(0, limit);
      if (playlist.length) launchPlayer(playlist, { fresh: true });
      else Alert.alert(t.videosGame, t.parentalNeedVideos);
    })();
  }, [params.autoLaunch, loading, parentalVideoLimit, launchPlayer, t]);

  const renderItem = useCallback(({ item }) => (
    <VideoGridCard video={item} onPress={handleVideoPress} width={cardWidth} />
  ), [cardWidth, handleVideoPress]);

  return (
    <View style={styles.container}>
      <AnimatedBackground />
      <Header title={t.videosGame} />

      {parentalVideoLimit != null && (
        <View style={styles.parentalBanner}>
          <Text style={styles.parentalBannerText}>
            🛡️ {t.parentalActiveVideos(parentalVideoLimit)}
          </Text>
        </View>
      )}

      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => { playSound('pop'); loadVideos({ showSpinner: true, force: true }); }}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Ionicons name="refresh" size={22} color="white" />
          )}
          <Text style={styles.refreshText}>{t.videosRefresh}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>{t.videosDownloadsHint}</Text>
      <Text style={styles.pathHint}>{SYSTEM_DOWNLOADS_LABEL}</Text>

      {Platform.OS === 'ios' ? (
        <Text style={styles.iosHint}>{t.videosIosHint}</Text>
      ) : null}

      {needsPermission ? (
        <TouchableOpacity
          style={styles.permissionBtn}
          onPress={() => loadVideos({ showSpinner: true, force: true })}
        >
          <Ionicons name="folder-open" size={18} color="white" />
          <Text style={styles.permissionBtnText}>{t.videosGrantAccess}</Text>
        </TouchableOpacity>
      ) : null}

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={TEAL} />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.videoId}
          renderItem={renderItem}
          numColumns={numColumns}
          key={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          initialNumToRender={10}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Ionicons name="film-outline" size={48} color="#888" />
              <Text style={styles.emptyText}>{t.videosNoDownloaded}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5E1' },
  parentalBanner: {
    marginHorizontal: 16, marginTop: 8, padding: 10,
    backgroundColor: '#9B59B6', borderRadius: 12,
  },
  parentalBannerText: {
    color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 14, textAlign: 'center',
  },
  toolbar: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 16, marginTop: 8,
  },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: TEAL, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  refreshText: { color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 13 },
  hint: {
    marginHorizontal: 16, marginTop: 8, fontFamily: 'Fredoka-SemiBold',
    fontSize: 12, color: '#666', textAlign: 'center',
  },
  pathHint: {
    marginHorizontal: 16, marginTop: 4, fontFamily: 'Fredoka-SemiBold',
    fontSize: 12, color: '#666', textAlign: 'center',
  },
  permissionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 32, marginTop: 10, backgroundColor: '#9B59B6',
    paddingVertical: 10, borderRadius: 20,
  },
  permissionBtnText: { color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 13 },
  iosHint: {
    marginHorizontal: 20, marginTop: 6, fontFamily: 'Fredoka-SemiBold',
    fontSize: 11, color: '#888', textAlign: 'center', lineHeight: 16,
  },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  row: { gap: 12, marginBottom: 12 },
  card: { marginBottom: 4 },
  thumb: {
    aspectRatio: 16 / 9, borderRadius: 14, backgroundColor: '#2c3e6b',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  subBadge: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: 4,
  },
  cardTitle: {
    marginTop: 6, fontFamily: 'Fredoka-SemiBold', fontSize: 13, color: '#333', textAlign: 'center',
  },
  loader: { marginTop: 40 },
  empty: { alignItems: 'center', marginTop: 48, gap: 12, paddingHorizontal: 24 },
  emptyText: { fontFamily: 'Fredoka-SemiBold', fontSize: 15, color: '#666', textAlign: 'center' },
});
