import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Pressable, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function formatTime(ms) {
  if (!ms) return '';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function SavedPlaylistsModal({
  visible,
  onClose,
  playlists,
  meta,
  onLoadQueue,
  onPlayFresh,
  onResume,
  onDelete,
  labels,
}) {
  const confirmDelete = (playlist) => {
    Alert.alert(
      labels.deleteTitle,
      labels.deleteMessage(playlist.name),
      [
        { text: labels.cancel, style: 'cancel' },
        { text: labels.delete, style: 'destructive', onPress: () => onDelete(playlist.id) },
      ],
    );
  };

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
            data={playlists}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>{labels.empty}</Text>
            }
            renderItem={({ item }) => {
              const hasProgress = Boolean(item.progress);
              const progressStory = hasProgress
                ? meta[item.storyIds[item.progress.currentStoryIndex]]
                : null;
              return (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="bookmark" size={22} color="#9B59B6" />
                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
                      <Text style={styles.cardMeta}>
                        {labels.storyCount(item.storyIds.length)}
                      </Text>
                      {hasProgress && progressStory ? (
                        <Text style={styles.cardProgress}>
                          {labels.continueAt(
                            progressStory.title || progressStory.storyId,
                            formatTime(item.progress.positionMs),
                          )}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => confirmDelete(item)}
                    >
                      <Ionicons name="trash-outline" size={20} color="#FF6347" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => onLoadQueue(item)}
                    >
                      <Ionicons name="list" size={18} color="#00CED1" />
                      <Text style={styles.actionText}>{labels.loadQueue}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnPrimary]}
                      onPress={() => onPlayFresh(item)}
                    >
                      <Ionicons name="play" size={18} color="white" />
                      <Text style={[styles.actionText, styles.actionTextPrimary]}>
                        {labels.play}
                      </Text>
                    </TouchableOpacity>
                    {hasProgress ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnResume]}
                        onPress={() => onResume(item)}
                      >
                        <Ionicons name="play-circle" size={18} color="#228B22" />
                        <Text style={[styles.actionText, styles.actionTextResume]}>
                          {labels.resume}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            }}
          />
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
    maxHeight: '78%',
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
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  empty: {
    textAlign: 'center',
    color: '#888',
    fontFamily: 'Fredoka-SemiBold',
    paddingVertical: 32,
  },
  card: {
    backgroundColor: '#fafafa',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardText: { flex: 1 },
  cardTitle: { fontFamily: 'Fredoka-SemiBold', fontSize: 16, color: '#333' },
  cardMeta: { fontFamily: 'Fredoka-SemiBold', fontSize: 12, color: '#888', marginTop: 2 },
  cardProgress: { fontFamily: 'Fredoka-SemiBold', fontSize: 12, color: '#32CD32', marginTop: 4 },
  deleteBtn: { padding: 4 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#00CED1',
    backgroundColor: 'white',
  },
  actionBtnPrimary: { backgroundColor: '#FF69B4', borderColor: '#FF69B4' },
  actionBtnResume: { borderColor: '#32CD32', backgroundColor: '#F0FFF0' },
  actionText: { fontFamily: 'Fredoka-SemiBold', fontSize: 12, color: '#00CED1' },
  actionTextPrimary: { color: 'white' },
  actionTextResume: { color: '#228B22' },
});
