import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PlaylistQueueBar({
  queue,
  meta,
  playLimit = null,
  onMoveUp,
  onMoveDown,
  onRemove,
  onPlay,
  onResume,
  onSave,
  labels,
}) {
  if (!queue.length) return null;

  const playCount = playLimit != null ? Math.min(playLimit, queue.length) : queue.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {labels.title(queue.length)}
        </Text>
        <View style={styles.headerRight}>
          {labels.endsAt ? (
            <Text style={styles.endsAtText}>{labels.endsAt}</Text>
          ) : null}
          {playLimit != null && (
            <Text style={styles.headerHint}>
              {labels.willPlay(playCount)}
            </Text>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {queue.map((storyId, index) => {
          const story = meta[storyId];
          const willPlay = index < playCount;
          return (
            <View
              key={storyId}
              style={[styles.item, willPlay && styles.itemWillPlay]}
            >
              <Text style={[styles.itemIndex, willPlay && styles.itemIndexActive]}>
                {index + 1}
              </Text>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {story?.title || storyId}
              </Text>
              <View style={styles.itemActions}>
                <TouchableOpacity
                  style={[styles.iconBtn, index === 0 && styles.iconBtnDisabled]}
                  onPress={() => onMoveUp(index)}
                  disabled={index === 0}
                >
                  <Ionicons name="chevron-up" size={18} color={index === 0 ? '#ccc' : '#00CED1'} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, index === queue.length - 1 && styles.iconBtnDisabled]}
                  onPress={() => onMoveDown(index)}
                  disabled={index === queue.length - 1}
                >
                  <Ionicons name="chevron-down" size={18} color={index === queue.length - 1 ? '#ccc' : '#00CED1'} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => onRemove(storyId)}>
                  <Ionicons name="close" size={18} color="#FF6347" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.playRow}>
        {onSave ? (
          <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
            <Ionicons name="bookmark-outline" size={20} color="#9B59B6" />
            <Text style={styles.saveBtnText}>{labels.save}</Text>
          </TouchableOpacity>
        ) : null}
        {onResume ? (
          <TouchableOpacity style={styles.resumeBtn} onPress={onResume}>
            <Ionicons name="play-circle" size={22} color="#32CD32" />
            <Text style={styles.resumeBtnText}>{labels.resume}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[styles.playBtn, (onResume || onSave) && styles.playBtnCompact]} onPress={onPlay}>
          <Ionicons name="play" size={22} color="white" />
          <Text style={styles.playBtnText}>{labels.play}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
    paddingHorizontal: 12,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  headerRight: { flexShrink: 1, alignItems: 'flex-end', gap: 2 },
  headerTitle: { fontFamily: 'Fredoka-SemiBold', fontSize: 14, color: '#333', flexShrink: 0 },
  headerHint: { fontFamily: 'Fredoka-SemiBold', fontSize: 12, color: '#32CD32' },
  endsAtText: { fontFamily: 'Fredoka-SemiBold', fontSize: 12, color: '#9B59B6', textAlign: 'right' },
  scroll: { maxHeight: 92, marginBottom: 10 },
  item: {
    width: 140,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 8,
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  itemWillPlay: { borderColor: '#32CD32', backgroundColor: '#F0FFF0' },
  itemIndex: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  itemIndexActive: { color: '#32CD32' },
  itemTitle: { fontFamily: 'Fredoka-SemiBold', fontSize: 12, color: '#333', minHeight: 32 },
  itemActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4, gap: 2 },
  iconBtn: { padding: 2 },
  iconBtnDisabled: { opacity: 0.4 },
  playRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 25,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: '#9B59B6',
    backgroundColor: '#F8F0FF',
  },
  saveBtnText: { color: '#9B59B6', fontFamily: 'Fredoka-SemiBold', fontSize: 13 },
  resumeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 25,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: '#32CD32',
    backgroundColor: '#F0FFF0',
  },
  resumeBtnText: { color: '#228B22', fontFamily: 'Fredoka-SemiBold', fontSize: 14 },
  playBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF69B4',
    borderRadius: 25,
    paddingVertical: 12,
  },
  playBtnCompact: { flex: 1.2 },
  playBtnText: { color: 'white', fontFamily: 'Fredoka-SemiBold', fontSize: 16 },
});
