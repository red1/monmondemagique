import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStoryDownloadProgress } from '../../../contexts/StoryDownloadContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getStrings } from '../../../constants/Strings';
import { getAllPackages } from '../../services/storyService';

export default function StoryDownloadBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { downloadProgress, activeCount } = useStoryDownloadProgress();
  const { language } = useLanguage();
  const t = getStrings(language);

  const hiddenOnScreen = pathname === '/story_packages' || pathname === '/story_player';

  const summary = useMemo(() => {
    const entries = Object.entries(downloadProgress);
    if (!entries.length) return null;

    const avgProgress = entries.reduce((sum, [, dl]) => sum + (dl.progress ?? 0), 0) / entries.length;
    const primary = entries.sort((a, b) => (b[1].progress ?? 0) - (a[1].progress ?? 0))[0];
    const pack = getAllPackages().find((p) => p.id === primary[0]);
    const statusKey = primary[1]?.status ?? 'downloading';
    const statusLabel = (t.storiesDownloadStatus || getStrings('fr').storiesDownloadStatus)[statusKey] || statusKey;

    return {
      avgProgress,
      title: pack?.title || primary[0],
      statusLabel,
    };
  }, [downloadProgress, t]);

  if (hiddenOnScreen || activeCount === 0 || !summary) return null;

  return (
    <TouchableOpacity
      style={[styles.banner, { top: insets.top + 4 }]}
      onPress={() => router.push('/story_packages')}
      activeOpacity={0.9}
    >
      <ActivityIndicator color="white" size="small" />
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          ⬇️ {activeCount} {t.storiesDownloadsActive}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {summary.title} · {Math.round(summary.avgProgress * 100)}% · {summary.statusLabel}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="white" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(155, 89, 182, 0.95)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  textWrap: { flex: 1 },
  title: { color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 14 },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Fredoka-SemiBold', fontSize: 11, marginTop: 2 },
});
