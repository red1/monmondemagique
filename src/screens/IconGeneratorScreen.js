import React, { useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import { Canvas, Circle, Group, Paint, Skia, LinearGradient, vec, Path, Text as SkiaText, useFont } from '@shopify/react-native-skia';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';

const { width } = Dimensions.get('window');
const ICON_SIZE = 1024;

export default function IconGenerator() {
  const canvasRef = useRef(null);
  const font = useFont(require('../../assets/fonts/Fredoka-SemiBold.ttf'), 180);

  const handleSaveIcon = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') return;

      const uri = await captureRef(canvasRef, {
        format: 'png',
        quality: 1,
        width: ICON_SIZE,
        height: ICON_SIZE,
      });

      await MediaLibrary.saveToLibraryAsync(uri);
      alert('Icône sauvegardée dans la galerie ! (1024x1024)');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.help}>Voici l'icône générée par Skia :</Text>
      
      <View style={styles.previewContainer} ref={canvasRef} collapsable={false}>
        <Canvas style={{ width: 300, height: 300 }}>
          {/* Background Gradient */}
          <Group>
            <Path path={Skia.Path.Make().addRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, 300, 300), 60, 60))}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(300, 300)}
                colors={['#00CED1', '#40E0D0', '#7FFFD4']}
              />
            </Path>
          </Group>

          {/* Magical Elements */}
          <Circle cx={150} cy={150} r={100} color="white" opacity={0.2} />
          
          {/* The Magic Wand Icon using simple paths */}
          <Group transform={[{ rotate: -0.5, origin: vec(150, 150) }]}>
             <Circle cx={150} cy={130} r={40} color="#FFD700" />
             <Path 
                path="M150 170 L150 240" 
                strokeWidth={15} 
                style="stroke" 
                strokeCap="round" 
                color="white" 
             />
          </Group>

          {/* Text Initials */}
          {font && (
            <SkiaText
              x={110}
              y={180}
              text="M"
              font={font}
              color="white"
            />
          )}
        </Canvas>
      </View>

      <TouchableOpacity style={styles.btn} onPress={handleSaveIcon}>
        <Text style={styles.btnText}>Sauvegarder icon.png</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  previewContainer: { width: 300, height: 300, elevation: 10, backgroundColor: 'white', borderRadius: 60 },
  help: { marginBottom: 20, fontSize: 18, fontFamily: 'Fredoka-SemiBold' },
  btn: { marginTop: 40, backgroundColor: '#FF69B4', padding: 20, borderRadius: 30 },
  btnText: { color: 'white', fontSize: 20, fontFamily: 'Fredoka-SemiBold' }
});

