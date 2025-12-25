import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Modal, Switch, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons, FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import GlossyButton from '../components/shared/GlossyButton';
import AnimatedBackground from '../components/shared/AnimatedBackground';
import { useSounds } from '../../contexts/SoundContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getStrings } from '../../constants/Strings';

const { width, height } = Dimensions.get('window');

const LANGUAGES = [
  { code: 'fr', flag: '🇫🇷' },
  { code: 'ar', flag: '🇸🇦' },
  { code: 'ar_dz', flag: '🇩🇿' },
  { code: 'en', flag: '🇺🇸' },
  { code: 'es', flag: '🇪🇸' },
];

const HomeScreen = () => {
  const router = useRouter();
  const { soundEnabled, setSoundEnabled, musicEnabled, setMusicEnabled, playSound } = useSounds();
  const { language, changeLanguage } = useLanguage();
  const [showSettings, setShowSettings] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const t = getStrings(language);

  const handlePress = (route) => {
    playSound('pop');
    router.push(route);
  };

  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Settings Modal */}
      <Modal visible={showSettings} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⚙️ {t.back === 'Retour' ? 'Paramètres' : 'Settings'}</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingText}>🎵 {t.back === 'Retour' ? 'Musique' : 'Music'}</Text>
              <Switch value={musicEnabled} onValueChange={setMusicEnabled} trackColor={{ false: "#ccc", true: "#81b0ff" }} thumbColor={musicEnabled ? "#f5dd4b" : "#f4f3f4"} />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingText}>🔊 {t.back === 'Retour' ? 'Sons' : 'Sounds'}</Text>
              <Switch value={soundEnabled} onValueChange={setSoundEnabled} trackColor={{ false: "#ccc", true: "#81b0ff" }} thumbColor={soundEnabled ? "#f5dd4b" : "#f4f3f4"} />
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowSettings(false)}>
              <Text style={styles.closeBtnText}>{t.back === 'Retour' ? 'Fermer' : 'Close'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Language Modal */}
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

      <View style={styles.header}>
        <TouchableOpacity style={styles.settingsIcon} onPress={() => setShowSettings(true)}>
          <Ionicons name="settings-sharp" size={28} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>✨ {t.appName} ✨</Text>
        <TouchableOpacity style={styles.langIcon} onPress={() => setShowLangPicker(true)}>
          <Text style={styles.flagText}>{currentLang.flag}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.menuContainer}>
        <View style={styles.grid}>
          <View style={styles.row}>
            <View style={styles.btnBox}>
              <GlossyButton
                title={t.color}
                subtitle=""
                color="#FF69B4"
                darkColor="#C71585"
                icon={<Ionicons name="color-palette" size={35} color="white" />}
                onPress={() => handlePress('/library')}
              />
            </View>
            <View style={styles.btnBox}>
              <GlossyButton
                title={t.mathGame}
                subtitle=""
                color="#32CD32"
                darkColor="#228B22"
                icon={<Text style={styles.mathIcon}>1+2</Text>}
                onPress={() => handlePress('/math')}
              />
            </View>
            <View style={styles.btnBox}>
              <GlossyButton
                title={t.logicGame}
                subtitle=""
                color="#1E90FF"
                darkColor="#0000CD"
                icon={<MaterialCommunityIcons name="puzzle" size={35} color="white" />}
                onPress={() => handlePress('/logic')}
              />
            </View>
            <View style={styles.btnBox}>
              <GlossyButton
                title={t.hangmanGame}
                subtitle=""
                color="#9370DB"
                darkColor="#6A5ACD"
                icon={<FontAwesome5 name="font" size={25} color="white" />}
                onPress={() => handlePress('/hangman')}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.btnBox}>
              <GlossyButton
                title={t.readingGame}
                subtitle=""
                color="#FFD700"
                darkColor="#DAA520"
                icon={<Ionicons name="book" size={30} color="white" />}
                onPress={() => handlePress('/reading')}
              />
            </View>
            <View style={styles.btnBox}>
              <GlossyButton
                title={t.jokesGame}
                subtitle=""
                color="#FF4500"
                darkColor="#CD5C5C"
                icon={<Ionicons name="happy" size={35} color="white" />}
                onPress={() => handlePress('/jokes')}
              />
            </View>
            <View style={styles.btnBox}>
              <GlossyButton
                title={t.puzzleGame}
                subtitle=""
                color="#00CED1"
                darkColor="#008B8B"
                icon={<MaterialIcons name="extension" size={35} color="white" />}
                onPress={() => handlePress('/puzzle')}
              />
            </View>
            <View style={styles.btnBox}>
              <GlossyButton
                title={t.connect4Game}
                subtitle=""
                color="#FF6347"
                darkColor="#B22222"
                icon={<MaterialCommunityIcons name="grid" size={35} color="white" />}
                onPress={() => handlePress('/connect4')}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFDAB9' },
  background: { ...StyleSheet.absoluteFillObject },
  star: { position: 'absolute', color: '#FFFACD' },
  bubble: { position: 'absolute', backgroundColor: 'rgba(255, 255, 255, 0.3)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.5)' },
  header: { backgroundColor: '#00CED1', paddingTop: 50, paddingBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  headerTitle: { fontSize: 22, fontFamily: 'Fredoka-SemiBold', color: 'white', textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2, flex: 1, textAlign: 'center' },
  settingsIcon: { width: 40 },
  langIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  flagText: { fontSize: 24 },
  menuContainer: { 
    height: (height - 100) * 0.5, 
    width: '100%',
    justifyContent: 'center', 
    alignItems: 'center',
    marginTop: (height - 100) * 0.25
  },
  grid: { 
    width: '100%', 
    height: '100%',
    justifyContent: 'center'
  },
  row: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center',
    marginBottom: 10,
    height: '48%' 
  },
  btnBox: { 
    width: (width - 60) / 4, 
    marginHorizontal: 4, 
    height: '100%' 
  },
  mathIcon: { fontSize: 20, color: 'white', fontWeight: 'bold' },
  readingBtnBox: { width: width - 40, height: 100 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: 'white', borderRadius: 25, padding: 25, width: width * 0.8 },
  modalTitle: { fontSize: 24, fontFamily: 'Fredoka-SemiBold', color: '#00CED1', textAlign: 'center', marginBottom: 20 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  settingText: { fontSize: 18, fontFamily: 'Fredoka-SemiBold' },
  closeBtn: { marginTop: 20, backgroundColor: '#00CED1', padding: 12, borderRadius: 15, alignItems: 'center' },
  closeBtnText: { color: 'white', fontSize: 18, fontFamily: 'Fredoka-SemiBold' },
  langItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  activeLang: { backgroundColor: '#f0f0f0' },
  langFlag: { fontSize: 24, marginRight: 15 },
  langName: { fontSize: 18, fontFamily: 'Fredoka-SemiBold' },
});

export default HomeScreen;
