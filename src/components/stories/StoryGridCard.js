import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import StoryCoverImage from '../shared/StoryCoverImage';
import { formatStoryDurationLabel } from '../../services/storyService';

function StoryGridCard({
  item,
  width,
  queueIdx,
  isQueued,
  willPlay,
  sourceName,
  displayThumbnail,
  fallbackThumbnail,
  onPress,
  t,
}) {
  const durationLabel = formatStoryDurationLabel(item);

  return (
    <TouchableOpacity
      style={[
        styles.storyCard,
        isQueued && styles.storyCardQueued,
        willPlay && styles.storyCardWillPlay,
        { width },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <StoryCoverImage
        thumbnail={displayThumbnail}
        fallbackThumbnail={fallbackThumbnail}
        contentType={item.contentType}
        style={styles.thumbnail}
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
      {item.packTitle ? (
        <Text style={styles.packSubtitle} numberOfLines={1}>{item.packTitle}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default memo(StoryGridCard, (prev, next) => (
  prev.item.storyId === next.item.storyId
  && prev.item.title === next.item.title
  && prev.item.thumbnail === next.item.thumbnail
  && prev.queueIdx === next.queueIdx
  && prev.isQueued === next.isQueued
  && prev.willPlay === next.willPlay
  && prev.displayThumbnail === next.displayThumbnail
  && prev.width === next.width
));

const styles = StyleSheet.create({
  storyCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  storyCardQueued: { borderWidth: 2, borderColor: '#FFD700' },
  storyCardWillPlay: { borderColor: '#32CD32' },
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
    fontSize: 14,
    color: '#333',
    paddingHorizontal: 10,
    paddingTop: 8,
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
  packSubtitle: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 10,
    color: '#aaa',
    paddingHorizontal: 10,
    paddingBottom: 8,
    paddingTop: 2,
  },
});
