import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Header from '../src/components/shared/Header';
import AnimatedBackground from '../src/components/shared/AnimatedBackground';
import { useSounds } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getStrings } from '../constants/Strings';

const { width } = Dimensions.get('window');

const DIFFICULTIES = [
  { n: 3, color: '#76D256' },
  { n: 4, color: '#1E90FF' },
  { n: 5, color: '#9370DB' },
  { n: 6, color: '#FF69B4' },
];

export default function PuzzleDifficulty() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);

  const handleStart = (n) => {
    playSound('pop');
    router.push({
      pathname: '/puzzle_game',
      params: { 
        imageUri: params.selectedImage, 
        gridSize: n,
        title: params.title 
      }
    });
  };

  return (
    <View style={styles.container}>
      <AnimatedBackground colors={['#FFDAB9', '#FFE4E1']} />
      <Header title={`🧩 ${t.puzzleGame}`} />
      
      <View style={styles.content}>
        <Text style={styles.title}>{t.chooseDifficulty}</Text>
        
        <View style={styles.grid}>
          {DIFFICULTIES.map((diff) => (
            <TouchableOpacity 
              key={diff.n}
              style={[styles.diffBtn, { backgroundColor: diff.color }]}
              onPress={() => handleStart(diff.n)}
            >
              <Text style={styles.diffText}>{t.piecesCount(diff.n)}</Text>
              <View style={styles.iconBox}>
                <Ionicons name="grid" size={40} color="white" />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 28, fontFamily: 'Fredoka-SemiBold', color: '#333', marginBottom: 40, textAlign: 'center' },
  grid: { width: '100%', gap: 20 },
  diffBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 25, borderRadius: 25, elevation: 5 },
  diffText: { fontSize: 22, color: 'white', fontFamily: 'Fredoka-SemiBold' },
  iconBox: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }
});

