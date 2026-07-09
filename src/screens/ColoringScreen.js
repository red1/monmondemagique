import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, useWindowDimensions, Modal, PanResponder, Image as RNImage } from 'react-native';
import Slider from '@react-native-community/slider';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { Ionicons, MaterialIcons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import SimpleColoringCanvas from '../components/coloring/SimpleColoringCanvas';
import Header from '../components/shared/Header';
import { useSounds } from '../../contexts/SoundContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getStrings } from '../../constants/Strings';
import { convertToSketch } from '../utils/imageFilters';
import { speak } from '../utils/speechService';

const SpectrumPicker = ({ onColorSelect, label }) => {
  const { width } = useWindowDimensions();
  const [hue, setHue] = useState(0);
  const spectrumWidth = width * 0.8;

  const hsvToHex = (h, s, v) => {
    let r, g, b;
    let i = Math.floor(h * 6);
    let f = h * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v, g = t, b = p; break;
      case 1: r = q, g = v, b = p; break;
      case 2: r = p, g = v, b = t; break;
      case 3: r = p, g = q, b = v; break;
      case 4: r = t, g = p, b = v; break;
      case 5: r = v, g = p, b = q; break;
    }
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (evt, gestureState) => {
      const x = Math.max(0, Math.min(spectrumWidth, gestureState.moveX - (width - spectrumWidth) / 2));
      const h = x / spectrumWidth;
      setHue(h);
      onColorSelect(hsvToHex(h, 1, 1));
    },
    onPanResponderRelease: (evt, gestureState) => {
      const x = Math.max(0, Math.min(spectrumWidth, gestureState.moveX - (width - spectrumWidth) / 2));
      const h = x / spectrumWidth;
      setHue(h);
      onColorSelect(hsvToHex(h, 1, 1));
    }
  }), [spectrumWidth]);

  return (
    <View style={styles.spectrumContainer}>
      <Text style={styles.spectrumLabel}>{label}</Text>
      <View style={[styles.spectrumBar, { width: spectrumWidth }]} {...panResponder.panHandlers}>
        <LinearGradient
          colors={['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.spectrumCursor, { left: hue * spectrumWidth - 10 }]} />
      </View>
      <View style={[styles.colorPreview, { backgroundColor: hsvToHex(hue, 1, 1) }]} />
    </View>
  );
};

const ColoringScreen = () => {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);
  
  const [imageUri, setImageUri] = useState(() => {
    const img = params.selectedImage;
    if (!img) return 'blank';
    if (typeof img === 'string' && /^\d+$/.test(img)) {
      return parseInt(img, 10);
    }
    return img;
  });
  const [currentColor, setCurrentColor] = useState('#FF69B4');
  const [strokeWidth, setStrokeWidth] = useState(20);
  const [isMagic, setIsMagic] = useState(false);
  const [glitterType, setGlitterType] = useState('glitter');
  const [tool, setTool] = useState('pen'); 
  const [shape, setShape] = useState('none');
  const [showImagePicker, setShowImagePicker] = useState(!params.selectedImage);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showGlitterPicker, setShowGlitterPicker] = useState(false);
  
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
  const [lastInteraction, setLastInteraction] = useState({ x: width / 2, y: height * 0.3 });

  const updateZoomProps = useCallback(() => {
    // Only update state if values are valid numbers to prevent crashes
    const nextScale = scale.value;
    const nextTx = translateX.value;
    const nextTy = translateY.value;

    if (!isNaN(nextScale) && !isNaN(nextTx) && !isNaN(nextTy)) {
      setZoomScale(nextScale);
      setZoomOffset({ x: nextTx, y: nextTy });
    }
  }, []);

  const handleInteraction = useCallback((x, y) => {
    if (!isNaN(x) && !isNaN(y)) {
      setLastInteraction({ x, y });
    }
  }, []);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const newScale = Math.max(1, Math.min(5, savedScale.value * e.scale));
      scale.value = newScale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      runOnJS(updateZoomProps)();
    });

  const panGesture = Gesture.Pan()
    .minPointers(2) // Désormais le déplacement nécessite 2 doigts pour ne pas gêner le dessin à 1 doigt
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      runOnJS(updateZoomProps)();
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const handleZoomIn = () => {
    const oldScale = scale.value;
    const newScale = Math.min(5, oldScale + 0.5);
    
    // Centering logic: adjust translation to keep the last interaction point in focus
    // Formula: newTranslate = oldTranslate - interactionPoint * (newScale - oldScale)
    const scaleFactor = newScale / oldScale;
    
    // We want the interaction point (x,y) to stay at the same relative position
    // (x * oldScale) + oldTx = (x * newScale) + newTx
    // => newTx = oldTx - x * (newScale - oldScale)
    const dx = lastInteraction.x * (newScale - oldScale);
    const dy = lastInteraction.y * (newScale - oldScale);

    translateX.value -= dx;
    translateY.value -= dy;
    scale.value = newScale;
    savedScale.value = newScale;
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
    
    updateZoomProps();
    playSound('pop');
  };

  const handleZoomOut = () => {
    const oldScale = scale.value;
    const newScale = Math.max(1, oldScale - 0.5);
    
    if (newScale === 1) {
      translateX.value = 0;
      translateY.value = 0;
    } else {
      const dx = lastInteraction.x * (newScale - oldScale);
      const dy = lastInteraction.y * (newScale - oldScale);
      translateX.value -= dx;
      translateY.value -= dy;
    }

    scale.value = newScale;
    savedScale.value = newScale;
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
    
    updateZoomProps();
    playSound('pop');
  };

  const handleSliderZoom = (val) => {
    const oldScale = scale.value;
    const newScale = val;

    if (newScale === 1) {
      translateX.value = 0;
      translateY.value = 0;
    } else {
      const dx = lastInteraction.x * (newScale - oldScale);
      const dy = lastInteraction.y * (newScale - oldScale);
      translateX.value -= dx;
      translateY.value -= dy;
    }

    scale.value = newScale;
    savedScale.value = newScale;
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
    updateZoomProps();
  };

  const canvasRef = useRef(null);

  const glitterOptions = [
    { id: 'glitter', name: 'G1', source: require('../../assets/sprites/glitter.gif') },
    { id: 'glitter2', name: 'G2', source: require('../../assets/sprites/glitter2.gif') },
    { id: 'glitter3', name: 'G3', source: require('../../assets/sprites/glitter3.gif') },
    { id: 'glitter4', name: 'G4', source: require('../../assets/sprites/glitter4.gif') },
    { id: 'glitter5', name: 'G5', source: require('../../assets/sprites/glitter5.gif') },
    { id: 'glitter6', name: 'G6', source: require('../../assets/sprites/glitter6.gif') },
  ];

  const colors = [
    '#FF69B4', '#FFD700', '#FF6347', '#FF8C00', '#9370DB', '#00CED1',
    '#32CD32', '#1E90FF', '#FF1493', '#FFFFFF', '#000000', '#8B4513',
  ];

  const extendedColors = [
    '#FF69B4', '#FFD700', '#FF6347', '#FF8C00', '#9370DB', '#00CED1',
    '#32CD32', '#1E90FF', '#FF1493', '#FFFFFF', '#000000', '#8B4513',
    '#E6E6FA', '#FFF0F5', '#F0FFF0', '#F0F8FF', '#FFFACD', '#FFE4E1',
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF', '#FF00FF',
    '#C0C0C0', '#808080', '#800000', '#808000', '#008000', '#800080',
    '#008080', '#000080', '#A52A2A', '#D2691E', '#CD853F', '#F4A460'
  ];

  const sizes = [5, 10, 20, 40, 60];
  const shapes = [
    { id: 'none', icon: 'pencil' },
    { id: 'circle', icon: 'circle' },
    { id: 'square', icon: 'square' },
    { id: 'star', icon: 'star' }
  ];

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!result.canceled) {
        playSound('success');
        const sketchUri = await convertToSketch(result.assets[0].uri);
        setImageUri(sketchUri);
        setShowImagePicker(false);
      }
    } catch (error) {
      Alert.alert(t.back === 'Retour' ? 'Erreur' : 'Error', t.back === 'Retour' ? 'Impossible de prendre la photo' : 'Cannot take photo');
    }
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      if (!result.canceled) {
        playSound('success');
        const sketchUri = await convertToSketch(result.assets[0].uri);
        setImageUri(sketchUri);
        setShowImagePicker(false);
      }
    } catch (error) {
      Alert.alert(t.back === 'Retour' ? 'Erreur' : 'Error', t.back === 'Retour' ? "Impossible de sélectionner l'image" : 'Cannot select image');
    }
  };

  const handleSave = async () => {
    try {
      if (!canvasRef.current) return;
      const base64 = await canvasRef.current.saveCanvas();
      if (!base64) {
        Alert.alert(t.back === 'Retour' ? 'Erreur' : 'Error', t.back === 'Retour' ? 'Le dessin est vide' : 'Drawing is empty');
        return;
      }
      const cleanBase64 = base64.replace(/(\r\n|\n|\r)/gm, "").replace(/^data:image\/(png|jpg);base64,/, "");
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t.permissionDenied, t.back === 'Retour' ? 'Active les permissions dans les réglages !' : 'Enable permissions in settings!');
        return;
      }
      const filename = `${FileSystem.documentDirectory}dessin_${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(filename, cleanBase64, { encoding: FileSystem.EncodingType.Base64 });
      await MediaLibrary.saveToLibraryAsync(filename);
      const existing = await AsyncStorage.getItem('USER_DRAWINGS');
      const drawings = existing ? JSON.parse(existing) : [];
      drawings.push({ 
        id: Date.now().toString(), 
        uri: filename, 
        title: (t.back === 'Retour' ? `Mon Dessin ` : `My Drawing `) + (drawings.length + 1),
        isUser: true 
      });
      await AsyncStorage.setItem('USER_DRAWINGS', JSON.stringify(drawings));
      playSound('win');
      Alert.alert('✨ ' + t.bravo, t.back === 'Retour' ? 'Ton dessin est sauvegardé ! 🎨' : 'Your drawing is saved! 🎨');
    } catch (error) {
      Alert.alert(t.back === 'Retour' ? 'Erreur' : 'Error', error.message);
    }
  };

  const handleSpeakInstruction = () => {
    const text = t.back === 'Retour' ? 'Choisis une couleur et dessine avec ton doigt ! Utilise les paillettes pour un effet magique.' : 'Choose a color and draw with your finger! Use glitter for a magic effect.';
    speak(text, language);
  };

  if (showImagePicker) {
    return (
      <View style={styles.container}>
        <Header title={`✨ ${t.color}`} />
        <LinearGradient colors={['#FFDAB9', '#FFB6C1']} style={styles.pickerContainer}>
          <Text style={styles.pickerTitle}>{t.back === 'Retour' ? 'Choisis un dessin à colorier 🎨' : 'Choose a drawing to color 🎨'}</Text>
          <View style={styles.pickerButtons}>
            <TouchableOpacity style={[styles.pickerBtn, {backgroundColor: '#FF69B4'}]} onPress={handleTakePhoto}>
              <Ionicons name="camera" size={40} color="white" />
              <Text style={styles.btnText}>{t.takePhoto}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pickerBtn, {backgroundColor: '#1E90FF'}]} onPress={handlePickImage}>
              <Ionicons name="images" size={40} color="white" />
              <Text style={styles.btnText}>{t.pickImage}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pickerBtn, {backgroundColor: '#32CD32'}]} onPress={() => {setImageUri('blank'); setShowImagePicker(false);}}>
              <Ionicons name="document-text" size={40} color="white" />
              <Text style={styles.btnText}>{t.blankPage}</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <Header title={`✨ ${t.color}`} rightComponent={
          <View style={{flexDirection: 'row', gap: 10}}>
            <TouchableOpacity onPress={handleSpeakInstruction}>
              <Ionicons name="volume-high" size={28} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
              <Ionicons name="save" size={28} color="white" />
            </TouchableOpacity>
          </View>
        }/>

        <GestureDetector gesture={composedGesture}>
          <View style={styles.canvasWrapper}>
                        <SimpleColoringCanvas
                          ref={canvasRef}
                          imageUri={imageUri}
                          currentColor={currentColor}
                          tool={tool}
                          strokeWidth={strokeWidth}
                          shape={shape}
                          isMagic={isMagic}
                          glitterType={glitterType}
                          zoomScale={zoomScale}
                          zoomOffset={zoomOffset}
                          onInteraction={handleInteraction}
                        />
                        {/* Scroll Indicators */}
                        {zoomScale > 1 && (
                          <>
                            <View style={[styles.scrollIndicatorV, { 
                              height: 100 / zoomScale + '%',
                              top: Math.min(Math.max(-zoomOffset.y / (zoomScale * 3.5), 0), 80) + '%'
                            }]} />
                            <View style={[styles.scrollIndicatorH, { 
                              width: 100 / zoomScale + '%',
                              left: Math.min(Math.max(-zoomOffset.x / (zoomScale * 3.5), 0), 80) + '%'
                            }]} />
                          </>
                        )}
                      </View>
                    </GestureDetector>

        <View style={styles.footer}>
          <View style={styles.toolRow}>
            <TouchableOpacity 
              style={[styles.toolBtn, tool === 'pen' && shape === 'none' && strokeWidth === 5 && styles.toolBtnActive]} 
              onPress={() => { setTool('pen'); setShape('none'); setStrokeWidth(5); playSound('pop'); }}
            >
              <MaterialCommunityIcons name="fountain-pen" size={28} color={tool === 'pen' && shape === 'none' && strokeWidth === 5 ? 'white' : '#666'} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toolBtn, tool === 'pen' && shape === 'none' && strokeWidth !== 5 && styles.toolBtnActive]} 
              onPress={() => { setTool('pen'); setShape('none'); if(strokeWidth === 5) setStrokeWidth(20); playSound('pop'); }}
            >
              <MaterialCommunityIcons name="pencil" size={28} color={tool === 'pen' && shape === 'none' && strokeWidth !== 5 ? 'white' : '#666'} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.toolBtn, tool === 'bucket' && styles.toolBtnActive]} 
              onPress={() => { setTool('bucket'); setShape('none'); playSound('pop'); }}
            >
              <MaterialCommunityIcons name="format-color-fill" size={28} color={tool === 'bucket' ? 'white' : '#666'} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toolBtn, tool === 'eraser' && styles.toolBtnActive]} 
              onPress={() => { setTool('eraser'); setShape('none'); playSound('pop'); }}
            >
              <MaterialCommunityIcons name="eraser" size={28} color={tool === 'eraser' ? 'white' : '#666'} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toolBtn, isMagic && styles.magicBtnActive]} 
              onPress={() => { 
                if (!isMagic) {
                  setIsMagic(true);
                  setShowGlitterPicker(true);
                } else {
                  setShowGlitterPicker(true);
                }
                playSound('pop'); 
              }}
            >
              <MaterialCommunityIcons name="auto-fix" size={28} color={isMagic ? 'white' : '#666'} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.toolBtn} 
              onPress={() => { canvasRef.current.undo(); }}
            >
              <Ionicons name="arrow-undo" size={24} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.toolBtn} 
              onPress={() => { canvasRef.current.redo(); }}
            >
              <Ionicons name="arrow-redo" size={24} color="#666" />
            </TouchableOpacity>

            <View style={styles.toolDivider} />

            <TouchableOpacity 
              style={styles.toolBtn} 
              onPress={() => { canvasRef.current.clearCanvas(); playSound('pop'); }}
            >
              <Ionicons name="trash" size={24} color="#FF6347" />
            </TouchableOpacity>

            <View style={styles.zoomSliderContainer}>
              <TouchableOpacity onPress={handleZoomOut}>
                <Ionicons name="remove" size={20} color="#666" />
              </TouchableOpacity>
              <Slider
                style={styles.zoomSlider}
                minimumValue={1}
                maximumValue={5}
                value={zoomScale || 1}
                onSlidingComplete={handleSliderZoom}
                minimumTrackTintColor="#FF69B4"
                maximumTrackTintColor="#ddd"
                thumbTintColor="#FF69B4"
              />
              <TouchableOpacity onPress={handleZoomIn}>
                <Ionicons name="add" size={20} color="#666" />
              </TouchableOpacity>
            </View>
          </View>

        <View style={styles.paletteContainer}>
          <TouchableOpacity 
            style={[styles.colorBtn, styles.pickerTriggerBtn]} 
            onPress={() => { setShowColorPicker(true); playSound('pop'); }}
          >
              <Ionicons name="color-palette" size={24} color="#666" />
            </TouchableOpacity>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.palette}>
              {colors.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.colorBtn, {backgroundColor: c}, currentColor === c && styles.colorBtnActive]}
                  onPress={() => { setCurrentColor(c); if(tool === 'eraser') setTool('pen'); playSound('pop'); }}
                >
                  {currentColor === c && <Ionicons name="checkmark" size={20} color={c === '#FFFFFF' ? 'black' : 'white'} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <Modal visible={showColorPicker} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.pickerModal}>
                <Text style={styles.pickerModalTitle}>{t.back === 'Retour' ? 'Choisis ta couleur magique ! ✨' : 'Choose your magic color! ✨'}</Text>
                
                <SpectrumPicker 
                  label={t.back === 'Retour' ? 'Glisse ton doigt pour choisir ! 🌈' : 'Slide your finger to choose! 🌈'}
                  onColorSelect={(color) => {
                    setCurrentColor(color);
                    if(tool === 'eraser') setTool('pen');
                  }} 
                />

                <View style={styles.pickerDivider} />

                <ScrollView contentContainerStyle={styles.pickerGrid}>
                  {extendedColors.map((c, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.largeColorBtn, {backgroundColor: c}, currentColor === c && styles.colorBtnActive]}
                      onPress={() => { 
                        setCurrentColor(c); 
                        if(tool === 'eraser') setTool('pen'); 
                        setShowColorPicker(false);
                        playSound('pop'); 
                      }}
                    >
                      {currentColor === c && <Ionicons name="checkmark" size={24} color={c === '#FFFFFF' ? 'black' : 'white'} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity 
                  style={styles.closePickerBtn} 
                  onPress={() => setShowColorPicker(false)}
                >
                  <Text style={styles.closePickerText}>{t.done}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal visible={showGlitterPicker} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={[styles.pickerModal, { height: 'auto', paddingBottom: 40 }]}>
                <Text style={styles.pickerModalTitle}>{t.selectGlitter} ✨</Text>
                
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.glitterGrid}>
                  {glitterOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.glitterOption, 
                        glitterType === opt.id && { borderColor: '#FFD700', borderWidth: 3 }
                      ]}
                      onPress={() => {
                        setGlitterType(opt.id);
                        playSound('pop');
                      }}
                    >
                      <View style={styles.glitterPreview}>
                        <RNImage 
                          source={opt.source} 
                          style={styles.glitterImage} 
                          resizeMode="cover"
                        />
                        <View style={styles.glitterOverlay}>
                          <MaterialCommunityIcons name="auto-fix" size={20} color="white" />
                        </View>
                      </View>
                      <Text style={styles.glitterName}>{opt.name}</Text>
                    </TouchableOpacity>
                  ))}
                  
                  <TouchableOpacity
                    style={[styles.glitterOption, { opacity: 0.8 }]}
                    onPress={() => {
                      setIsMagic(false);
                      setShowGlitterPicker(false);
                      playSound('pop');
                    }}
                  >
                    <View style={[styles.glitterPreview, { backgroundColor: '#ccc' }]}>
                      <MaterialCommunityIcons name="close" size={30} color="white" />
                    </View>
                    <Text style={styles.glitterName}>{t.delete}</Text>
                  </TouchableOpacity>
                </ScrollView>

                <TouchableOpacity 
                  style={[styles.closePickerBtn, { marginTop: 30 }]} 
                  onPress={() => setShowGlitterPicker(false)}
                >
                  <Text style={styles.closePickerText}>{t.done}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <View style={styles.extraToolRow}>
            <View style={styles.sizeSection}>
              {sizes.map((s) => (
                <TouchableOpacity 
                  key={s} 
                  style={[styles.sizeBtn, strokeWidth === s && styles.sizeBtnActive]}
                  onPress={() => { setStrokeWidth(s); playSound('pop'); }}
                >
                  <View style={{ width: s/2, height: s/2, borderRadius: s/4, backgroundColor: strokeWidth === s ? 'white' : '#666' }} />
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.shapeSection}>
              {shapes.map((sh) => (
                <TouchableOpacity 
                  key={sh.id} 
                  style={[styles.shapeBtn, shape === sh.id && styles.shapeBtnActive]}
                  onPress={() => { setShape(sh.id); setTool('pen'); playSound('pop'); }}
                >
                  {sh.id === 'none' ? (
                    <MaterialCommunityIcons name="pencil" size={20} color={shape === sh.id ? 'white' : '#666'} />
                  ) : (
                    <FontAwesome5 name={sh.icon} size={18} color={shape === sh.id ? 'white' : '#666'} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  canvasWrapper: { 
    flex: 1,
    marginHorizontal: '5%',
    marginVertical: '2%', // Less margin here because footer/header already take space
    backgroundColor: 'white',
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 3
  },
  pickerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  pickerTitle: { fontSize: 24, fontFamily: 'Fredoka-SemiBold', color: '#333', marginBottom: 30, textAlign: 'center' },
  pickerButtons: { width: '100%', gap: 15 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 25, gap: 15, elevation: 5 },
  btnText: { fontSize: 20, color: 'white', fontFamily: 'Fredoka-SemiBold' },
  saveBtn: { padding: 5 },
  zoomBtn: { padding: 2 },
  footer: { padding: 10, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fdfdfd' },
  toolRow: { flexDirection: 'row', gap: 8, marginBottom: 10, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  toolBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', elevation: 2 },
  toolBtnActive: { backgroundColor: '#FF69B4', elevation: 4 },
  magicBtnActive: { backgroundColor: '#FFD700', elevation: 4 },
  toolDivider: { width: 1, height: 30, backgroundColor: '#ddd', marginHorizontal: 2 },
  paletteContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 5 },
  pickerTriggerBtn: { backgroundColor: '#f0f0f0', marginRight: 10, borderWidth: 1, borderColor: '#ddd' },
  zoomSliderContainer: { flexDirection: 'row', alignItems: 'center', width: 110, backgroundColor: '#f0f0f0', paddingHorizontal: 6, borderRadius: 15, height: 40 },
  zoomSlider: { flex: 1, height: 40 },
  palette: { flex: 1 },
  colorBtn: { width: 40, height: 40, borderRadius: 20, marginHorizontal: 5, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff', elevation: 3 },
  colorBtnActive: { borderColor: '#FFD700', transform: [{scale: 1.1}] },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  pickerModal: { width: '90%', height: '70%', backgroundColor: 'white', borderRadius: 25, padding: 20, alignItems: 'center' },
  pickerModalTitle: { fontSize: 20, fontFamily: 'Fredoka-SemiBold', color: '#333', marginBottom: 20 },
  spectrumContainer: { width: '100%', alignItems: 'center', marginBottom: 20 },
  spectrumLabel: { fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#666', marginBottom: 10 },
  spectrumBar: { height: 40, borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: '#ddd' },
  spectrumCursor: { position: 'absolute', top: 0, width: 20, height: 40, backgroundColor: 'white', borderLeftWidth: 2, borderRightWidth: 2, borderColor: '#333' },
  colorPreview: { width: 60, height: 30, borderRadius: 15, marginTop: 10, borderWidth: 2, borderColor: '#ddd' },
  pickerDivider: { width: '100%', height: 1, backgroundColor: '#eee', marginVertical: 15 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 15, paddingBottom: 20 },
  largeColorBtn: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 4, borderWidth: 3, borderColor: 'white' },
  closePickerBtn: { marginTop: 20, backgroundColor: '#FF69B4', paddingVertical: 12, paddingHorizontal: 40, borderRadius: 25 },
  closePickerText: { color: 'white', fontSize: 18, fontFamily: 'Fredoka-SemiBold' },
  extraToolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 5 },
  sizeSection: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  sizeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  sizeBtnActive: { backgroundColor: '#FF69B4' },
  shapeSection: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  shapeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  shapeBtnActive: { backgroundColor: '#1E90FF' },
  glitterGrid: { flexDirection: 'row', gap: 20, justifyContent: 'center', marginTop: 10 },
  glitterOption: { alignItems: 'center', padding: 10, borderRadius: 15, backgroundColor: '#f9f9f9', width: 100 },
  glitterPreview: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 8, elevation: 3, overflow: 'hidden' },
  glitterImage: { width: '100%', height: '100%' },
  glitterOverlay: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.3)', width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  glitterName: { fontFamily: 'Fredoka-SemiBold', fontSize: 14, color: '#333' },
  scrollIndicatorV: { position: 'absolute', right: 2, width: 4, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 2, zIndex: 10 },
  scrollIndicatorH: { position: 'absolute', bottom: 2, height: 4, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 2, zIndex: 10 },
});

export default ColoringScreen;
