import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, SafeAreaView, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setCachedStorageItem } from '../src/utils/asyncStorageCache';
import SketchCanvas from '../components/SketchCanvas';
import Strings from '../constants/Strings';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Define palette colors
const COLORS = [
  { id: 'pink', color: '#FF69B4' }, 
  { id: 'blue', color: '#1E90FF' }, 
  { id: 'green', color: '#32CD32' }, 
  { id: 'orange', color: '#FFA500' }, 
  { id: 'lightblue', color: '#87CEEB' }, 
  { id: 'lime', color: '#ADFF2F' }, 
  { id: 'purple', color: '#9370DB' }, 
  { id: 'yellow', color: '#FFFF00' },
  { id: 'red', color: '#FF0000' },
  { id: 'gold', color: 'gold' }, // Gold color for glitter
];

export default function SketchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const sketchRef = useRef(null);
  const [imageUri, setImageUri] = useState(null);
  
  // State for tool management
  const [selectedColor, setSelectedColor] = useState(COLORS[0].color);
  const [currentToolType, setCurrentToolType] = useState('pen'); // 'pen', 'bucket', 'eraser'
  const [clearTrigger, setClearTrigger] = useState(0);

  // Derived currentTool object for Canvas
  const currentTool = {
      type: currentToolType,
      color: selectedColor
  };

  useEffect(() => {
    if (params.selectedImage) {
        setImageUri(params.selectedImage);
    }
  }, [params.selectedImage]);

  const requestPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(Strings.permissionDenied, 'Nous avons besoin de la permission pour accéder à tes photos !');
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 1,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(Strings.permissionDenied, 'Nous avons besoin de la caméra pour prendre une photo !');
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 1,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleClear = () => {
    Alert.alert(
        "Effacer ?", 
        "Veux-tu recommencer ton dessin ?",
        [
            { text: "Non", style: "cancel" },
            { text: "Oui", onPress: () => setClearTrigger(prev => prev + 1) }
        ]
    );
  };

  const handleSave = async () => {
      if (sketchRef.current) {
          try {
              const base64 = await sketchRef.current.save();
              if (base64) {
                  const filename = FileSystem.documentDirectory + `drawing_${Date.now()}.png`;
                  await FileSystem.writeAsStringAsync(filename, base64, {
                      encoding: FileSystem.EncodingType.Base64,
                  });
                  
                  // Save to Gallery
                  const { status } = await MediaLibrary.requestPermissionsAsync();
                  if (status === 'granted') {
                      await MediaLibrary.createAssetAsync(filename);
                      Alert.alert("Sauvegardé !", "Ton dessin est dans ta galerie photo ! 📸");
                  } else {
                      Alert.alert("Sauvegardé !", "Ton dessin est enregistré dans l'application !");
                  }

                  // Add to internal library
                  await addToInternalLibrary(filename);
              }
          } catch (e) {
              console.log(e);
              Alert.alert("Oups", "Erreur lors de la sauvegarde.");
          }
      }
  };

  const addToInternalLibrary = async (uri) => {
       try {
           const existing = await AsyncStorage.getItem('USER_DRAWINGS');
           const drawings = existing ? JSON.parse(existing) : [];
           drawings.push({ id: Date.now().toString(), uri, title: 'Mon Chef d\'œuvre' });
           await AsyncStorage.setItem('USER_DRAWINGS', JSON.stringify(drawings));
           setCachedStorageItem('USER_DRAWINGS', drawings);
       } catch (e) {
           console.log("Error saving to async storage", e);
       }
  };

  // If no image is selected (and not passed via params), show the picker screen
  if (!imageUri) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { justifyContent: 'center' }]}>
             <Text style={styles.headerTitle}>Mon Coloriage Magique</Text>
        </View>

        <View style={styles.contentCentered}>
            <Text style={styles.instruction}>Choisis une photo magique !</Text>
            <View style={styles.buttonContainer}>
                <TouchableOpacity style={[styles.button, { backgroundColor: '#FF69B4' }]} onPress={takePhoto}>
                    <Text style={styles.icon}>📷</Text>
                    <Text style={styles.buttonText}>{Strings.takePhoto}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.button, { backgroundColor: '#87CEEB' }]} onPress={pickImage}>
                    <Text style={styles.icon}>🖼️</Text>
                    <Text style={styles.buttonText}>{Strings.pickImage}</Text>
                </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.backButtonMain} onPress={() => router.back()}>
                <Text style={{ fontSize: 18, color: '#555' }}>{Strings.back}</Text>
            </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Drawing Screen
  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
             <Ionicons name="chevron-back" size={32} color="white" />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
             <Text style={styles.headerIcon}>🎨</Text>
             <Text style={styles.headerTitle}>Coloriage</Text>
        </View>

        {/* Save Button */}
        <TouchableOpacity onPress={handleSave} style={styles.headerBtn}>
             <Ionicons name="save" size={28} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.canvasContainer}>
         <SketchCanvas 
            ref={sketchRef}
            imageUri={imageUri} 
            currentTool={currentTool} 
            clearTrigger={clearTrigger} 
         />
      </View>

      {/* Tools & Palette Footer */}
      <View style={styles.footer}>
         {/* Tools Column */}
         <View style={styles.toolsColumn}>
            {/* Pen Tool */}
             <TouchableOpacity 
                style={[styles.toolBtn, currentToolType === 'pen' && styles.selectedTool]}
                onPress={() => setCurrentToolType('pen')}
             >
                 <Ionicons name="pencil" size={24} color={currentToolType === 'pen' ? '#FF69B4' : '#555'} />
             </TouchableOpacity>

             {/* Bucket Tool */}
             <TouchableOpacity 
                style={[styles.toolBtn, currentToolType === 'bucket' && styles.selectedTool]}
                onPress={() => setCurrentToolType('bucket')}
             >
                 <Ionicons name="color-fill" size={24} color={currentToolType === 'bucket' ? '#FF69B4' : '#555'} />
             </TouchableOpacity>

             {/* Eraser Tool */}
             <TouchableOpacity 
                style={[styles.toolBtn, currentToolType === 'eraser' && styles.selectedTool]}
                onPress={() => setCurrentToolType('eraser')}
             >
                 <MaterialCommunityIcons name="eraser" size={24} color={currentToolType === 'eraser' ? '#FF69B4' : '#555'} />
             </TouchableOpacity>
         </View>

         <View style={styles.separator} />

         {/* Colors Scroll */}
         <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.palette}>
            {COLORS.map((item, index) => {
                const isSelected = selectedColor === item.color && currentToolType !== 'eraser';
                
                return (
                    <TouchableOpacity 
                        key={index} 
                        onPress={() => {
                            setSelectedColor(item.color);
                            if (currentToolType === 'eraser') setCurrentToolType('pen'); // Switch back to pen
                        }}
                        style={[
                            styles.colorCircle, 
                            isSelected && styles.selectedColorCircle,
                            { backgroundColor: item.color }
                        ]}
                    >
                        {item.id === 'gold' ? (
                            <View style={styles.glitterCircle}>
                                <Text style={{fontSize: 18}}>✨</Text>
                            </View>
                        ) : (
                            <View style={styles.shine} />
                        )}
                    </TouchableOpacity>
                );
            })}
         </ScrollView>
         
         <View style={styles.separator} />

         <TouchableOpacity onPress={handleClear} style={styles.trashBtn}>
            <Ionicons name="trash-outline" size={28} color="#666" />
         </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFF0F5',
  },
  contentCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    height: 60,
    backgroundColor: '#00CED1', 
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
    fontFamily: 'Fredoka-SemiBold',
  },
  canvasContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  footer: {
    height: 100,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  toolsColumn: {
      flexDirection: 'row',
      gap: 10,
      paddingRight: 10,
  },
  toolBtn: {
      width: 45,
      height: 45,
      borderRadius: 22.5,
      backgroundColor: '#f0f0f0',
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 2,
  },
  selectedTool: {
      backgroundColor: '#FFF0F5',
      borderWidth: 2,
      borderColor: '#FF69B4',
  },
  palette: {
    alignItems: 'center',
    gap: 12,
    paddingRight: 20,
  },
  colorCircle: {
    width: 45,
    height: 45,
    borderRadius: 25,
    marginHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  selectedColorCircle: {
    borderColor: '#000',
    transform: [{ scale: 1.1 }],
    zIndex: 10,
  },
  glitterCircle: {
    width: '100%',
    height: '100%',
    backgroundColor: 'gold',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shine: {
    position: 'absolute',
    top: 2,
    left: 8,
    width: 15,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 10,
    transform: [{ rotate: '-20deg' }]
  },
  separator: {
    width: 1,
    height: '60%',
    backgroundColor: '#ccc',
    marginHorizontal: 10,
  },
  trashBtn: {
    padding: 10,
  },
  instruction: {
    fontSize: 18,
    color: '#555',
    marginBottom: 40,
    fontFamily: 'Fredoka-SemiBold',
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 50,
    width: '80%',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5,
  },
  icon: {
    fontSize: 24,
    marginRight: 15,
  },
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Fredoka-SemiBold',
  },
  backButtonMain: {
    marginTop: 30,
  }
});
