import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLanguage } from '../../../contexts/LanguageContext';
import { safeGoBack } from '../../utils/safeNavigation';

const LANGUAGES = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'ar_dz', name: 'الدارجة', flag: '🇩🇿' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
];

/**
 * Header - En-tête réutilisable avec titre, bouton retour et sélecteur de langue
 */
const Header = ({ title, showBack = true, leftComponent = null, rightComponent = null, backFallback = '/' }) => {
  const router = useRouter();
  const { language, changeLanguage } = useLanguage();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const insets = useSafeAreaInsets();

  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.leftContainer}>
        {leftComponent ? leftComponent : (
          showBack ? (
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => safeGoBack(router, backFallback)}
            >
              <Ionicons name="arrow-back" size={28} color="white" />
            </TouchableOpacity>
          ) : (
            <View style={styles.placeholder} />
          )
        )}
      </View>

      <Text style={styles.title} numberOfLines={1}>{title}</Text>

      <View style={styles.rightContainer}>
        {rightComponent ? rightComponent : (
          <TouchableOpacity 
            style={styles.langButton}
            onPress={() => setShowLangPicker(true)}
          >
            <Text style={styles.flagText}>{currentLang.flag}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showLangPicker} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowLangPicker(false)}
        >
          <View style={styles.langMenu}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langItem, language === lang.code && styles.activeLang]}
                onPress={() => {
                  changeLanguage(lang.code);
                  setShowLangPicker(false);
                }}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={styles.langName}>{lang.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#00CED1',
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftContainer: {
    minWidth: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 22,
    fontFamily: 'Fredoka-SemiBold',
    color: 'white',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  rightContainer: {
    minWidth: 45,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  placeholder: {
    width: 40,
  },
  langButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: {
    fontSize: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  langMenu: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 25,
    padding: 20,
    elevation: 10,
  },
  langItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 15,
    marginBottom: 10,
  },
  activeLang: {
    backgroundColor: '#E0F7FA',
    borderWidth: 1,
    borderColor: '#00CED1',
  },
  langFlag: {
    fontSize: 30,
    marginRight: 20,
  },
  langName: {
    fontSize: 20,
    fontFamily: 'Fredoka-SemiBold',
    color: '#333',
  },
});

export default Header;
