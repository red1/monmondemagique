import React, { memo, useEffect, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const prefetchedUris = new Set();

function StoryCoverImage({
  thumbnail, fallbackThumbnail, contentType, style, placeholderStyle,
}) {
  const [uri, setUri] = useState(thumbnail || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUri(thumbnail || null);
    setFailed(false);
    if (thumbnail && !prefetchedUris.has(thumbnail)) {
      prefetchedUris.add(thumbnail);
      Image.prefetch(thumbnail).catch(() => {});
    }
  }, [thumbnail]);

  const showPlaceholder = !uri || failed;

  if (showPlaceholder) {
    const iconName = contentType === 'song' ? 'musical-notes' : 'book';
    return (
      <View style={[style, styles.placeholder, placeholderStyle]}>
        <Ionicons name={iconName} size={40} color="#00CED1" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode="cover"
      onError={() => {
        if (fallbackThumbnail && uri !== fallbackThumbnail) {
          setUri(fallbackThumbnail);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

export default memo(StoryCoverImage);

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
  },
});
