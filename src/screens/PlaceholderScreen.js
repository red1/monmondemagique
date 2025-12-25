import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Header from '../components/shared/Header';

/**
 * PlaceholderScreen - Écran placeholder générique pour les jeux
 * Utilisé temporairement pendant le développement
 */
const PlaceholderScreen = ({ title = 'Jeu', emoji = '🎮', description = 'Ce jeu arrive bientôt !' }) => {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Header title={title} />
      
      <LinearGradient
        colors={['#FFDAB9', '#FFE4E1', '#FFB6C1']}
        style={styles.content}
      >
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <LinearGradient
            colors={['#00CED1', '#008B8D']}
            style={styles.buttonGradient}
          >
            <Text style={styles.buttonText}>← Retour au menu</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFDAB9',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emoji: {
    fontSize: 120,
    marginBottom: 20,
  },
  title: {
    fontSize: 36,
    fontFamily: 'Fredoka-SemiBold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  description: {
    fontSize: 20,
    fontFamily: 'Fredoka-SemiBold',
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  backButton: {
    marginTop: 20,
  },
  buttonGradient: {
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  buttonText: {
    fontSize: 22,
    fontFamily: 'Fredoka-SemiBold',
    color: 'white',
    textAlign: 'center',
  },
});

export default PlaceholderScreen;

