import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Modal, Switch, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import GlossyButton from '../components/shared/GlossyButton';
import AnimatedBackground from '../components/shared/AnimatedBackground';
import { useSounds } from '../../contexts/SoundContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useParentalControl, loadParentalPrefs, saveParentalPrefs } from '../../contexts/ParentalControlContext';
import { getStrings } from '../../constants/Strings';

const LANGUAGES = [
  { code: 'fr', flag: '🇫🇷' },
  { code: 'ar', flag: '🇸🇦' },
  { code: 'ar_dz', flag: '🇩🇿' },
  { code: 'en', flag: '🇺🇸' },
  { code: 'es', flag: '🇪🇸' },
];

const TIMER_SHORTCUTS = [1, 5, 10, 20];
const MIN_TIMER_MINUTES = 1;
const MAX_TIMER_MINUTES = 180;
const STORY_OPTIONS = [1, 2, 3, 5, 10];
const VIDEO_OPTIONS = [1, 2, 3, 5, 10];
const MIN_STORY_COUNT = 1;
const MAX_STORY_COUNT = 20;
const MIN_VIDEO_COUNT = 1;
const MAX_VIDEO_COUNT = 20;

import { createParentalMathChallenge } from '../utils/parentalMathChallenge';

function createResetChallenge() {
  return createParentalMathChallenge();
}

const HomeScreen = () => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { soundEnabled, setSoundEnabled, musicEnabled, setMusicEnabled, playSound } = useSounds();
  const { language, changeLanguage } = useLanguage();
  const {
    isActive, session, remainingMs, activateSession, deactivateSession,
    getStoriesRemaining, getVideosRemaining, resetPin,
  } = useParentalControl();
  const [showSettings, setShowSettings] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [settingsClickCount, setSettingsClickCount] = useState(0);
  const [parentalPin, setParentalPin] = useState('');
  const [parentalMode, setParentalMode] = useState('timer');
  const [timerMinutes, setTimerMinutes] = useState(10);
  const [storyCount, setStoryCount] = useState(3);
  const [videoCount, setVideoCount] = useState(3);
  const [pinChangeNew, setPinChangeNew] = useState('');
  const [pinChangeConfirm, setPinChangeConfirm] = useState('');
  const [resetChallenge, setResetChallenge] = useState(createResetChallenge);
  const [pinResetAnswer, setPinResetAnswer] = useState('');

  useEffect(() => {
    (async () => {
      const prefs = await loadParentalPrefs();
      setParentalMode(prefs.mode);
      setTimerMinutes(prefs.timerMinutes);
      setStoryCount(prefs.storyCount);
      setVideoCount(prefs.videoCount);
    })();
  }, []);

  useEffect(() => {
    if (showSettings) {
      (async () => {
        const prefs = await loadParentalPrefs();
        setParentalMode(prefs.mode);
        setTimerMinutes(prefs.timerMinutes);
        setStoryCount(prefs.storyCount);
      setVideoCount(prefs.videoCount);
      })();
      setResetChallenge(createResetChallenge());
      setPinResetAnswer('');
      setPinChangeNew('');
      setPinChangeConfirm('');
    }
  }, [showSettings]);

  const t = getStrings(language);
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 600;
  const columns = isTablet ? (isLandscape ? 4 : 3) : (isLandscape ? 4 : 2);
  const btnWidth = (width * 0.92 - (columns + 1) * 12) / columns;
  const btnHeight = isTablet
    ? Math.min(btnWidth * 0.85, (height - insets.top - insets.bottom - 120) / Math.ceil(10 / columns))
    : Math.min((height - insets.top - insets.bottom - 100) / (isLandscape ? 3 : 5), btnWidth * 1.1);
  const iconSize = isTablet ? 32 : 28;
  const titleSize = isTablet ? 20 : 16;

  const handlePress = (route) => {
    playSound('pop');
    router.push(route);
  };

  const handleSettingsPress = () => {
    playSound('pop');
    setSettingsClickCount(prev => {
      const next = prev + 1;
      if (next >= 10) {
        router.push('/icon_generator');
        return 0;
      }
      return next;
    });
    setShowSettings(true);
  };

  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  const modalWidth = Math.min(
    width * (isTablet ? 0.72 : 0.88),
    isTablet && isLandscape ? 680 : isTablet ? 480 : 420,
  );
  const isWidePinReset = isLandscape && width >= 720;
  const showAudioRow = isTablet && isLandscape;

  const handleParentalActivate = async () => {
    if (parentalPin.length !== 4) {
      Alert.alert(t.error, t.parentalPin);
      return;
    }
    try {
      await activateSession({
        mode: parentalMode,
        value: parentalMode === 'timer' ? timerMinutes : storyCount,
        videoValue: parentalMode === 'stories' ? videoCount : undefined,
        parentPin: parentalPin,
      });
      await saveParentalPrefs({ mode: parentalMode, timerMinutes, storyCount, videoCount });
      playSound('success');
      setParentalPin('');
      setShowSettings(false);
      if (parentalMode === 'stories') {
        router.push({ pathname: '/stories', params: { autoLaunch: '1' } });
      }
    } catch (_) {
      Alert.alert(t.error, t.parentalWrongPin);
    }
  };

  const handleParentalDeactivate = async () => {
    if (parentalPin.length !== 4) {
      Alert.alert(t.error, t.parentalPin);
      return;
    }
    try {
      await deactivateSession(parentalPin);
      playSound('pop');
      setParentalPin('');
    } catch (_) {
      Alert.alert(t.error, t.parentalWrongPin);
    }
  };

  const adjustTimerMinutes = (delta) => {
    playSound('pop');
    setTimerMinutes((prev) => Math.min(MAX_TIMER_MINUTES, Math.max(MIN_TIMER_MINUTES, prev + delta)));
  };

  const adjustStoryCount = (delta) => {
    playSound('pop');
    setStoryCount((prev) => Math.min(MAX_STORY_COUNT, Math.max(MIN_STORY_COUNT, prev + delta)));
  };

  const adjustVideoCount = (delta) => {
    playSound('pop');
    setVideoCount((prev) => Math.min(MAX_VIDEO_COUNT, Math.max(MIN_VIDEO_COUNT, prev + delta)));
  };

  const renderValuePicker = () => (
    parentalMode === 'timer' ? (
      <>
        <Text style={styles.parentalLabel}>{t.parentalTimerLabel}</Text>
        <View style={styles.optionRow}>
          {TIMER_SHORTCUTS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.optionChip, timerMinutes === opt && styles.optionChipActive]}
              onPress={() => { playSound('pop'); setTimerMinutes(opt); }}
            >
              <Text style={[styles.optionChipText, timerMinutes === opt && styles.optionChipTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={[styles.stepperBtn, timerMinutes <= MIN_TIMER_MINUTES && styles.stepperBtnDisabled]}
            onPress={() => adjustTimerMinutes(-1)}
            disabled={timerMinutes <= MIN_TIMER_MINUTES}
          >
            <Ionicons name="remove" size={28} color={timerMinutes <= MIN_TIMER_MINUTES ? '#ccc' : '#9B59B6'} />
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{timerMinutes} {t.parentalMinutesShort}</Text>
          <TouchableOpacity
            style={[styles.stepperBtn, timerMinutes >= MAX_TIMER_MINUTES && styles.stepperBtnDisabled]}
            onPress={() => adjustTimerMinutes(1)}
            disabled={timerMinutes >= MAX_TIMER_MINUTES}
          >
            <Ionicons name="add" size={28} color={timerMinutes >= MAX_TIMER_MINUTES ? '#ccc' : '#9B59B6'} />
          </TouchableOpacity>
        </View>
      </>
    ) : (
      <>
        <Text style={styles.parentalLabel}>{t.parentalStoriesLabel}</Text>
        <View style={styles.optionRow}>
          {STORY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={`story-${opt}`}
              style={[styles.optionChip, storyCount === opt && styles.optionChipActive]}
              onPress={() => { playSound('pop'); setStoryCount(opt); }}
            >
              <Text style={[styles.optionChipText, storyCount === opt && styles.optionChipTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={[styles.stepperBtn, storyCount <= MIN_STORY_COUNT && styles.stepperBtnDisabled]}
            onPress={() => adjustStoryCount(-1)}
            disabled={storyCount <= MIN_STORY_COUNT}
          >
            <Ionicons name="remove" size={28} color={storyCount <= MIN_STORY_COUNT ? '#ccc' : '#9B59B6'} />
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{storyCount}</Text>
          <TouchableOpacity
            style={[styles.stepperBtn, storyCount >= MAX_STORY_COUNT && styles.stepperBtnDisabled]}
            onPress={() => adjustStoryCount(1)}
            disabled={storyCount >= MAX_STORY_COUNT}
          >
            <Ionicons name="add" size={28} color={storyCount >= MAX_STORY_COUNT ? '#ccc' : '#9B59B6'} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.parentalLabel, styles.parentalLabelSpaced]}>{t.parentalVideosLabel}</Text>
        <View style={styles.optionRow}>
          {VIDEO_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={`video-${opt}`}
              style={[styles.optionChip, videoCount === opt && styles.optionChipActive]}
              onPress={() => { playSound('pop'); setVideoCount(opt); }}
            >
              <Text style={[styles.optionChipText, videoCount === opt && styles.optionChipTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={[styles.stepperBtn, videoCount <= MIN_VIDEO_COUNT && styles.stepperBtnDisabled]}
            onPress={() => adjustVideoCount(-1)}
            disabled={videoCount <= MIN_VIDEO_COUNT}
          >
            <Ionicons name="remove" size={28} color={videoCount <= MIN_VIDEO_COUNT ? '#ccc' : '#9B59B6'} />
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{videoCount}</Text>
          <TouchableOpacity
            style={[styles.stepperBtn, videoCount >= MAX_VIDEO_COUNT && styles.stepperBtnDisabled]}
            onPress={() => adjustVideoCount(1)}
            disabled={videoCount >= MAX_VIDEO_COUNT}
          >
            <Ionicons name="add" size={28} color={videoCount >= MAX_VIDEO_COUNT ? '#ccc' : '#9B59B6'} />
          </TouchableOpacity>
        </View>
      </>
    )
  );

  const renderParentalSetup = () => (
    <>
      <Text style={styles.parentalTitle}>🛡️ {t.parentalTitle}</Text>
      {isActive ? (
        <View style={styles.parentalStatus}>
          <Text style={styles.parentalStatusText}>
            {session?.mode === 'timer'
              ? t.parentalActiveTimer(formatRemaining(remainingMs))
              : `${t.parentalActiveStories(getStoriesRemaining())} · ${t.parentalActiveVideos(getVideosRemaining())}`}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.modeRow}>
            {[
              { id: 'timer', label: t.parentalModeTimer },
              { id: 'stories', label: t.parentalModeStories },
            ].map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.modeChip, parentalMode === m.id && styles.modeChipActive]}
                onPress={() => setParentalMode(m.id)}
              >
                <Text style={[styles.modeChipText, parentalMode === m.id && styles.modeChipTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {renderValuePicker()}
        </>
      )}
      <Text style={styles.parentalLabel}>{t.parentalPin}</Text>
      <TextInput
        style={styles.pinInput}
        value={parentalPin}
        onChangeText={(v) => setParentalPin(sanitizePin(v))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
        placeholder="••••"
        placeholderTextColor="#aaa"
      />
      <TouchableOpacity
        style={[styles.parentalBtn, isActive && styles.parentalBtnOff]}
        onPress={isActive ? handleParentalDeactivate : handleParentalActivate}
      >
        <Text style={styles.parentalBtnText}>
          {isActive ? t.parentalDeactivate : t.parentalActivate}
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderPinReset = () => (
    <View style={styles.pinChangeSection}>
      <Text style={styles.parentalLabel}>{t.parentalChangePin}</Text>
      <View style={isWidePinReset ? styles.pinResetRow : undefined}>
        <View style={isWidePinReset ? styles.pinResetCol : undefined}>
          <Text style={styles.resetMathHint}>{t.parentalResetMathHint}</Text>
          <Text style={styles.resetMathQuestion}>
            {t.parentalResetMathQuestion(resetChallenge.a, resetChallenge.b)}
          </Text>
          <TextInput
            style={styles.pinInput}
            value={pinResetAnswer}
            onChangeText={(v) => setPinResetAnswer(v.replace(/\D/g, '').slice(0, 3))}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="?"
            placeholderTextColor="#aaa"
          />
        </View>
        <View style={isWidePinReset ? styles.pinResetCol : undefined}>
          <TextInput
            style={[styles.pinInput, !isWidePinReset && styles.pinInputSpaced]}
            value={pinChangeNew}
            onChangeText={(v) => setPinChangeNew(sanitizePin(v))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            placeholder={t.parentalNewPin}
            placeholderTextColor="#aaa"
          />
          <TextInput
            style={[styles.pinInput, styles.pinInputSpaced]}
            value={pinChangeConfirm}
            onChangeText={(v) => setPinChangeConfirm(sanitizePin(v))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            placeholder={t.parentalConfirmPin}
            placeholderTextColor="#aaa"
          />
          <TouchableOpacity style={styles.pinSaveBtn} onPress={handleResetPin}>
            <Text style={styles.pinSaveBtnText}>{t.parentalSavePin}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const handleResetPin = async () => {
    if (pinChangeNew.length !== 4 || pinChangeConfirm.length !== 4) {
      Alert.alert(t.error, t.parentalInvalidNewPin);
      return;
    }
    if (pinChangeNew !== pinChangeConfirm) {
      Alert.alert(t.error, t.parentalPinMismatch);
      return;
    }
    if (Number(pinResetAnswer) !== resetChallenge.answer) {
      Alert.alert(t.error, t.parentalResetMathWrong);
      setResetChallenge(createResetChallenge());
      setPinResetAnswer('');
      return;
    }
    try {
      await resetPin(pinChangeNew);
      playSound('success');
      setPinResetAnswer('');
      setPinChangeNew('');
      setPinChangeConfirm('');
      setResetChallenge(createResetChallenge());
      Alert.alert(t.success, t.parentalPinSaved);
    } catch (e) {
      Alert.alert(t.error, e.message === 'INVALID_NEW_PIN' ? t.parentalInvalidNewPin : t.error);
    }
  };

  const sanitizePin = (v) => v.replace(/\D/g, '').slice(0, 4);

  const formatRemaining = (ms) => {
    if (ms == null) return '—';
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  };

  const buttons = [
    { id: 'color', title: t.color, route: '/library', color: '#FF69B4', darkColor: '#C71585', icon: <Ionicons name="color-palette" size={iconSize} color="white" /> },
    { id: 'math', title: t.mathGame, route: '/math', color: '#32CD32', darkColor: '#228B22', icon: <Text style={[styles.mathIcon, { fontSize: iconSize - 8 }]}>1+2</Text> },
    { id: 'logic', title: t.logicGame, route: '/logic', color: '#1E90FF', darkColor: '#0000CD', icon: <MaterialCommunityIcons name="puzzle" size={iconSize} color="white" /> },
    { id: 'hangman', title: t.hangmanGame, route: '/hangman', color: '#9370DB', darkColor: '#6A5ACD', icon: <FontAwesome5 name="font" size={iconSize - 6} color="white" /> },
    { id: 'reading', title: t.readingGame, route: '/reading', color: '#FFD700', darkColor: '#DAA520', icon: <Ionicons name="book" size={iconSize - 4} color="white" /> },
    { id: 'stories', title: t.storiesGame, route: '/stories', color: '#9B59B6', darkColor: '#7D3C98', icon: <Ionicons name="moon" size={iconSize} color="white" /> },
    { id: 'videos', title: t.videosGame, route: '/videos', color: '#00CED1', darkColor: '#008B8B', icon: <Ionicons name="videocam" size={iconSize} color="white" /> },
    { id: 'jokes', title: t.jokesGame, route: '/jokes', color: '#FF4500', darkColor: '#CD5C5C', icon: <Ionicons name="happy" size={iconSize} color="white" /> },
    { id: 'puzzle', title: t.puzzleGame, route: '/puzzle', color: '#00CED1', darkColor: '#008B8B', icon: <MaterialIcons name="extension" size={iconSize} color="white" /> },
    { id: 'connect4', title: t.connect4Game, route: '/connect4', color: '#FF6347', darkColor: '#B22222', icon: <MaterialCommunityIcons name="grid" size={iconSize} color="white" /> },
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <Modal visible={showSettings} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.modalCard, { width: modalWidth }]}>
              <Text style={styles.modalTitle}>⚙️ {t.back === 'Retour' ? 'Paramètres' : 'Settings'}</Text>

              {showAudioRow ? (
                <View style={styles.audioRow}>
                  <View style={styles.audioCol}>
                    <View style={styles.settingRowCompact}>
                      <Text style={styles.settingText}>🎵 {t.back === 'Retour' ? 'Musique' : 'Music'}</Text>
                      <Switch value={musicEnabled} onValueChange={setMusicEnabled} trackColor={{ false: '#ccc', true: '#81b0ff' }} thumbColor={musicEnabled ? '#f5dd4b' : '#f4f3f4'} />
                    </View>
                  </View>
                  <View style={styles.audioCol}>
                    <View style={styles.settingRowCompact}>
                      <Text style={styles.settingText}>🔊 {t.back === 'Retour' ? 'Sons' : 'Sounds'}</Text>
                      <Switch value={soundEnabled} onValueChange={setSoundEnabled} trackColor={{ false: '#ccc', true: '#81b0ff' }} thumbColor={soundEnabled ? '#f5dd4b' : '#f4f3f4'} />
                    </View>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>🎵 {t.back === 'Retour' ? 'Musique' : 'Music'}</Text>
                    <Switch value={musicEnabled} onValueChange={setMusicEnabled} trackColor={{ false: '#ccc', true: '#81b0ff' }} thumbColor={musicEnabled ? '#f5dd4b' : '#f4f3f4'} />
                  </View>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingText}>🔊 {t.back === 'Retour' ? 'Sons' : 'Sounds'}</Text>
                    <Switch value={soundEnabled} onValueChange={setSoundEnabled} trackColor={{ false: '#ccc', true: '#81b0ff' }} thumbColor={soundEnabled ? '#f5dd4b' : '#f4f3f4'} />
                  </View>
                </>
              )}

              <View style={styles.parentalSection}>
                {renderParentalSetup()}
                {renderPinReset()}
              </View>

              <TouchableOpacity style={styles.closeBtn} onPress={() => setShowSettings(false)}>
                <Text style={styles.closeBtnText}>{t.back === 'Retour' ? 'Fermer' : 'Close'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showLangPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowLangPicker(false)}>
          <View style={styles.modalCard}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langItem, language === lang.code && styles.activeLang]}
                onPress={() => {
                  changeLanguage(lang.code);
                  setShowLangPicker(false);
                  playSound('pop');
                }}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={styles.langName}>{lang.code.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <AnimatedBackground />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.settingsIcon} onPress={handleSettingsPress}>
          <Ionicons name="settings-sharp" size={28} color="white" />
          {isActive && <View style={styles.parentalBadge}><Text style={styles.parentalBadgeText}>🛡️</Text></View>}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>✨ {t.appName} ✨</Text>
        <TouchableOpacity style={styles.langIcon} onPress={() => setShowLangPicker(true)}>
          <Text style={styles.flagText}>{currentLang.flag}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.menuContainer, { paddingHorizontal: width * 0.04 }]}>
          <View style={[styles.grid, { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }]}>
            {buttons.map(btn => (
              <View 
                key={btn.id} 
                style={[
                  styles.btnBox, 
                  { width: btnWidth, height: btnHeight, margin: 6 }
                ]}
              >
                <GlossyButton
                  title={btn.title}
                  subtitle=""
                  color={btn.color}
                  darkColor={btn.darkColor}
                  icon={btn.icon}
                  compact
                  titleSize={titleSize}
                  onPress={() => handlePress(btn.route)}
                />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFDAB9' },
  background: { ...StyleSheet.absoluteFillObject },
  header: { backgroundColor: '#00CED1', paddingBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontFamily: 'Fredoka-SemiBold', color: 'white', textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2, flex: 1, textAlign: 'center' },
  settingsIcon: { width: 40 },
  parentalBadge: { position: 'absolute', top: -4, right: -4 },
  parentalBadgeText: { fontSize: 12 },
  langIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  flagText: { fontSize: 24 },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  menuContainer: { 
    flex: 1,
    width: '100%',
    justifyContent: 'center', 
    alignItems: 'center',
    paddingVertical: 20
  },
  grid: { 
    width: '100%', 
    justifyContent: 'center',
    alignItems: 'center'
  },
  btnBox: { 
    justifyContent: 'center',
    alignItems: 'center'
  },
  mathIcon: { fontSize: 20, color: 'white', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalScroll: {
    flexGrow: 1, justifyContent: 'center', alignItems: 'center',
    paddingVertical: 24, paddingHorizontal: 16, width: '100%',
  },
  modalCard: { backgroundColor: 'white', borderRadius: 25, padding: 25, alignSelf: 'center' },
  audioRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  audioCol: { flex: 1 },
  settingRowCompact: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  pinResetRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  pinResetCol: { flex: 1, minWidth: 0 },
  modalTitle: { fontSize: 24, fontFamily: 'Fredoka-SemiBold', color: '#00CED1', textAlign: 'center', marginBottom: 20 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  settingText: { fontSize: 18, fontFamily: 'Fredoka-SemiBold' },
  closeBtn: { marginTop: 20, backgroundColor: '#00CED1', padding: 12, borderRadius: 15, alignItems: 'center' },
  closeBtnText: { color: 'white', fontSize: 18, fontFamily: 'Fredoka-SemiBold' },
  langItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', width: '100%', paddingHorizontal: 15 },
  activeLang: { backgroundColor: '#f0f0f0' },
  langFlag: { fontSize: 24, marginRight: 15 },
  langName: { fontSize: 18, fontFamily: 'Fredoka-SemiBold' },
  parentalSection: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  parentalTitle: { fontSize: 18, fontFamily: 'Fredoka-SemiBold', color: '#9B59B6', marginBottom: 12 },
  parentalLabel: { fontSize: 14, color: '#666', marginTop: 10, marginBottom: 6, fontFamily: 'Fredoka-SemiBold' },
  parentalLabelSpaced: { marginTop: 16 },
  parentalStatus: { backgroundColor: '#f0fff0', padding: 12, borderRadius: 12, marginBottom: 8 },
  parentalStatusText: { fontSize: 15, color: '#228B22', fontFamily: 'Fredoka-SemiBold', textAlign: 'center' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  modeChip: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#f5f5f5', alignItems: 'center' },
  modeChipActive: { backgroundColor: '#9B59B6' },
  modeChipText: { fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#333' },
  modeChipTextActive: { color: 'white' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ddd' },
  optionChipActive: { backgroundColor: '#00CED1', borderColor: '#00CED1' },
  optionChipText: { fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#333' },
  optionChipTextActive: { color: 'white' },
  stepperRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 16, marginTop: 10,
  },
  stepperBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#f5f5f5',
    borderWidth: 2, borderColor: '#9B59B6', alignItems: 'center', justifyContent: 'center',
  },
  stepperBtnDisabled: { borderColor: '#ddd', backgroundColor: '#fafafa' },
  stepperValue: { fontSize: 22, fontFamily: 'Fredoka-SemiBold', color: '#333', minWidth: 80, textAlign: 'center' },
  pinInput: {
    backgroundColor: '#f9f9f9', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
    fontSize: 20, textAlign: 'center', letterSpacing: 6, borderWidth: 1, borderColor: '#ddd',
  },
  pinInputSpaced: { marginTop: 8 },
  pinChangeSection: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  resetMathHint: { fontSize: 13, color: '#666', fontFamily: 'Fredoka-SemiBold', marginBottom: 4 },
  resetMathQuestion: {
    fontSize: 22, color: '#9B59B6', fontFamily: 'Fredoka-SemiBold',
    textAlign: 'center', marginBottom: 8,
  },
  pinSaveBtn: { marginTop: 10, backgroundColor: '#00CED1', padding: 12, borderRadius: 15, alignItems: 'center' },
  pinSaveBtnText: { color: 'white', fontSize: 15, fontFamily: 'Fredoka-SemiBold' },
  parentalBtn: { marginTop: 12, backgroundColor: '#9B59B6', padding: 12, borderRadius: 15, alignItems: 'center' },
  parentalBtnOff: { backgroundColor: '#FF6347' },
  parentalBtnText: { color: 'white', fontSize: 16, fontFamily: 'Fredoka-SemiBold' },
});

export default HomeScreen;
