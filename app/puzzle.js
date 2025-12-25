import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Dimensions, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import Header from '../src/components/shared/Header';
import AnimatedBackground from '../src/components/shared/AnimatedBackground';
import { useSounds } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getStrings } from '../constants/Strings';

const { width } = Dimensions.get('window');

// Dynamically load all local drawings from assets/coloriages
const localColoriages = require.context('../assets/coloriages', false, /\.(png|jpg|jpeg)$/);

export default function PuzzleLibrary() {
  const router = useRouter();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);
  const [userDrawings, setUserDrawings] = useState([]);
  const [savedPuzzles, setSavedPuzzles] = useState([]);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const saved = await AsyncStorage.getItem('USER_DRAWINGS');
      setUserDrawings(saved ? JSON.parse(saved) : []);
      
      const puzzles = await AsyncStorage.getItem('SAVED_PUZZLES');
      setSavedPuzzles(puzzles ? JSON.parse(puzzles) : []);
    } catch (e) {
      console.error('Failed to load puzzle data', e);
      setUserDrawings([]);
      setSavedPuzzles([]);
    }
  };

  const handlePickFromDevice = async () => {
    try {
      playSound('pop');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t.permissionDenied, t.enablePermissionsInSettings);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled) {
        playSound('success');
        router.push({
          pathname: '/puzzle_difficulty',
          params: { selectedImage: result.assets[0].uri, title: t.myPhoto || "Ma Photo" }
        });
      }
    } catch (error) {
      console.error('Pick image error:', error);
      Alert.alert(t.error, t.failedToPickImage);
    }
  };

  const allImages = useMemo(() => {
    const local = localColoriages.keys().map(key => ({
      id: 'local-' + key,
      uri: localColoriages(key),
      title: key.replace('./', '').replace(/\.(png|jpg|jpeg)$/, '').replace(/[-_]/g, ' '),
      isLocal: true
    }));

    return [...userDrawings, ...local];
  }, [userDrawings]);

  const handleSelectImage = (item) => {
    playSound('pop');
    router.push({
      pathname: '/puzzle_difficulty',
      params: { selectedImage: item.uri, title: item.title }
    });
  };

  const handleContinuePuzzle = (puzzle) => {
    playSound('pop');
    router.push({
      pathname: '/puzzle_game',
      params: { puzzleId: puzzle.id, imageUri: puzzle.imageUri, gridSize: puzzle.gridSize, title: puzzle.title }
    });
  };

  const handleDeleteSavedPuzzle = async (id) => {
    Alert.alert(
      t.confirmDelete || "Supprimer ?",
      t.confirmDeletePuzzle || "Veux-tu effacer cette partie en cours ?",
      [
        { text: t.cancel, style: 'cancel' },
        { 
          text: t.delete, 
          style: 'destructive', 
          onPress: async () => {
            try {
              const existing = await AsyncStorage.getItem('SAVED_PUZZLES');
              if (existing) {
                let puzzles = JSON.parse(existing);
                puzzles = puzzles.filter(p => p.id !== id);
                await AsyncStorage.setItem('SAVED_PUZZLES', JSON.stringify(puzzles));
                setSavedPuzzles(puzzles);
                playSound('trash');
              }
            } catch (e) {
              console.error('Failed to delete puzzle', e);
            }
          }
        }
      ]
    );
  };

  const handleClearAllPuzzles = async () => {
    Alert.alert(
      t.confirmDeleteAll || "Tout effacer ?",
      t.confirmDeleteAllPuzzles || "Veux-tu supprimer toutes les parties en cours ?",
      [
        { text: t.cancel, style: 'cancel' },
        { 
          text: t.delete, 
          style: 'destructive', 
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('SAVED_PUZZLES');
              setSavedPuzzles([]);
              playSound('trash');
            } catch (e) {
              console.error('Failed to clear puzzles', e);
            }
          }
        }
      ]
    );
  };

  const renderPuzzleItem = ({ item }) => (
    <View style={styles.savedWrapper}>
      <TouchableOpacity style={styles.savedCard} onPress={() => handleContinuePuzzle(item)}>
        <Image source={typeof item.imageUri === 'number' ? item.imageUri : { uri: item.imageUri }} style={styles.savedImage} />
        <View style={styles.savedOverlay}>
          <Text style={styles.savedTitle}>{item.title}</Text>
          <Text style={styles.savedSubtitle}>{item.gridSize}x{item.gridSize} - {Math.round(item.progress)}%</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity 
        style={styles.deletePuzzleBtn} 
        onPress={() => handleDeleteSavedPuzzle(item.id)}
      >
        <Ionicons name="close-circle" size={24} color="#FF6347" />
      </TouchableOpacity>
    </View>
  );

  const renderImageItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleSelectImage(item)}>
      <View style={styles.imageContainer}>
        <Image source={typeof item.uri === 'number' ? item.uri : { uri: item.uri }} style={styles.image} resizeMode="contain" />
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <AnimatedBackground />
      <Header title={`🧩 ${t.puzzleGame}`} />
      
      <FlatList
        ListHeaderComponent={
          <>
            {savedPuzzles.length > 0 && (
              <View style={styles.section}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>⏳ {t.savedPuzzles}</Text>
                  <TouchableOpacity onPress={handleClearAllPuzzles} style={styles.clearAllBtn}>
                    <Ionicons name="trash-outline" size={20} color="#FF6347" />
                    <Text style={styles.clearAllText}>{t.clearAll || "Tout effacer"}</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={savedPuzzles}
                  renderItem={renderPuzzleItem}
                  keyExtractor={item => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.savedList}
                />
              </View>
            )}
            <View style={styles.section}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.sectionTitle}>🖼️ {t.choosePuzzleImage}</Text>
                <TouchableOpacity onPress={handlePickFromDevice} style={styles.pickDeviceBtn}>
                  <Ionicons name="camera-outline" size={20} color="#00CED1" />
                  <Text style={styles.pickDeviceText}>{t.fromDevice || "Depuis l'appareil"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        }
        data={allImages}
        renderItem={renderImageItem}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5E1' },
  list: { padding: 10 },
  section: { paddingHorizontal: 15, paddingTop: 15 },
  sectionTitle: { fontSize: 20, fontFamily: 'Fredoka-SemiBold', color: '#333', marginBottom: 10 },
  card: { flex: 1, margin: 8, backgroundColor: 'white', borderRadius: 20, elevation: 4, overflow: 'hidden' },
  imageContainer: { width: '100%', height: 150, backgroundColor: '#f9f9f9' },
  image: { width: '100%', height: '100%' },
  cardFooter: { padding: 10 },
  cardTitle: { fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#333', textTransform: 'capitalize' },
  savedList: { paddingHorizontal: 5, paddingBottom: 15 },
  savedWrapper: { marginRight: 15, position: 'relative' },
  savedCard: { width: 140, height: 140, borderRadius: 20, overflow: 'hidden', elevation: 5, backgroundColor: 'white' },
  savedImage: { width: '100%', height: '100%' },
  savedOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8 },
  savedTitle: { color: 'white', fontSize: 12, fontFamily: 'Fredoka-SemiBold' },
  savedSubtitle: { color: '#ddd', fontSize: 10, fontFamily: 'Fredoka-SemiBold' },
  deletePuzzleBtn: { position: 'absolute', top: -5, right: -5, backgroundColor: 'white', borderRadius: 12, elevation: 6 },
  clearAllBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 99, 71, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  clearAllText: { marginLeft: 5, color: '#FF6347', fontSize: 12, fontFamily: 'Fredoka-SemiBold' },
  pickDeviceBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0, 206, 209, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  pickDeviceText: { marginLeft: 5, color: '#00CED1', fontSize: 12, fontFamily: 'Fredoka-SemiBold' }
});

