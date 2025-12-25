import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions, Alert, SafeAreaView, Modal } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DIFF_LEVELS } from './diff_library';
import { useSounds } from '../contexts/SoundContext';

const { width } = Dimensions.get('window');
// Two images side by side layout logic
// We want two images next to each other.
// Assuming landscape or wide enough screen for tablets, or stacked for phones.
// The user prompt said: "2 images qui se font faces l'une à coté de l'autre pas au dessus".
// So we need row direction.
const IMAGE_SIZE = width * 0.45; // slightly less than half width

export default function DiffGame() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { playSound } = useSounds();
  const [foundDiffs, setFoundDiffs] = useState([]);
  
  // Load level from params or default to 1
  const levelId = params.levelId ? parseInt(params.levelId) : 1;
  const currentLevel = DIFF_LEVELS.find(l => l.id === levelId) || DIFF_LEVELS[0];

  const handlePress = (evt) => {
    const { locationX, locationY } = evt.nativeEvent;
    
    // Check match in the interactive image
    const match = currentLevel.diffs.find(d => {
        const dx = Math.abs(d.x - locationX);
        const dy = Math.abs(d.y - locationY);
        return dx < currentLevel.radius && dy < currentLevel.radius && !foundDiffs.includes(d.id);
    });

    if (match) {
        const newFound = [...foundDiffs, match.id];
        setFoundDiffs(newFound);
        playSound('success');
        
        if (newFound.length === currentLevel.diffs.length) {
            playSound('win');
            setTimeout(() => {
                 Alert.alert("Bravo !", "Tu as tout trouvé ! 🏆", [
                     { text: "Menu", onPress: () => router.back() }
                 ]);
            }, 500);
        }
    } else {
        playSound('wrong');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
             <Ionicons name="chevron-back" size={32} color="white" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
             <Text style={styles.headerIcon}>🔍</Text>
             <Text style={styles.headerTitle}>{currentLevel.title}</Text>
        </View>
        <View style={styles.headerBtn} /> 
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
         <Text style={styles.progressText}>Trouvées : {foundDiffs.length} / {currentLevel.diffs.length}</Text>
      </View>

      <View style={styles.gameContent}>
        <View style={styles.imagesRow}>
            {/* Image 1: Reference (Original) - Left */}
            <View style={styles.imageWrapper}>
                <Image 
                    source={{ uri: currentLevel.image }} 
                    style={styles.image} 
                    resizeMode="contain"
                />
            </View>

            {/* Image 2: With Differences (Interactable) - Right */}
            <View style={styles.imageWrapper}>
                <TouchableOpacity activeOpacity={1} onPress={handlePress}>
                    <Image 
                        source={{ uri: currentLevel.image }} 
                        style={styles.image} 
                        resizeMode="contain"
                    />

                    {/* Show markers for found differences */}
                    {foundDiffs.map(id => {
                        const diff = currentLevel.diffs.find(d => d.id === id);
                        return (
                            <View 
                                key={id}
                                style={[
                                    styles.marker, 
                                    { left: diff.x - 15, top: diff.y - 15 }
                                ]} 
                            >
                                <Ionicons name="checkmark" size={20} color="white" />
                            </View>
                        );
                    })}
                </TouchableOpacity>
            </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF5E1',
  },
  header: {
    height: 60,
    backgroundColor: '#FFAA47',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  headerBtn: {
    width: 40,
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 24,
    marginRight: 10,
    color: 'white',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  progressContainer: {
    backgroundColor: '#FFE4E1', 
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#FFC0CB',
  },
  progressText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#D81B60',
  },
  gameContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagesRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
      paddingHorizontal: 10,
  },
  imageWrapper: {
    padding: 5,
    backgroundColor: 'white',
    borderRadius: 15,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  image: {
    width: IMAGE_SIZE,
    height: 300, // Fixed height or aspect ratio based
    borderRadius: 10,
  },
  marker: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#32CD32', 
    backgroundColor: 'rgba(50,205,50,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
