import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useParentalControl } from '../../../contexts/ParentalControlContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getStrings } from '../../../constants/Strings';
import { createParentalMathChallenge } from '../../utils/parentalMathChallenge';

export default function ParentalUnlockPanel({ onUnlocked }) {
  const { unlockScreen, unlockAfterMathVerification } = useParentalControl();
  const { language } = useLanguage();
  const t = getStrings(language);

  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState('pin');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [mathChallenge, setMathChallenge] = useState(createParentalMathChallenge);
  const [mathAnswer, setMathAnswer] = useState('');
  const [mathError, setMathError] = useState(false);

  const resetErrors = useCallback(() => {
    setPinError(false);
    setMathError(false);
  }, []);

  const handleUnlocked = useCallback(() => {
    setPin('');
    setMathAnswer('');
    resetErrors();
    setMode('pin');
    setExpanded(false);
    onUnlocked?.();
  }, [onUnlocked, resetErrors]);

  const switchToMath = useCallback(() => {
    setMathChallenge(createParentalMathChallenge());
    setMathAnswer('');
    resetErrors();
    setMode('math');
  }, [resetErrors]);

  const switchToPin = useCallback(() => {
    setPin('');
    resetErrors();
    setMode('pin');
  }, [resetErrors]);

  const handleUnlock = async () => {
    if (mode === 'math') {
      if (Number(mathAnswer) !== mathChallenge.answer) {
        setMathError(true);
        setMathChallenge(createParentalMathChallenge());
        setMathAnswer('');
        Alert.alert(t.error, t.parentalResetMathWrong);
        return;
      }
      try {
        await unlockAfterMathVerification();
        handleUnlocked();
      } catch (_) {
        Alert.alert(t.error, t.parentalResetMathWrong);
      }
      return;
    }

    try {
      await unlockScreen(pin);
      handleUnlocked();
    } catch (_) {
      setPinError(true);
      Alert.alert(t.error, t.parentalWrongPin);
    }
  };

  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.parentGateBtn}
        onPress={() => setExpanded(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t.parentalUnlockParents}
      >
        <Ionicons name="lock-open-outline" size={24} color="white" />
        <Text style={styles.parentGateBtnText}>{t.parentalUnlockParents}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.panel}>
      {mode === 'pin' ? (
        <>
          <Text style={styles.label}>{t.parentalUnlockLabel}</Text>
          <TextInput
            style={[styles.pinInput, pinError && styles.inputError]}
            value={pin}
            onChangeText={(v) => { setPin(v.replace(/\D/g, '').slice(0, 4)); setPinError(false); }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            placeholder="••••"
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoFocus
          />
          <TouchableOpacity style={styles.forgotBtn} onPress={switchToMath}>
            <Text style={styles.forgotBtnText}>{t.parentalForgotPin}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.label}>{t.parentalUnlockMathHint}</Text>
          <Text style={styles.mathQuestion}>
            {t.parentalResetMathQuestion(mathChallenge.a, mathChallenge.b)}
          </Text>
          <TextInput
            style={[styles.mathInput, mathError && styles.inputError]}
            value={mathAnswer}
            onChangeText={(v) => { setMathAnswer(v.replace(/\D/g, '').slice(0, 3)); setMathError(false); }}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="?"
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoFocus
          />
          <TouchableOpacity style={styles.forgotBtn} onPress={switchToPin}>
            <Text style={styles.forgotBtnText}>{t.parentalUsePin}</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={styles.unlockBtn} onPress={handleUnlock}>
        <Ionicons name="lock-open" size={22} color="white" />
        <Text style={styles.unlockBtnText}>{t.parentalUnlock}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.collapseBtn} onPress={() => setExpanded(false)}>
        <Text style={styles.collapseBtnText}>{t.parentalUnlockHide}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  parentGateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#00CED1',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 28,
    shadowColor: '#00CED1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  parentGateBtnText: {
    color: 'white',
    fontSize: 17,
    fontFamily: 'Fredoka-SemiBold',
  },
  panel: { width: '100%', maxWidth: 320, alignItems: 'center', gap: 12 },
  label: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Fredoka-SemiBold',
    textAlign: 'center',
  },
  mathQuestion: {
    fontSize: 28,
    color: 'white',
    fontFamily: 'Fredoka-SemiBold',
    textAlign: 'center',
  },
  pinInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontSize: 24,
    color: 'white',
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  mathInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontSize: 28,
    color: 'white',
    textAlign: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  inputError: { borderColor: '#FF6347' },
  forgotBtn: { paddingVertical: 4 },
  forgotBtnText: {
    fontSize: 13,
    color: '#00CED1',
    fontFamily: 'Fredoka-SemiBold',
    textDecorationLine: 'underline',
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    backgroundColor: '#00CED1',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 25,
  },
  unlockBtnText: { color: 'white', fontSize: 16, fontFamily: 'Fredoka-SemiBold' },
  collapseBtn: { paddingVertical: 6 },
  collapseBtnText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'Fredoka-SemiBold',
  },
});
