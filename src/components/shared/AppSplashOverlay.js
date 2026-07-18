import React from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getStrings } from '../../../constants/Strings';

export default function AppSplashOverlay({ visible }) {
  const { language } = useLanguage();
  const t = getStrings(language);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <LinearGradient
        colors={['#00CED1', '#9B59B6', '#FFD700']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <Text style={styles.emoji}>✨</Text>
        <Text style={styles.title}>{t.appName}</Text>
        <ActivityIndicator size="large" color="#ffffff" style={styles.loader} />
        <Text style={styles.subtitle}>{t.appLoading}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 32,
    color: 'white',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 4,
    marginBottom: 28,
  },
  loader: {
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 16,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
  },
});
