import React, { memo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import StoryCoverImage from '../shared/StoryCoverImage';
import { formatStoryDurationLabel } from '../../services/storyService';

function StoryGridCard({
  item,
  width,
  thumbnailHeight = 120,
  queueIdx,
  isQueued,
  willPlay,
  sourceName,
  displayThumbnail,
  fallbackThumbnail,
  onPress,
  onLongPress,
  onInfoPress,
  t,
}) {
  const durationLabel = formatStoryDurationLabel(item);
  const longPressHandledRef = useRef(false);

  const handlePress = () => {
    if (longPressHandledRef.current) {
      longPressHandledRef.current = false;
      return;
    }
    onPress?.();
  };

  const handleLongPress = () => {
    longPressHandledRef.current = true;
    onLongPress?.();
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.storyCard,
        isQueued && styles.storyCardQueued,
        willPlay && styles.storyCardWillPlay,
        { width, opacity: pressed ? 0.85 : 1 },
      ]}
      onPressIn={() => { longPressHandledRef.current = false; }}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={400}
    >
      {onInfoPress ? (
        <TouchableOpacity
          style={styles.infoBtn}
          onPress={(e) => {
            e.stopPropagation?.();
            onInfoPress();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="create-outline" size={16} color="#9B59B6" />
        </TouchableOpacity>
      ) : null}
      <StoryCoverImage
        thumbnail={displayThumbnail}
        fallbackThumbnail={fallbackThumbnail}
        contentType={item.contentType}
        style={[styles.thumbnail, { height: thumbnailHeight }]}
      />
      {isQueued && (
        <View style={[styles.queueBadge, willPlay && styles.queueBadgeActive]}>
          <Text style={styles.queueBadgeText}>{queueIdx + 1}</Text>
        </View>
      )}
      <Text style={styles.storyTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.storyMeta} numberOfLines={1}>
        {sourceName}
        {item.contentType === 'song' ? ` · ${t.storiesTypeSong}` : item.contentType === 'story' ? ` · ${t.storiesTypeStory}` : ''}
        {durationLabel ? ` · ${durationLabel}` : ''}
      </Text>
      {item.artist ? (
        <Text style={styles.artistText} numberOfLines={1}>{item.artist}</Text>
      ) : null}
      {item.genre ? (
        <Text style={styles.metaTag} numberOfLines={1}>{item.genre}</Text>
      ) : null}
      {item.extraInfo ? (
        <Text style={styles.extraInfoTag} numberOfLines={1}>{item.extraInfo}</Text>
      ) : null}
      {item.packTitle ? (
        <Text style={styles.packSubtitle} numberOfLines={1}>{item.packTitle}</Text>
      ) : null}
    </Pressable>
  );
}

export default memo(StoryGridCard, (prev, next) => (
  prev.item.storyId === next.item.storyId
  && prev.item.title === next.item.title
  && prev.item.thumbnail === next.item.thumbnail
  && prev.item.extraInfo === next.item.extraInfo
  && prev.item.durationMs === next.item.durationMs
  && prev.item.durationMinutes === next.item.durationMinutes
  && prev.queueIdx === next.queueIdx
  && prev.isQueued === next.isQueued
  && prev.willPlay === next.willPlay
  && prev.displayThumbnail === next.displayThumbnail
  && prev.width === next.width
  && prev.thumbnailHeight === next.thumbnailHeight
  && prev.onPress === next.onPress
  && prev.onLongPress === next.onLongPress
  && prev.onInfoPress === next.onInfoPress
));

const styles = StyleSheet.create({
  storyCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  storyCardQueued: { borderWidth: 2, borderColor: '#FFD700' },
  storyCardWillPlay: { borderColor: '#32CD32' },
  infoBtn: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  thumbnail: { width: '100%', height: 120, backgroundColor: '#f0f0f0' },
  queueBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFD700',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  queueBadgeActive: { backgroundColor: '#32CD32' },
  queueBadgeText: { fontFamily: 'Fredoka-SemiBold', fontSize: 12, color: 'white' },
  storyTitle: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 12,
    color: '#333',
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  storyMeta: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 11,
    color: '#888',
    paddingHorizontal: 10,
    paddingTop: 2,
  },
  artistText: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 11,
    color: '#9B59B6',
    fontStyle: 'italic',
    paddingHorizontal: 10,
    paddingTop: 2,
  },
  metaTag: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 10,
    color: '#00CED1',
    paddingHorizontal: 10,
    paddingTop: 2,
  },
  extraInfoTag: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 10,
    color: '#FF69B4',
    paddingHorizontal: 10,
    paddingTop: 2,
    fontStyle: 'italic',
  },
  packSubtitle: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 10,
    color: '#aaa',
    paddingHorizontal: 10,
    paddingBottom: 8,
    paddingTop: 2,
  },
});
