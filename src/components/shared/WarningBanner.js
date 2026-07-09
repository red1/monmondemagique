import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function WarningBanner({
  visible,
  title,
  message,
  onDismiss,
  autoDismissMs = 8000,
}) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return undefined;
    const id = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(id);
  }, [visible, autoDismissMs, onDismiss]);

  if (!visible) return null;

  return (
    <View
      style={[styles.wrapper, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      <View style={styles.banner}>
        <Text style={styles.emoji}>🌙</Text>
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.message} numberOfLines={2}>{message}</Text>
        </View>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={20} color="#666" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 12,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    borderWidth: 2,
    borderColor: '#00CED1',
  },
  emoji: { fontSize: 28 },
  textCol: { flex: 1 },
  title: { fontSize: 15, fontFamily: 'Fredoka-SemiBold', color: '#00CED1' },
  message: { fontSize: 13, color: '#444', marginTop: 2, lineHeight: 18 },
  closeBtn: { padding: 4 },
});
