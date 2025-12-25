import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, PanResponder, Animated, Dimensions, SafeAreaView, TouchableOpacity, Modal, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSounds } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getStrings } from '../constants/Strings';
import Header from '../src/components/shared/Header';
import AnimatedBackground from '../src/components/shared/AnimatedBackground';
import { speak } from '../src/utils/speechService';

const { width, height } = Dimensions.get('window');

const LEVELS = (t) => [
    { id: 1, shapes: [ { id: 'star', color: '#FFD700', icon: 'star', type: 'MaterialCommunityIcons' }, { id: 'square', color: '#5CA8FF', icon: 'square', type: 'Ionicons' }, { id: 'triangle', color: '#FF6347', icon: 'triangle', type: 'Ionicons' } ], instruction: t.logicInstruction },
    { id: 2, shapes: [ { id: 'heart', color: '#FF69B4', icon: 'heart', type: 'Ionicons' }, { id: 'cloud', color: '#87CEEB', icon: 'cloud', type: 'Ionicons' }, { id: 'moon', color: '#9370DB', icon: 'moon', type: 'Ionicons' }, { id: 'sun', color: '#FFA500', icon: 'sunny', type: 'Ionicons' } ], instruction: t.logicInstruction },
    { id: 3, shapes: [ { id: 'car', color: '#FF4500', icon: 'car', type: 'Ionicons' }, { id: 'plane', color: '#4682B4', icon: 'airplane', type: 'Ionicons' }, { id: 'boat', color: '#20B2AA', icon: 'boat', type: 'Ionicons' }, { id: 'bus', color: '#FFD700', icon: 'bus', type: 'Ionicons' }, { id: 'train', color: '#32CD32', icon: 'train', type: 'Ionicons' } ], instruction: t.logicInstruction },
    { id: 4, shapes: [ { id: 'apple', color: '#FF0000', icon: 'food-apple', type: 'MaterialCommunityIcons' }, { id: 'banana', color: '#FFE135', icon: 'food-apple', type: 'MaterialCommunityIcons' }, { id: 'carrot', color: '#FFA500', icon: 'food-carrot', type: 'MaterialCommunityIcons' }, { id: 'corn', color: '#FBEC5D', icon: 'food-croissant', type: 'MaterialCommunityIcons' }, { id: 'grape', color: '#6F2DA8', icon: 'fruit-grapes', type: 'MaterialCommunityIcons' } ], instruction: t.logicInstruction },
    { id: 5, shapes: [ { id: 'cat', color: '#A52A2A', icon: 'cat', type: 'MaterialCommunityIcons' }, { id: 'dog', color: '#8B4513', icon: 'dog', type: 'MaterialCommunityIcons' }, { id: 'rabbit', color: '#D3D3D3', icon: 'rabbit', type: 'MaterialCommunityIcons' }, { id: 'fish', color: '#00FFFF', icon: 'fish', type: 'MaterialCommunityIcons' }, { id: 'bird', color: '#FFFF00', icon: 'bird', type: 'MaterialCommunityIcons' }, { id: 'elephant', color: '#808080', icon: 'elephant', type: 'MaterialCommunityIcons' } ], instruction: t.logicInstruction },
    { id: 6, shapes: [ { id: 'size1', color: '#FF69B4', icon: 'star', type: 'Ionicons', displaySize: 30, label: t.back === 'Retour' ? 'Petit' : 'Small' }, { id: 'size2', color: '#FF69B4', icon: 'star', type: 'Ionicons', displaySize: 60, label: t.back === 'Retour' ? 'Moyen' : 'Medium' }, { id: 'size3', color: '#FF69B4', icon: 'star', type: 'Ionicons', displaySize: 90, label: t.back === 'Retour' ? 'Grand' : 'Big' } ], instruction: t.logicInstruction },
    { id: 7, shapes: [ { id: 'red', color: '#FF0000', icon: 'square', type: 'Ionicons', label: t.back === 'Retour' ? 'Rouge' : 'Red' }, { id: 'blue', color: '#0000FF', icon: 'square', type: 'Ionicons', label: t.back === 'Retour' ? 'Bleu' : 'Blue' }, { id: 'green', color: '#00FF00', icon: 'square', type: 'Ionicons', label: t.back === 'Retour' ? 'Vert' : 'Green' }, { id: 'yellow', color: '#FFFF00', icon: 'square', type: 'Ionicons', label: t.back === 'Retour' ? 'Jaune' : 'Yellow' } ], instruction: t.logicInstruction },
    { id: 8, shapes: [ { id: 'syl1', color: '#333', icon: 'chat', type: 'MaterialCommunityIcons', label: '1 Son' }, { id: 'syl2', color: '#333', icon: 'rabbit', type: 'MaterialCommunityIcons', label: '2 Sons' }, { id: 'syl3', color: '#333', icon: 'elephant', type: 'MaterialCommunityIcons', label: '3 Sons' } ], instruction: t.logicInstruction },
    { id: 9, shapes: [ { id: 'sun_small', color: '#FFA500', icon: 'sunny', type: 'Ionicons', displaySize: 40, label: t.back === 'Retour' ? 'Petit' : 'Small' }, { id: 'sun_large', color: '#FFA500', icon: 'sunny', type: 'Ionicons', displaySize: 100, label: t.back === 'Retour' ? 'Grand' : 'Big' }, { id: 'moon_small', color: '#9370DB', icon: 'moon', type: 'Ionicons', displaySize: 40, label: t.back === 'Retour' ? 'Petit' : 'Small' }, { id: 'moon_large', color: '#9370DB', icon: 'moon', type: 'Ionicons', displaySize: 100, label: t.back === 'Retour' ? 'Grand' : 'Big' } ], instruction: t.logicInstruction },
    { id: 10, shapes: [ { id: 'ice', color: '#ADD8E6', icon: 'ice-cream', type: 'Ionicons', label: t.back === 'Retour' ? 'Froid' : 'Cold' }, { id: 'fire', color: '#FF4500', icon: 'flame', type: 'Ionicons', label: t.back === 'Retour' ? 'Chaud' : 'Hot' }, { id: 'snow', color: '#FFFFFF', icon: 'snow', type: 'Ionicons', label: t.back === 'Retour' ? 'Froid' : 'Cold' }, { id: 'pizza', color: '#FFA500', icon: 'pizza', type: 'Ionicons', label: t.back === 'Retour' ? 'Chaud' : 'Hot' } ], instruction: t.logicInstruction },
    { id: 11, shapes: [ { id: 'num1', color: '#FF6347', icon: 'numeric-1-circle', type: 'MaterialCommunityIcons', label: '1' }, { id: 'num2', color: '#4682B4', icon: 'numeric-2-circle', type: 'MaterialCommunityIcons', label: '2' }, { id: 'num3', color: '#32CD32', icon: 'numeric-3-circle', type: 'MaterialCommunityIcons', label: '3' } ], instruction: t.logicInstruction },
    { id: 12, shapes: [ { id: 'fruit', color: '#FF8C00', icon: 'fruit-cherries', type: 'MaterialCommunityIcons', label: t.back === 'Retour' ? 'Fruit' : 'Fruit' }, { id: 'tool', color: '#808080', icon: 'hammer', type: 'MaterialCommunityIcons', label: t.back === 'Retour' ? 'Outil' : 'Tool' }, { id: 'fruit2', color: '#FF0000', icon: 'food-apple', type: 'MaterialCommunityIcons', label: t.back === 'Retour' ? 'Fruit' : 'Fruit' }, { id: 'tool2', color: '#A52A2A', icon: 'wrench', type: 'MaterialCommunityIcons', label: t.back === 'Retour' ? 'Outil' : 'Tool' } ], instruction: t.logicInstruction },
    { id: 13, shapes: [ { id: 'day', color: '#FFD700', icon: 'wb-sunny', type: 'MaterialCommunityIcons', label: t.back === 'Retour' ? 'Jour' : 'Day' }, { id: 'night', color: '#4B0082', icon: 'brightness-3', type: 'MaterialCommunityIcons', label: t.back === 'Retour' ? 'Nuit' : 'Night' }, { id: 'day2', color: '#87CEEB', icon: 'cloud', type: 'MaterialCommunityIcons', label: t.back === 'Retour' ? 'Jour' : 'Day' }, { id: 'night2', color: '#000080', icon: 'star', type: 'MaterialCommunityIcons', label: t.back === 'Retour' ? 'Nuit' : 'Night' } ], instruction: t.logicInstruction },
    { id: 14, shapes: [ { id: 'land', color: '#8B4513', icon: 'truck', type: 'MaterialCommunityIcons', label: t.back === 'Retour' ? 'Terre' : 'Land' }, { id: 'water', color: '#1E90FF', icon: 'ferry', type: 'MaterialCommunityIcons', label: t.back === 'Retour' ? 'Eau' : 'Water' }, { id: 'air', color: '#B0C4DE', icon: 'airplane', type: 'MaterialCommunityIcons', label: t.back === 'Retour' ? 'Air' : 'Air' } ], instruction: t.logicInstruction },
    { id: 15, shapes: [ { id: 'circ', color: '#FF1493', icon: 'circle', type: 'Ionicons', label: t.back === 'Retour' ? 'Rond' : 'Round' }, { id: 'rect', color: '#7FFF00', icon: 'square', type: 'Ionicons', label: t.back === 'Retour' ? 'Carré' : 'Square' }, { id: 'tri', color: '#00FFFF', icon: 'triangle', type: 'Ionicons', label: t.back === 'Retour' ? 'Triangle' : 'Triangle' }, { id: 'pent', color: '#FFD700', icon: 'pentagon', type: 'MaterialCommunityIcons', label: '5' } ], instruction: t.logicInstruction }
];

const ShapeIcon = ({ shape, size, color }) => {
    const finalSize = shape.displaySize || size;
    if (shape.type === 'MaterialCommunityIcons') return <MaterialCommunityIcons name={shape.icon} size={finalSize} color={color} />;
    return <Ionicons name={shape.icon} size={finalSize} color={color} />;
};

const DraggableShape = ({ shape, dropZones, onDropSuccess, onDragStart, onDragEnd }) => {
  const { playSound } = useSounds();
  const [pan] = useState(new Animated.ValueXY());
  const [scale] = useState(new Animated.Value(1));
  const [isDropped, setIsDropped] = useState(false);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
        onDragStart(); playSound('pop');
        pan.setOffset({ x: pan.x._value || 0, y: pan.y._value || 0 }); pan.setValue({ x: 0, y: 0 });
        Animated.spring(scale, { toValue: 1.2, useNativeDriver: false }).start();
    },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (e, gesture) => {
      pan.flattenOffset(); onDragEnd();
      Animated.spring(scale, { toValue: 1, useNativeDriver: false }).start();
      const targetZone = dropZones[shape.id];
      if (targetZone) {
          const isOver = gesture.moveX > targetZone.x && gesture.moveX < targetZone.x + targetZone.width && gesture.moveY > targetZone.y && gesture.moveY < targetZone.y + targetZone.height;
          if (isOver) { playSound('success'); setIsDropped(true); onDropSuccess(); return; }
      }
      playSound('wrong'); Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
  }), [dropZones, shape]);

  if (isDropped) return <View style={styles.slot} />;
  return (
    <Animated.View {...panResponder.panHandlers} style={[pan.getLayout(), styles.draggable, { transform: [{ scale }] }, { zIndex: 100 }]}>
      <ShapeIcon shape={shape} size={80} color={shape.color} />
      {shape.label && <Text style={styles.shapeLabel}>{shape.label}</Text>}
    </Animated.View>
  );
};

export default function LogicGame() {
  const router = useRouter();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);
  const [levelIndex, setLevelIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [showTutorial, setShowTutorial] = useState(true);
  const [draggingId, setDraggingId] = useState(null);
  const [dropZones, setDropZones] = useState({});

  const levels = LEVELS(t);
  const currentLevel = levels[levelIndex] || levels[0];
  const shuffledShapes = useMemo(() => [...currentLevel.shapes].sort(() => Math.random() - 0.5), [levelIndex]);

  const handleMatch = () => {
    const newCount = matchedCount + 1;
    setMatchedCount(newCount); setScore(s => s + 10);
    if (newCount === currentLevel.shapes.length) {
       playSound('win');
       setTimeout(() => {
           if (levelIndex < levels.length - 1) {
               Alert.alert(t.bravo, t.next + "?", [{ text: t.next, onPress: () => { setLevelIndex(l => l + 1); setMatchedCount(0); setShowTutorial(true); }}]);
           } else {
               Alert.alert(t.bravo, `${t.score}: ${score + 10} ! Champion(ne) ! 🏆`, [{ text: t.appName, onPress: () => router.back() }]);
           }
       }, 500);
    }
  };

  const onLayoutZone = (id, event) => {
      event.target.measure((x, y, width, height, pageX, pageY) => setDropZones(prev => ({ ...prev, [id]: { x: pageX, y: pageY, width, height } })));
  };

  const skipLevel = () => {
      playSound('pop');
      Alert.alert(t.skip + "?", t.skip + "?", [
          { text: t.back === 'Retour' ? 'Non' : 'No', style: "cancel" },
          { text: t.back === 'Retour' ? 'Oui !' : 'Yes!', onPress: () => {
              if (levelIndex < levels.length - 1) { setLevelIndex(l => l + 1); setMatchedCount(0); setShowTutorial(true); }
              else { Alert.alert(t.bravo, "Félicitations ! 🏆"); }
          }}
      ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <AnimatedBackground />
      <Modal visible={showTutorial} transparent animationType="slide">
        <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
                <Text style={styles.modalEmoji}>🧩</Text>
                <Text style={styles.modalTitle}>{t.level} {currentLevel.id}</Text>
                <Text style={styles.modalText}>{currentLevel.instruction}</Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.speakBtn} onPress={() => speak(currentLevel.instruction, language)}>
                    <Ionicons name="volume-high" size={32} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.playBtn} onPress={() => setShowTutorial(false)}>
                      <Text style={styles.playBtnText}>{t.understand}</Text>
                  </TouchableOpacity>
                </View>
            </View>
        </View>
      </Modal>

      <Header title={`${t.logicGame}`} rightComponent={
        <View style={{flexDirection:'row', gap: 10}}>
          <TouchableOpacity onPress={() => speak(currentLevel.instruction, language)}>
            <Ionicons name="volume-high" size={28} color="white" />
          </TouchableOpacity>
          <TouchableOpacity onPress={skipLevel}>
            <Ionicons name="play-forward" size={28} color="white" />
          </TouchableOpacity>
        </View>
      } />

      <View style={styles.scoreHeader}><Text style={styles.scoreText}>{t.score}: {score}</Text></View>

      <View style={styles.gameArea}>
          <View style={[styles.column, { zIndex: 10 }]}>
            {shuffledShapes.map((shape) => (
                <View key={shape.id} style={[styles.slot, draggingId === shape.id && { zIndex: 9999 }]}>
                    <DraggableShape shape={shape} dropZones={dropZones} onDropSuccess={handleMatch} onDragStart={() => setDraggingId(shape.id)} onDragEnd={() => setDraggingId(null)} />
                </View>
            ))}
          </View>
          <View style={[styles.column, { zIndex: 1 }]}>
            {currentLevel.shapes.map((shape) => (
                <View key={shape.id} style={styles.slot} onLayout={(e) => onLayoutZone(shape.id, e)}>
                    <View style={styles.dropZone}>
                        <ShapeIcon shape={shape} size={70} color="#D2B48C" />
                        {shape.label && <Text style={styles.dropLabel}>{shape.label}</Text>}
                    </View>
                </View>
            ))}
          </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5E1' },
  scoreHeader: { padding: 10, alignItems: 'center' },
  scoreText: { fontSize: 20, fontFamily: 'Fredoka-SemiBold', color: '#1E90FF' },
  gameArea: { flex: 1, flexDirection: 'row', padding: 20 },
  column: { flex: 1, justifyContent: 'space-around', alignItems: 'center' },
  slot: { width: 100, height: 100, justifyContent: 'center', alignItems: 'center', marginVertical: 10 },
  draggable: { width: 90, height: 90, justifyContent: 'center', alignItems: 'center' },
  shapeLabel: { fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#555', marginTop: 5 },
  dropZone: { width: 95, height: 95, justifyContent: 'center', alignItems: 'center', opacity: 0.8, backgroundColor: '#E0D0C0', borderRadius: 15, borderWidth: 2, borderColor: '#BCAAA4', borderStyle: 'dashed', padding: 5 },
  dropLabel: { fontSize: 12, fontFamily: 'Fredoka-SemiBold', color: '#8B4513', marginTop: 2, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: 'white', width: '85%', padding: 30, borderRadius: 25, alignItems: 'center', elevation: 10 },
  modalEmoji: { fontSize: 60, marginBottom: 20 },
  modalTitle: { fontSize: 28, fontFamily: 'Fredoka-SemiBold', color: '#5CA8FF', marginBottom: 15, textAlign: 'center' },
  modalText: { fontSize: 18, fontFamily: 'Fredoka-SemiBold', color: '#555', textAlign: 'center', marginBottom: 30, lineHeight: 26 },
  modalActions: { flexDirection: 'row', gap: 15, alignItems: 'center' },
  speakBtn: { backgroundColor: '#5CA8FF', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  playBtn: { backgroundColor: '#5CA8FF', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 50, borderBottomWidth: 5, borderBottomColor: '#2B7ACC' },
  playBtnText: { fontSize: 24, color: 'white', fontFamily: 'Fredoka-SemiBold' }
});
