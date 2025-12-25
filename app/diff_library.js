import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, SafeAreaView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Levels Data
export const DIFF_LEVELS = [
    {
        id: 1,
        title: 'La Plage',
        image: 'https://img.freepik.com/free-vector/cartoon-summer-nature-landscape_23-2148946708.jpg',
        diffs: [
            { id: 1, x: 50, y: 50 },
            { id: 2, x: 200, y: 150 },
            { id: 3, x: 300, y: 100 },
        ],
        radius: 40,
    },
    {
        id: 2,
        title: 'Montagne',
        image: 'https://img.freepik.com/free-vector/cartoon-landscape-with-mountains_23-2148946709.jpg',
        diffs: [
            { id: 1, x: 80, y: 60 },
            { id: 2, x: 250, y: 180 },
            { id: 3, x: 150, y: 120 },
            { id: 4, x: 320, y: 50 },
            { id: 5, x: 40, y: 160 },
        ],
        radius: 35,
    },
    {
        id: 3,
        title: 'Forêt',
        image: 'https://img.freepik.com/free-vector/cartoon-forest-landscape_23-2148946710.jpg',
        diffs: [
            { id: 1, x: 100, y: 100 },
            { id: 2, x: 200, y: 200 },
            { id: 3, x: 300, y: 50 },
            { id: 4, x: 50, y: 250 },
        ],
        radius: 35,
    },
];

export default function DiffLibraryScreen() {
  const router = useRouter();

  const handleSelectLevel = (levelId) => {
    router.push({ pathname: '/diff', params: { levelId } });
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.card} 
      onPress={() => handleSelectLevel(item.id)}
      activeOpacity={0.8}
    >
      <View style={styles.imageContainer}>
          <Image source={{ uri: item.image }} style={styles.thumbnail} resizeMode="cover" />
          <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.diffs.length} Diff.</Text>
          </View>
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
    </TouchableOpacity>
  );

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
             <Text style={styles.headerTitle}>Choisis un niveau</Text>
        </View>
        <View style={styles.headerBtn} /> 
      </View>

      <FlatList
        data={DIFF_LEVELS}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
      />
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
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 15,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 15,
    marginBottom: 15,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 4/3,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
  },
  badge: {
      position: 'absolute',
      bottom: 5,
      right: 5,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
  },
  badgeText: {
      color: 'white',
      fontSize: 12,
      fontWeight: 'bold',
  }
});
