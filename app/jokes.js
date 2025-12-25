import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Animated, Dimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import Header from '../src/components/shared/Header';
import AnimatedBackground from '../src/components/shared/AnimatedBackground';
import { useSounds } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getStrings } from '../constants/Strings';
import { speak } from '../src/utils/speechService';

const { width } = Dimensions.get('window');

export default function JokesScreen() {
  const router = useRouter();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);
  
  const [category, setCategory] = useState('mr_mme'); // 'mr_mme' or 'devinettes'
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const fadeAnim = useState(new Animated.Value(1))[0];

  const currentJokes = t.jokes[category];
  const joke = currentJokes[currentIdx];

  const nextJoke = () => {
    playSound('pop');
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowAnswer(false);
      const nextIdx = (currentIdx + 1) % currentJokes.length;
      setCurrentIdx(nextIdx);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
  };

  const toggleAnswer = () => {
    if (!showAnswer) {
      playSound('success');
      setShowAnswer(true);
      speak(joke.a, language);
    }
  };

  const handleSpeak = () => {
    const text = showAnswer ? `${joke.q} ... ${joke.a}` : joke.q;
    speak(text, language);
  };

  const switchCategory = (cat) => {
    if (cat !== category) {
      playSound('click');
      setCategory(cat);
      setCurrentIdx(0);
      setShowAnswer(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <AnimatedBackground colors={['#FFF5E1', '#FFFAF0']} />
      <Header title={`✨ ${t.jokesGame}`} />

      <View style={styles.content}>
        
        {/* Category Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity 
            style={[styles.tab, category === 'mr_mme' && styles.activeTab]} 
            onPress={() => switchCategory('mr_mme')}
          >
            <Text style={[styles.tabText, category === 'mr_mme' && styles.activeTabText]}>{t.mrMmeTitle}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, category === 'devinettes' && styles.activeTab]} 
            onPress={() => switchCategory('devinettes')}
          >
            <Text style={[styles.tabText, category === 'devinettes' && styles.activeTabText]}>{t.riddleTitle}</Text>
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.jokeCard, { opacity: fadeAnim }]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons 
              name={category === 'mr_mme' ? "face-man-shimmer" : "help-circle"} 
              size={40} 
              color="#FF6347" 
            />
            <TouchableOpacity onPress={handleSpeak} style={styles.speakBtn}>
              <Ionicons name="volume-high" size={30} color="#00CED1" />
            </TouchableOpacity>
          </View>

          <Text style={styles.questionText}>{joke.q}</Text>

          <TouchableOpacity 
            style={[styles.answerContainer, !showAnswer && styles.answerHidden]} 
            onPress={toggleAnswer}
            activeOpacity={0.8}
          >
            {showAnswer ? (
              <Text style={styles.answerText}>{joke.a}</Text>
            ) : (
              <Text style={styles.tapToSee}>{t.back === 'Retour' ? 'Touche pour voir la réponse ! 🤫' : 'Tap to see the answer! 🤫'}</Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity style={styles.nextBtn} onPress={nextJoke}>
          <LinearGradient colors={['#FF6347', '#FF4500']} style={styles.nextGradient}>
            <Text style={styles.nextText}>{t.next}</Text>
            <Ionicons name="arrow-forward" size={24} color="white" />
          </LinearGradient>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#00CED1' },
  content: { flex: 1, padding: 20, alignItems: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 25, padding: 5, marginBottom: 30 },
  tab: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 },
  activeTab: { backgroundColor: 'white', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 2 },
  tabText: { fontFamily: 'Fredoka-SemiBold', fontSize: 16, color: '#666' },
  activeTabText: { color: '#FF6347' },
  jokeCard: { width: width - 40, backgroundColor: 'white', borderRadius: 30, padding: 25, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, minHeight: 300, justifyContent: 'center' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', position: 'absolute', top: 20, left: 20, right: 20 },
  speakBtn: { padding: 5 },
  questionText: { fontFamily: 'Fredoka-SemiBold', fontSize: 24, textAlign: 'center', color: '#333', marginTop: 40, marginBottom: 30 },
  answerContainer: { backgroundColor: '#F0F8FF', borderRadius: 20, padding: 20, minHeight: 100, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: '#00CED1' },
  answerHidden: { backgroundColor: '#FFF5E1', borderColor: '#FFD700' },
  answerText: { fontFamily: 'Fredoka-SemiBold', fontSize: 22, textAlign: 'center', color: '#FF6347' },
  tapToSee: { fontFamily: 'Fredoka-SemiBold', fontSize: 18, textAlign: 'center', color: '#B8860B', fontStyle: 'italic' },
  nextBtn: { marginTop: 40, width: width * 0.6, height: 60, borderRadius: 30, overflow: 'hidden', elevation: 3 },
  nextGradient: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  nextText: { fontFamily: 'Fredoka-SemiBold', fontSize: 20, color: 'white' },
});

