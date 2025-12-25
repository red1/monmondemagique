import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Alert, Image as RNImage } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { 
  Canvas, 
  Image, 
  useImage, 
  Path, 
  Skia, 
  Group, 
  useTouchHandler,
  Shadow
} from '@shopify/react-native-skia';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Header from '../src/components/shared/Header';
import AnimatedBackground from '../src/components/shared/AnimatedBackground';
import { useSounds } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getStrings } from '../constants/Strings';
import { speak } from '../src/utils/speechService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Responsive Layout Constants
const PIECES_POOL_WIDTH = SCREEN_WIDTH * 0.28;
const PUZZLE_AREA_WIDTH = SCREEN_WIDTH * 0.72;
const HEADER_HEIGHT = 80;
const AVAILABLE_HEIGHT = SCREEN_HEIGHT - HEADER_HEIGHT;
const MAX_PUZZLE_SIZE = Math.min(PUZZLE_AREA_WIDTH * 0.85, AVAILABLE_HEIGHT * 0.85);

// Helper to generate a puzzle piece path
const createPiecePath = (size, row, col, gridSize, tabs) => {
  const path = Skia.Path.Make();
  const tabSize = size * 0.25;
  const radius = tabSize * 0.6;

  path.moveTo(0, 0);

  // Top side
  if (row === 0) path.lineTo(size, 0);
  else {
    const type = tabs.top; 
    path.lineTo(size / 2 - tabSize / 2, 0);
    path.cubicTo(size / 2 - tabSize / 2, type * radius, size / 2 + tabSize / 2, type * radius, size / 2 + tabSize / 2, 0);
    path.lineTo(size, 0);
  }

  // Right side
  if (col === gridSize - 1) path.lineTo(size, size);
  else {
    const type = tabs.right;
    path.lineTo(size, size / 2 - tabSize / 2);
    path.cubicTo(size + type * radius, size / 2 - tabSize / 2, size + type * radius, size / 2 + tabSize / 2, size, size / 2 + tabSize / 2);
    path.lineTo(size, size);
  }

  // Bottom side
  if (row === gridSize - 1) path.lineTo(0, size);
  else {
    const type = tabs.bottom;
    path.lineTo(size / 2 + tabSize / 2, size);
    path.cubicTo(size / 2 + tabSize / 2, size + type * radius, size / 2 - tabSize / 2, size + type * radius, size / 2 - tabSize / 2, size);
    path.lineTo(0, size);
  }

  // Left side
  if (col === 0) path.lineTo(0, 0);
  else {
    const type = tabs.left;
    path.lineTo(0, size / 2 + tabSize / 2);
    path.cubicTo(type * radius, size / 2 + tabSize / 2, type * radius, size / 2 - tabSize / 2, 0, size / 2 - tabSize / 2);
    path.lineTo(0, 0);
  }

  path.close();
  return path;
};

export default function PuzzleGame() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);

  const imageUri = params.imageUri;
  const gridSize = parseInt(params.gridSize || 3);
  const puzzleId = params.puzzleId;

  const parsedImageUri = useMemo(() => {
    if (!imageUri) return null;
    if (/^\d+$/.test(imageUri)) return parseInt(imageUri);
    return imageUri;
  }, [imageUri]);

  const image = useImage(parsedImageUri);
  const [pieces, setPieces] = useState([]);
  const [activePieceIndex, setActivePieceIndex] = useState(-1);
  const touchOffset = useRef({ x: 0, y: 0 });
  const tabsRef = useRef(null);
  const [isWon, setIsWon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState({ w: 0, h: 0, x: 0, y: 0 });

  useEffect(() => {
    if (image) {
      const imgW = image.width();
      const imgH = image.height();
      const ratio = imgW / imgH;

      let displayW, displayH;
      if (ratio > (PUZZLE_AREA_WIDTH / AVAILABLE_HEIGHT)) {
        displayW = MAX_PUZZLE_SIZE;
        displayH = MAX_PUZZLE_SIZE / ratio;
      } else {
        displayH = MAX_PUZZLE_SIZE;
        displayW = MAX_PUZZLE_SIZE * ratio;
      }

      const x = PIECES_POOL_WIDTH + (PUZZLE_AREA_WIDTH - displayW) / 2;
      const y = HEADER_HEIGHT + (AVAILABLE_HEIGHT - displayH) / 2;

      setLayout({ w: displayW, h: displayH, x, y });
      initPuzzle(displayW, displayH, x, y);
    }
  }, [image]);

  const initPuzzle = async (displayW, displayH, canvasX, canvasY) => {
    try {
      let savedData = null;
      if (puzzleId) {
        const saved = await AsyncStorage.getItem('SAVED_PUZZLES');
        if (saved) {
          const allPuzzles = JSON.parse(saved);
          if (Array.isArray(allPuzzles)) {
            savedData = allPuzzles.find(p => p.id === puzzleId);
          }
        }
      }

      const pieceW = displayW / gridSize;
      const pieceH = displayH / gridSize;
      const newPieces = [];

      let horizontalTabs, verticalTabs;

      if (savedData && savedData.tabs) {
        horizontalTabs = savedData.tabs.horizontal;
        verticalTabs = savedData.tabs.vertical;
      } else {
        horizontalTabs = [];
        verticalTabs = [];
        for (let r = 0; r < gridSize; r++) {
          horizontalTabs[r] = [];
          for (let c = 0; c < gridSize - 1; c++) horizontalTabs[r][c] = Math.random() > 0.5 ? 1 : -1;
        }
        for (let r = 0; r < gridSize - 1; r++) {
          verticalTabs[r] = [];
          for (let c = 0; c < gridSize; c++) verticalTabs[r][c] = Math.random() > 0.5 ? 1 : -1;
        }
      }

      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          const tabs = {
            top: r > 0 ? verticalTabs[r - 1][c] : 0,
            right: c < gridSize - 1 ? horizontalTabs[r][c] : 0,
            bottom: r < gridSize - 1 ? verticalTabs[r][c] : 0,
            left: c > 0 ? horizontalTabs[r][c - 1] : 0,
          };

          const size = Math.max(pieceW, pieceH);
          const path = createPiecePath(size, r, c, gridSize, tabs);
          const matrix = Skia.Matrix();
          matrix.scale(pieceW / size, pieceH / size);
          path.transform(matrix);
          
          const targetX = c * pieceW;
          const targetY = r * pieceH;

          let currentX, currentY, isLocked = false;

          if (savedData && savedData.pieces && savedData.pieces[r * gridSize + c]) {
            const savedPiece = savedData.pieces[r * gridSize + c];
            currentX = savedPiece.x;
            currentY = savedPiece.y;
            isLocked = !!savedPiece.isLocked;
          } else {
            currentX = 10 + Math.random() * (PIECES_POOL_WIDTH - pieceW - 20);
            currentY = HEADER_HEIGHT + 20 + Math.random() * (AVAILABLE_HEIGHT - pieceH - 40);
          }

          newPieces.push({
            id: `${r}-${c}`,
            row: r, col: c,
            targetX, targetY,
            x: currentX, y: currentY,
            isLocked, path,
            pieceW, pieceH
          });
        }
      }

      setPieces(newPieces);
      tabsRef.current = { horizontal: horizontalTabs, vertical: verticalTabs };
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const savePuzzle = async (piecesList) => {
    try {
      const existing = await AsyncStorage.getItem('SAVED_PUZZLES');
      let puzzles = existing ? JSON.parse(existing) : [];
      const lockedCount = piecesList.filter(p => p.isLocked).length;
      const progress = (lockedCount / piecesList.length) * 100;
      const newPuzzle = {
        id: puzzleId || Date.now().toString(),
        imageUri, gridSize,
        title: params.title || "Puzzle",
        progress,
        tabs: tabsRef.current,
        pieces: piecesList.map(p => ({ x: p.x, y: p.y, isLocked: p.isLocked }))
      };
      const index = puzzles.findIndex(p => p.id === newPuzzle.id);
      if (index > -1) puzzles[index] = newPuzzle;
      else puzzles.push(newPuzzle);
      await AsyncStorage.setItem('SAVED_PUZZLES', JSON.stringify(puzzles));
    } catch (e) { console.error(e); }
  };

  const onTouch = useTouchHandler({
    onStart: ({ x, y }) => {
      if (isWon) return;
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        if (p.isLocked) continue;
        const hitSlop = 20;
        if (x >= p.x - hitSlop && x <= p.x + p.pieceW + hitSlop && 
            y >= p.y - hitSlop && y <= p.y + p.pieceH + hitSlop) {
          touchOffset.current = { x: x - p.x, y: y - p.y };
          setActivePieceIndex(pieces.length - 1);
          setPieces(prev => {
            const newPieces = [...prev];
            const [moved] = newPieces.splice(i, 1);
            newPieces.push(moved);
            return newPieces;
          });
          playSound('pop');
          return;
        }
      }
    },
    onActive: ({ x, y }) => {
      if (activePieceIndex === -1) return;
      setPieces(prev => {
        const newPieces = [...prev];
        const p = { ...newPieces[activePieceIndex] };
        p.x = x - touchOffset.current.x;
        p.y = y - touchOffset.current.y;
        newPieces[activePieceIndex] = p;
        return newPieces;
      });
    },
    onEnd: () => {
      if (activePieceIndex === -1) return;
      setPieces(prev => {
        const newPieces = [...prev];
        const p = { ...newPieces[activePieceIndex] };
        const actualTargetX = layout.x + p.targetX;
        const actualTargetY = layout.y + p.targetY;
        const dist = Math.sqrt(Math.pow(p.x - actualTargetX, 2) + Math.pow(p.y - actualTargetY, 2));
        if (dist < p.pieceW * 0.4) {
          p.x = actualTargetX;
          p.y = actualTargetY;
          p.isLocked = true;
          playSound('success');
          newPieces[activePieceIndex] = p;
          if (newPieces.every(item => item.isLocked)) {
            setIsWon(true);
            playSound('win');
            removeFromSaved();
          }
        } else {
          newPieces[activePieceIndex] = p;
        }
        return newPieces;
      });
      setActivePieceIndex(-1);
    }
  }, [pieces, activePieceIndex, isWon, layout]);

  const handleManualSave = () => {
    savePuzzle(pieces);
    Alert.alert(t.success, t.puzzleSaved || "Partie sauvegardée !");
    playSound('click');
  };

  const removeFromSaved = async () => {
    try {
      const existing = await AsyncStorage.getItem('SAVED_PUZZLES');
      if (existing) {
        let puzzles = JSON.parse(existing);
        puzzles = puzzles.filter(p => p.id !== (puzzleId || (pieces.length > 0 ? pieces[0].id : null)));
        await AsyncStorage.setItem('SAVED_PUZZLES', JSON.stringify(puzzles));
      }
    } catch (e) { console.error(e); }
  };

  const handleListen = () => {
    speak(t.puzzleInstruction, language);
  };

  if (!image || loading) {
    return (
      <View style={styles.container}>
        <Header title={`🧩 ${t.puzzleGame}`} />
        <View style={styles.center}><Text style={styles.loadingText}>{t.loading}</Text></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AnimatedBackground />
      <Header title={`🧩 ${t.puzzleGame}`} rightComponent={
        <View style={{ flexDirection: 'row', gap: 15 }}>
          <TouchableOpacity onPress={handleListen}>
            <Ionicons name="volume-high" size={28} color="white" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleManualSave}>
            <Ionicons name="save" size={28} color="white" />
          </TouchableOpacity>
        </View>
      }/>

      <Canvas style={styles.fullCanvas} onTouch={onTouch}>
        <Path path={Skia.Path.Make().addRect({ x: 0, y: HEADER_HEIGHT, width: PIECES_POOL_WIDTH, height: AVAILABLE_HEIGHT })} color="rgba(0,0,0,0.05)" />
        <Path path={Skia.Path.Make().moveTo(PIECES_POOL_WIDTH, HEADER_HEIGHT).lineTo(PIECES_POOL_WIDTH, SCREEN_HEIGHT)} color="rgba(0,0,0,0.1)" style="stroke" strokeWidth={2} />

        <Group transform={[{ translateX: layout.x }, { translateY: layout.y }]} opacity={0.25}>
          <Image image={image} x={0} y={0} width={layout.w} height={layout.h} fit="fill" />
        </Group>

        {pieces.map((p, i) => {
          const isActive = activePieceIndex === i;
          return (
            <Group key={p.id} transform={[{ translateX: p.x || 0 }, { translateY: p.y || 0 }]}>
              {isActive && (
                <Path path={p.path} color="rgba(0,0,0,0.3)">
                  <Shadow dx={8} dy={8} blur={10} color="rgba(0,0,0,0.5)" />
                </Path>
              )}
              <Group clip={p.path}>
                <Image 
                  image={image} 
                  x={-p.targetX} 
                  y={-p.targetY} 
                  width={layout.w} 
                  height={layout.h} 
                  fit="fill" 
                />
              </Group>
              {!p.isLocked && (
                <Path path={p.path} color="rgba(255,255,255,0.5)" style="stroke" strokeWidth={2} />
              )}
            </Group>
          );
        })}
      </Canvas>

      {isWon && (
        <View style={styles.winOverlay}>
          <LinearGradient colors={['#FFD700', '#FFA500']} style={styles.winCard}>
            <Text style={styles.winText}>✨ {t.bravo} ✨</Text>
            <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
              <Text style={styles.doneBtnText}>{t.done}</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5E1' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 20, fontFamily: 'Fredoka-SemiBold', color: '#666' },
  fullCanvas: { flex: 1 },
  winOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  winCard: { padding: 40, borderRadius: 30, alignItems: 'center', elevation: 10 },
  winText: { fontSize: 40, fontFamily: 'Fredoka-SemiBold', color: 'white', marginBottom: 20 },
  doneBtn: { backgroundColor: 'white', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 25 },
  doneBtnText: { color: '#FFA500', fontSize: 20, fontFamily: 'Fredoka-SemiBold' }
});
