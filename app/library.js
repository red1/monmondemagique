import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Alert, Dimensions, Share, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getCachedStorageMulti, setCachedStorageItem, invalidateStorageCache,
} from '../src/utils/asyncStorageCache';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Header from '../src/components/shared/Header';
import { useSounds } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getStrings } from '../constants/Strings';
import {
  subscribeSharedMedia, getCachedSharedScan, scanDownloadsFolder,
  requestDownloadsAccess, isSharedMediaCacheFresh,
} from '../src/services/sharedMediaService';
import { refreshSharedDownloads, isActiveDownloadInProgress } from '../src/services/storyService';
import { convertToSketch } from '../src/utils/imageFilters';

const { width } = Dimensions.get('window');

/**
 * 📚 MON MONDE MAGIQUE - IMAGE LIBRARY
 * ---------------------------------------------------------
 * MANDATORY FEATURES REGISTRY (DO NOT REMOVE):
 * [FEAT-01] Local Assets: Loads from assets/coloriages/ via require.context.
 * [FEAT-02] User Drawings: Loads from AsyncStorage USER_DRAWINGS.
 * [FEAT-03] Delete Action: Confirmed deletion for user drawings.
 * [FEAT-04] Hide Action: Logic to "hide" local assets from view.
 * [FEAT-05] Pin Action: Keep images at top of gallery.
 */

// Dynamically load all local drawings from assets/coloriages
const localColoriages = require.context('../assets/coloriages', false, /\.(png|jpe?g|webp)$/);

export default function Library() {
  const router = useRouter();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);
  const [userDrawings, setUserDrawings] = useState([]);
  const [pinnedIds, setPinnedIds] = useState([]);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [downloadImages, setDownloadImages] = useState([]);
  const [loadingDownloads, setLoadingDownloads] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);

  const loadDownloads = useCallback(async ({ force = false, showSpinner = false } = {}) => {
    if (showSpinner) setRefreshing(true);
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

      setDownloadImages((result?.images || []).map((img) => ({
        id: img.imageId,
        uri: img.uri,
        title: img.title,
        isDownload: true,
      })));
    } catch (e) {
      setDownloadImages([]);
    } finally {
      setLoadingDownloads(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const cached = getCachedSharedScan();
    if (cached?.images?.length) {
      setDownloadImages(cached.images.map((img) => ({
        id: img.imageId,
        uri: img.uri,
        title: img.title,
        isDownload: true,
      })));
      setLoadingDownloads(false);
    }
    loadDownloads({ force: false });
  }, [loadDownloads]);

  useEffect(() => subscribeSharedMedia(() => {
    if (isSharedMediaCacheFresh()) return;
    loadDownloads({ force: false });
  }), [loadDownloads]);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
      if (!isSharedMediaCacheFresh()) {
        loadDownloads({ force: false });
      }
    }, [loadDownloads])
  );

  const loadData = async ({ force = false } = {}) => {
    try {
      const data = await getCachedStorageMulti(
        ['USER_DRAWINGS', 'PINNED_IMAGES', 'HIDDEN_IMAGES'],
        { force },
      );
      setUserDrawings(data.USER_DRAWINGS || []);
      setPinnedIds(data.PINNED_IMAGES || []);
      setHiddenIds(data.HIDDEN_IMAGES || []);
    } catch (e) {
      console.error('Failed to load library data', e);
    }
  };

  const allImages = useMemo(() => {
    const local = localColoriages.keys().map(key => ({
      id: key,
      uri: localColoriages(key),
      title: key.replace('./', '').replace(/\.(png|jpg|jpeg)$/, '').replace(/[-_]/g, ' '),
      isNew: true
    }));

    const list = [
      { id: 'blank', uri: 'blank', title: t.blankPage, isBlank: true },
      ...downloadImages,
      ...userDrawings,
      ...local
    ].filter(img => !hiddenIds.includes(img.id));

    return list.sort((a, b) => {
      if (a.id === 'blank') return -1;
      if (b.id === 'blank') return 1;
      const aPinned = pinnedIds.includes(a.id);
      const bPinned = pinnedIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  }, [userDrawings, pinnedIds, hiddenIds, downloadImages, language, t.blankPage]);

  const handleSelect = async (item) => {
    playSound('pop');
    if (item.isDownload) {
      try {
        const sketchUri = await convertToSketch(item.uri);
        router.push({
          pathname: '/coloring',
          params: { selectedImage: sketchUri },
        });
      } catch (error) {
        Alert.alert(t.back === 'Retour' ? 'Erreur' : 'Error', t.coloringNoDownloadedImages);
      }
      return;
    }
    router.push({
      pathname: '/coloring',
      params: { selectedImage: item.uri }
    });
  };

  const handleDelete = async (item) => {
    playSound('pop');
    Alert.alert(
      t.delete,
      t.back === 'Retour' ? `Es-tu sûr de vouloir supprimer "${item.title}" ?` : `Are you sure you want to delete "${item.title}"?`,
      [
        { text: t.back === 'Retour' ? 'Annuler' : 'Cancel', style: 'cancel' },
        { 
          text: t.delete, 
          style: 'destructive',
          onPress: async () => {
            if (item.isUser) {
                const updated = userDrawings.filter(d => d.id !== item.id);
                setUserDrawings(updated);
                await AsyncStorage.setItem('USER_DRAWINGS', JSON.stringify(updated));
                setCachedStorageItem('USER_DRAWINGS', updated);
                if (item.uri.startsWith('file://')) {
                    await FileSystem.deleteAsync(item.uri, { idempotent: true });
                }
            } else {
                const updatedHidden = [...hiddenIds, item.id];
                setHiddenIds(updatedHidden);
                await AsyncStorage.setItem('HIDDEN_IMAGES', JSON.stringify(updatedHidden));
                setCachedStorageItem('HIDDEN_IMAGES', updatedHidden);
            }
            playSound('success');
          }
        }
      ]
    );
  };

  const handleShare = async (item) => {
    playSound('pop');
    try {
      if (item.isBlank) return;
      if (item.uri.toString().startsWith('http') || item.uri.toString().startsWith('file')) {
          await Sharing.shareAsync(item.uri.toString());
      } else {
          Alert.alert(t.back === 'Retour' ? 'Info' : 'Info', t.back === 'Retour' ? "Cette image ne peut pas être partagée directement." : "This image cannot be shared directly.");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const togglePin = async (item) => {
    playSound('pop');
    let updated;
    if (pinnedIds.includes(item.id)) {
        updated = pinnedIds.filter(id => id !== item.id);
    } else {
        updated = [...pinnedIds, item.id];
    }
    setPinnedIds(updated);
    await AsyncStorage.setItem('PINNED_IMAGES', JSON.stringify(updated));
    setCachedStorageItem('PINNED_IMAGES', updated);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleSelect(item)}>
      <View style={styles.imageContainer}>
        {item.isBlank ? (
          <View style={[styles.image, styles.blankCard]}>
            <Ionicons name="document-outline" size={60} color="#999" />
          </View>
        ) : (
          <Image source={typeof item.uri === 'number' ? item.uri : { uri: item.uri }} style={styles.image} resizeMode="contain" />
        )}
        
        {item.isNew && <View style={styles.badge}><Text style={styles.badgeText}>{t.nouveau}</Text></View>}
        {item.isUser && <View style={[styles.badge, {backgroundColor: '#FF69B4'}]}><Text style={styles.badgeText}>{t.moi}</Text></View>}
        {item.isDownload && <View style={[styles.badge, {backgroundColor: '#1E90FF'}]}><Text style={styles.badgeText}>{t.coloringDownloadBadge}</Text></View>}
        
        <TouchableOpacity style={styles.pinBtn} onPress={() => togglePin(item)}>
          <Ionicons name={pinnedIds.includes(item.id) ? "pin" : "pin-outline"} size={20} color={pinnedIds.includes(item.id) ? "#FFD700" : "white"} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.cardFooter}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.actions}>
          {!item.isBlank && (
            <>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(item)}>
                <Ionicons name="share-social" size={20} color="#1E90FF" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
                <Ionicons name="trash" size={20} color="#FF6347" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header
        title={`✨ ${t.library}`}
        rightComponent={(
          <TouchableOpacity onPress={() => loadDownloads({ force: true, showSpinner: true })}>
            <Ionicons name="refresh" size={26} color="white" />
          </TouchableOpacity>
        )}
      />
      {needsPermission && (
        <TouchableOpacity style={styles.permissionBanner} onPress={() => loadDownloads({ force: true })}>
          <Text style={styles.permissionText}>{t.videosGrantAccess}</Text>
        </TouchableOpacity>
      )}
      {!loadingDownloads && downloadImages.length === 0 && !needsPermission && (
        <Text style={styles.hintText}>{t.videosDownloadsHint}</Text>
      )}
      <FlatList
        data={allImages}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadDownloads({ force: true, showSpinner: true })}
          />
        )}
        ListEmptyComponent={loadingDownloads ? (
          <ActivityIndicator size="large" color="#FF69B4" style={{ marginTop: 40 }} />
        ) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5E1' },
  list: { padding: 10 },
  card: { flex: 1, margin: 8, backgroundColor: 'white', borderRadius: 20, elevation: 4, overflow: 'hidden' },
  imageContainer: { width: '100%', height: 150, backgroundColor: '#f9f9f9', position: 'relative' },
  image: { width: '100%', height: '100%' },
  blankCard: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#eee' },
  badge: { position: 'absolute', top: 10, left: 10, backgroundColor: '#76D256', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: 'white', fontSize: 10, fontFamily: 'Fredoka-SemiBold' },
  pinBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.3)', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  cardFooter: { padding: 10 },
  cardTitle: { fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#333', textTransform: 'capitalize', marginBottom: 5 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  actionBtn: { padding: 5, backgroundColor: '#f0f0f0', borderRadius: 8 },
  permissionBanner: {
    marginHorizontal: 12, marginTop: 8, padding: 12, backgroundColor: '#FFF3CD',
    borderRadius: 12, borderWidth: 1, borderColor: '#FFE08A',
  },
  permissionText: { color: '#856404', fontFamily: 'Fredoka-SemiBold', textAlign: 'center' },
  hintText: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 4, color: '#666',
    fontFamily: 'Fredoka-Regular', textAlign: 'center', fontSize: 13,
  },
});
