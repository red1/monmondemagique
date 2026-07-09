import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function formatTime(ms) {
  if (!ms) return '';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function ResumePlaylistModal({
  visible,
  onClose,
  progress,
  meta,
  onResumeStory,
  onStartNew,
  labels,
}) {
  const playlist = progress?.playlist || [];
  const currentIdx = progress?.currentStoryIndex ?? 0;
  const positionMs = progress?.positionMs ?? 0;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{labels.title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color="#666" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={playlist}
            keyExtractor={(id) => id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>{labels.empty}</Text>
            }
            renderItem={({ item: storyId, index }) => {
              const story = meta[storyId];
              const isCurrent = index === currentIdx;
              const showProgress = isCurrent && positionMs > 0;
              return (
                <TouchableOpacity
                  style={[styles.row, isCurrent && styles.rowCurrent]}
                  onPress={() => onResumeStory(index)}
                >
                  <View style={styles.rowLeft}>
                    <Text style={styles.rowIndex}>{index + 1}</Text>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {story?.title || storyId}
                      </Text>
                      {story?.artist ? (
                        <Text style={styles.rowArtist} numberOfLines={1}>{story.artist}</Text>
                      ) : null}
                      {showProgress ? (
                        <Text style={styles.rowProgress}>
                          {labels.continueAt(formatTime(positionMs))}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Ionicons name="play-circle" size={32} color={isCurrent ? '#32CD32' : '#00CED1'} />
                </TouchableOpacity>
              );
            }}
          />

          {onStartNew && playlist.length > 0 && (
            <TouchableOpacity style={styles.startNewBtn} onPress={onStartNew}>
              <Ionicons name="list" size={20} color="#9B59B6" />
              <Text style={styles.startNewText}>{labels.startNew}</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: { fontFamily: 'Fredoka-SemiBold', fontSize: 20, color: '#333' },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  empty: {
    textAlign: 'center',
    color: '#888',
    fontFamily: 'Fredoka-SemiBold',
    paddingVertical: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowCurrent: { backgroundColor: '#F0FFF0', borderRadius: 12, paddingHorizontal: 8 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  rowIndex: {
    width: 28,
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 16,
    color: '#00CED1',
    textAlign: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: 'Fredoka-SemiBold', fontSize: 15, color: '#333' },
  rowArtist: { fontFamily: 'Fredoka-SemiBold', fontSize: 12, color: '#888', marginTop: 2 },
  rowProgress: { fontFamily: 'Fredoka-SemiBold', fontSize: 12, color: '#32CD32', marginTop: 4 },
  startNewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 12, paddingVertical: 14,
    borderRadius: 14, borderWidth: 2, borderColor: '#9B59B6',
  },
  startNewText: { fontFamily: 'Fredoka-SemiBold', fontSize: 15, color: '#9B59B6' },
});
