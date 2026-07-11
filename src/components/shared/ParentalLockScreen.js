import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ParentalUnlockPanel from './ParentalUnlockPanel';

export default function ParentalLockScreen({
  title,
  message,
  hint,
  onUnlocked,
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View style={styles.messageArea}>
        <Text style={styles.emoji}>🌙✨</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>

      <View style={[styles.unlockFooter, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
        <ParentalUnlockPanel onUnlocked={onUnlocked} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  messageArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 16,
  },
  emoji: { fontSize: 64, marginBottom: 24 },
  title: {
    fontSize: 32,
    fontFamily: 'Fredoka-SemiBold',
    color: '#FFD700',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 28,
  },
  hint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 16,
    textAlign: 'center',
  },
  unlockFooter: {
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    backgroundColor: '#0d0d1a',
  },
});
