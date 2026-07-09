import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useParentalControl } from '../../../contexts/ParentalControlContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getStrings } from '../../../constants/Strings';
import WarningBanner from './WarningBanner';

const WARNING_MS = 30 * 1000;

export default function ParentalLockOverlay() {
  const pathname = usePathname();
  const {
    isLocked, showWarning, remainingMs, session, dismissWarning, unlockScreen,
    getStoriesRemaining,
  } = useParentalControl();
  const { language } = useLanguage();
  const t = getStrings(language);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const handleUnlock = async () => {
    try {
      await unlockScreen(pin);
      setPin('');
      setPinError(false);
    } catch (_) {
      setPinError(true);
      Alert.alert(t.error, t.parentalWrongPin);
    }
  };

  const formatRemaining = (ms) => {
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  };

  const warningMessage = session?.mode === 'timer'
    ? t.parentalWarningTimer(formatRemaining(remainingMs || WARNING_MS))
    : t.parentalWarningStories(String(getStoriesRemaining() || 1));

  return (
    <>
      <WarningBanner
        visible={showWarning && !isLocked}
        title={t.parentalWarningTitle}
        message={warningMessage}
        onDismiss={dismissWarning}
      />

      <Modal visible={isLocked && pathname !== '/story_player'} animationType="fade">
        <View style={styles.lockScreen}>
          <Text style={styles.lockEmoji}>🌙✨</Text>
          <Text style={styles.lockTitle}>{t.parentalLockTitle}</Text>
          <Text style={styles.lockText}>{t.parentalLockDetail}</Text>
          <Text style={styles.lockHint}>{t.storiesBedtimeHint}</Text>

          <View style={styles.pinSection}>
            <Text style={styles.pinLabel}>{t.parentalUnlockLabel}</Text>
            <TextInput
              style={[styles.pinInput, pinError && styles.pinInputError]}
              value={pin}
              onChangeText={(v) => { setPin(v.replace(/\D/g, '').slice(0, 4)); setPinError(false); }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder="••••"
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
            <TouchableOpacity style={styles.unlockBtn} onPress={handleUnlock}>
              <Ionicons name="lock-open" size={22} color="white" />
              <Text style={styles.unlockBtnText}>{t.parentalUnlock}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  lockScreen: {
    flex: 1, backgroundColor: '#0d0d1a', alignItems: 'center',
    justifyContent: 'center', padding: 32,
  },
  lockEmoji: { fontSize: 64, marginBottom: 24 },
  lockTitle: { fontSize: 32, fontFamily: 'Fredoka-SemiBold', color: '#FFD700', marginBottom: 16 },
  lockText: { fontSize: 18, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 28 },
  lockHint: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 16, textAlign: 'center' },
  pinSection: { marginTop: 40, width: '100%', maxWidth: 280, alignItems: 'center', gap: 12 },
  pinLabel: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontFamily: 'Fredoka-SemiBold' },
  pinInput: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 20, fontSize: 24, color: 'white',
    textAlign: 'center', letterSpacing: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
  },
  pinInputError: { borderColor: '#FF6347' },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#00CED1', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 25,
  },
  unlockBtnText: { color: 'white', fontSize: 16, fontFamily: 'Fredoka-SemiBold' },
});
