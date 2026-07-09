import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image,
  TextInput, useWindowDimensions, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Header from '../components/shared/Header';
import AnimatedBackground from '../components/shared/AnimatedBackground';
import { useSounds } from '../../contexts/SoundContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoryDownload } from '../../contexts/StoryDownloadContext';
import { getStrings } from '../../constants/Strings';
import {
  getSources, filterPackages,
  getPackagesMeta, deletePackage, getCatalogInstallStates,
  fetchPackageSizes, formatBytes,
} from '../services/storyService';

export default function StoryPackagesScreen() {
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const numColumns = isTablet ? 3 : 2;

  const [nameFilter, setNameFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [packagesMeta, setPackagesMeta] = useState({});
  const [installStates, setInstallStates] = useState({});
  const {
    downloadProgress, packSizes, setPackSizes, activeCount,
    startDownload, cancelDownload, pauseDownload,
  } = useStoryDownload();
  const retryTriggeredRef = useRef(false);
  const params = useLocalSearchParams();

  const sources = getSources();

  const refreshMeta = useCallback(async () => {
    const [meta, states] = await Promise.all([
      getPackagesMeta(),
      getCatalogInstallStates(),
    ]);
    setPackagesMeta(meta);
    setInstallStates(states);
  }, []);

  useEffect(() => { refreshMeta(); }, [refreshMeta]);

  useFocusEffect(useCallback(() => {
    refreshMeta();
  }, [refreshMeta]));

  const prevActiveCount = useRef(activeCount);
  useEffect(() => {
    if (prevActiveCount.current > activeCount) {
      refreshMeta();
    }
    prevActiveCount.current = activeCount;
  }, [activeCount, refreshMeta]);

  const filteredPackages = useMemo(() => filterPackages({
    name: nameFilter,
    source: sourceFilter,
  }), [nameFilter, sourceFilter]);

  useEffect(() => {
    let cancelled = false;
    const visible = filteredPackages.slice(0, 40);
    fetchPackageSizes(visible).then((sizes) => {
      if (!cancelled && Object.keys(sizes).length) {
        setPackSizes((prev) => ({ ...prev, ...sizes }));
      }
    });
    return () => { cancelled = true; };
  }, [filteredPackages, setPackSizes]);

  const handleDownload = useCallback((packId) => {
    startDownload(packId);
  }, [startDownload]);

  const handleStopDownload = useCallback((packId) => {
    cancelDownload(packId);
  }, [cancelDownload]);

  const handlePauseDownload = useCallback((packId) => {
    pauseDownload(packId);
  }, [pauseDownload]);

  useEffect(() => {
    const retryPackId = params.retry || params.retryPack;
    if (!retryPackId || retryTriggeredRef.current) return;
    retryTriggeredRef.current = true;
    const timer = setTimeout(() => handleDownload(String(retryPackId)), 800);
    return () => clearTimeout(timer);
  }, [params.retry, params.retryPack, handleDownload]);

  const handleDelete = (packId, title) => {
    Alert.alert(
      t.delete,
      t.storiesDeletePack(title),
      [
        { text: t.back, style: 'cancel' },
        {
          text: t.delete,
          style: 'destructive',
          onPress: async () => {
            await deletePackage(packId);
            await refreshMeta();
            playSound('pop');
          },
        },
      ],
    );
  };

  const renderPackage = ({ item }) => {
    const packMeta = packagesMeta[item.id];
    const installState = installStates[item.id] || (packMeta?.localPath ? 'complete' : 'none');
    const isDownloaded = installState === 'complete';
    const isPartial = installState === 'partial';
    const dl = downloadProgress[item.id];
    const isDownloading = dl != null;
    const progress = dl?.progress ?? 0;
    const statusKey = dl?.status ?? 'preparing';
    const statusLabel = (t.storiesDownloadStatus || getStrings('fr').storiesDownloadStatus)[statusKey] || statusKey;
    const sourceName = sources.find((s) => s.id === item.source)?.name || item.source;
    const sizeBytes = packSizes[item.id];
    const sizeLabel = sizeBytes ? formatBytes(sizeBytes) : null;
    const bytesWritten = dl?.bytesWritten;
    const totalBytes = dl?.totalBytes || sizeBytes;
    const byteProgressLabel = totalBytes && bytesWritten != null
      ? t.storiesDownloadProgress(formatBytes(bytesWritten), formatBytes(totalBytes))
      : sizeLabel;
    const canPause = statusKey === 'downloading' || statusKey === 'paused';

    return (
      <View style={[styles.packCard, { width: (width - 48) / numColumns - 8 }]}>
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} resizeMode="cover" />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <Ionicons name="archive" size={40} color="#9B59B6" />
          </View>
        )}
        {isDownloaded && !isDownloading && (
          <View style={styles.downloadedBadge}>
            <Ionicons name="cloud-done" size={18} color="white" />
            <Text style={styles.badgeText}>{packMeta.storyCount || '?'}</Text>
          </View>
        )}
        {isPartial && !isDownloading && (
          <View style={[styles.downloadedBadge, styles.partialBadge]}>
            <Ionicons name="cloud-offline" size={18} color="white" />
            <Text style={styles.badgeText}>{packMeta?.storyCount || '!'}</Text>
          </View>
        )}
        <Text style={styles.packTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.packMeta}>
          {sourceName}
          {sizeLabel && !isDownloading ? ` · ${sizeLabel}` : ''}
        </Text>

        {isDownloading ? (
          <View style={styles.downloadingBar}>
            <ActivityIndicator color="#9B59B6" size="small" />
            <View style={styles.downloadingInfo}>
              <Text style={styles.downloadingText}>{Math.round(progress * 100)}%</Text>
              {byteProgressLabel ? (
                <Text style={styles.downloadingBytes} numberOfLines={1}>{byteProgressLabel}</Text>
              ) : null}
              <Text style={styles.downloadingStatus} numberOfLines={1}>{statusLabel}</Text>
              {dl?.storiesSaved ? (
                <Text style={styles.downloadingSaved} numberOfLines={1}>
                  {t.storiesPartialSaved(dl.storiesSaved)}
                </Text>
              ) : null}
            </View>
            <View style={styles.downloadControls}>
              {canPause && (
                <TouchableOpacity
                  style={styles.downloadControlBtn}
                  onPress={() => handlePauseDownload(item.id)}
                >
                  <Ionicons
                    name={statusKey === 'paused' ? 'play' : 'pause'}
                    size={16}
                    color="white"
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.downloadControlBtn, styles.stopBtn]}
                onPress={() => handleStopDownload(item.id)}
              >
                <Ionicons name="stop" size={16} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            {isDownloaded ? (
              <>
                <TouchableOpacity style={styles.redownloadBtn} onPress={() => handleDownload(item.id)}>
                  <Ionicons name="refresh" size={18} color="white" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.title)}>
                  <Ionicons name="trash" size={18} color="white" />
                </TouchableOpacity>
              </>
            ) : isPartial ? (
              <>
                <TouchableOpacity style={styles.resumeBtn} onPress={() => handleDownload(item.id)}>
                  <Ionicons name="play-forward" size={18} color="white" />
                  <Text style={styles.resumeBtnText}>{t.storiesResumeDownload}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.title)}>
                  <Ionicons name="trash" size={18} color="white" />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.downloadBtn} onPress={() => handleDownload(item.id)}>
                <Ionicons name="cloud-download" size={22} color="white" />
                <Text style={styles.downloadBtnText}>{t.storiesDownloadPack}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const listHeader = (
    <View style={styles.filters}>
      <Text style={styles.hint}>{t.storiesCatalogHint}</Text>
      {activeCount > 0 && (
        <Text style={styles.downloadsHint}>
          ⬇️ {activeCount} {t.storiesDownloadsActive}
        </Text>
      )}
      <TextInput
        style={styles.filterInput}
        placeholder={t.storiesSearchPlaceholder}
        placeholderTextColor="#999"
        value={nameFilter}
        onChangeText={setNameFilter}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, !sourceFilter && styles.filterChipActive]}
          onPress={() => setSourceFilter('')}
        >
          <Text style={[styles.filterChipText, !sourceFilter && styles.filterChipTextActive]}>
            {t.storiesAllSources}
          </Text>
        </TouchableOpacity>
        {sources.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.filterChip, sourceFilter === s.id && styles.filterChipActive]}
            onPress={() => setSourceFilter(s.id)}
          >
            <Text style={[styles.filterChipText, sourceFilter === s.id && styles.filterChipTextActive]}>
              {s.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <AnimatedBackground />
      <Header title={`📦 ${t.storiesCatalog}`} backFallback="/stories" />

      <FlatList
        data={filteredPackages}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={numColumns}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={listHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 16) }]}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        renderItem={renderPackage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5E1' },
  filters: { paddingTop: 8, paddingBottom: 12, gap: 8 },
  hint: { fontSize: 13, color: '#666', fontFamily: 'Fredoka-SemiBold', textAlign: 'center' },
  downloadsHint: {
    fontSize: 13, color: '#9B59B6', fontFamily: 'Fredoka-SemiBold', textAlign: 'center',
  },
  filterInput: {
    backgroundColor: 'white', borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 16, fontFamily: 'Fredoka-SemiBold',
    borderWidth: 2, borderColor: '#9B59B6',
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: '#ddd',
  },
  filterChipActive: { backgroundColor: '#9B59B6', borderColor: '#9B59B6' },
  filterChipText: { fontSize: 13, fontFamily: 'Fredoka-SemiBold', color: '#333' },
  filterChipTextActive: { color: 'white' },
  listContent: { paddingHorizontal: 16 },
  columnWrapper: { justifyContent: 'flex-start', gap: 8 },
  packCard: {
    backgroundColor: 'white', borderRadius: 16, marginBottom: 12,
    overflow: 'hidden', elevation: 4,
  },
  thumbnail: { width: '100%', height: 120, backgroundColor: '#f0f0f0' },
  thumbnailPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  downloadedBadge: {
    position: 'absolute', top: 8, left: 8, backgroundColor: '#32CD32',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  partialBadge: { backgroundColor: '#F39C12' },
  badgeText: { color: 'white', fontSize: 12, fontFamily: 'Fredoka-SemiBold' },
  packTitle: {
    fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#333',
    padding: 8, paddingBottom: 2,
  },
  packMeta: { fontSize: 11, color: '#888', paddingHorizontal: 8, paddingBottom: 8 },
  downloadingBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, paddingHorizontal: 8,
  },
  downloadingInfo: { flex: 1, alignItems: 'center' },
  downloadingText: { color: '#9B59B6', fontFamily: 'Fredoka-SemiBold', fontSize: 14 },
  downloadingBytes: { color: '#666', fontFamily: 'Fredoka-SemiBold', fontSize: 11, marginTop: 2 },
  downloadingStatus: { color: '#888', fontFamily: 'Fredoka-SemiBold', fontSize: 11, marginTop: 2 },
  downloadingSaved: { color: '#32CD32', fontFamily: 'Fredoka-SemiBold', fontSize: 10, marginTop: 2 },
  downloadControls: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  downloadControlBtn: {
    backgroundColor: '#9B59B6', borderRadius: 16, width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  stopBtn: { backgroundColor: '#FF6347' },
  actions: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    paddingHorizontal: 8, paddingBottom: 10,
  },
  downloadBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#9B59B6', borderRadius: 20, paddingVertical: 10,
  },
  downloadBtnText: { color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 13 },
  redownloadBtn: {
    backgroundColor: '#00CED1', borderRadius: 20, padding: 10,
  },
  resumeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#F39C12', borderRadius: 20, paddingVertical: 10,
  },
  resumeBtnText: { color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 13 },
  deleteBtn: {
    backgroundColor: '#FF6347', borderRadius: 20, padding: 10,
  },
});
