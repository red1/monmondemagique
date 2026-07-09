import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Canvas, Circle, Skia, LinearGradient, vec, Path, FillType, useTouchHandler } from '@shopify/react-native-skia';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient as RNLinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';
import Header from '../src/components/shared/Header';
import AnimatedBackground from '../src/components/shared/AnimatedBackground';
import { useSounds } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getStrings } from '../constants/Strings';
import { speak } from '../src/utils/speechService';

const COLS = 7;
const ROWS = 6;
const BOARD_PADDING = 20;

export default function Connect4Game() {
  const router = useRouter();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();

  const BOARD_WIDTH = Math.min(SCREEN_WIDTH - BOARD_PADDING * 2, SCREEN_HEIGHT * 0.55, 700);
  const CELL_SIZE = BOARD_WIDTH / COLS;
  const BOARD_HEIGHT = CELL_SIZE * ROWS;

  const [board, setBoard] = useState(Array(ROWS).fill(null).map(() => Array(COLS).fill(0)));
  const [currentPlayer, setCurrentPlayer] = useState(1); // 1: Red, 2: Yellow
  const [gameMode, setGameMode] = useState('alone'); // 'alone' or 'friend'
  const [winner, setWinner] = useState(null);
  const [isThinking, setIsThinking] = useState(false);

  // --- CRITICAL LOCKS ---
  const isProcessingRef = useRef(false);
  const dropY = useSharedValue(-CELL_SIZE);
  const [animatingPiece, setAnimatingPiece] = useState(null);

  const checkWinner = useCallback((currentBoard) => {
    // Horizontal
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 3; c++) {
        if (currentBoard[r][c] !== 0 && currentBoard[r][c] === currentBoard[r][c+1] && currentBoard[r][c] === currentBoard[r][c+2] && currentBoard[r][c] === currentBoard[r][c+3]) return currentBoard[r][c];
      }
    }
    // Vertical
    for (let r = 0; r < ROWS - 3; r++) {
      for (let c = 0; c < COLS; c++) {
        if (currentBoard[r][c] !== 0 && currentBoard[r][c] === currentBoard[r+1][c] && currentBoard[r][c] === currentBoard[r+2][c] && currentBoard[r][c] === currentBoard[r+3][c]) return currentBoard[r][c];
      }
    }
    // Diagonal (down-right)
    for (let r = 0; r < ROWS - 3; r++) {
      for (let c = 0; c < COLS - 3; c++) {
        if (currentBoard[r][c] !== 0 && currentBoard[r][c] === currentBoard[r+1][c+1] && currentBoard[r][c] === currentBoard[r+2][c+2] && currentBoard[r][c] === currentBoard[r+3][c+3]) return currentBoard[r][c];
      }
    }
    // Diagonal (up-right)
    for (let r = 3; r < ROWS; r++) {
      for (let c = 0; c < COLS - 3; c++) {
        if (currentBoard[r][c] !== 0 && currentBoard[r][c] === currentBoard[r-1][c+1] && currentBoard[r][c] === currentBoard[r-2][c+2] && currentBoard[r][c] === currentBoard[r-3][c+3]) return currentBoard[r][c];
      }
    }
    if (currentBoard.every(row => row.every(cell => cell !== 0))) return 'draw';
    return null;
  }, []);

  const handleMoveComplete = useCallback((row, col, player) => {
    setBoard(prev => {
      const newBoard = prev.map(r => [...r]);
      newBoard[row][col] = player;
      return newBoard;
    });
    setAnimatingPiece(null);
    dropY.value = -CELL_SIZE;
    setIsThinking(false);
    isProcessingRef.current = false;
    setCurrentPlayer(player === 1 ? 2 : 1);
  }, [dropY, CELL_SIZE]);

  const makeComputerMove = useCallback(() => {
    if (isProcessingRef.current || winner) return;
    isProcessingRef.current = true; // ACQUIRE LOCK IMMEDIATELY

    const currentBoard = board;
    const validCols = [];
    for (let c = 0; c < COLS; c++) {
      if (currentBoard[0][c] === 0) validCols.push(c);
    }

    if (validCols.length === 0) {
      setIsThinking(false);
      isProcessingRef.current = false;
      return;
    }

    let chosenCol = -1;
    // 1. Win
    for (let c of validCols) {
      const tempBoard = currentBoard.map(r => [...r]);
      let r = ROWS - 1; while (r >= 0 && tempBoard[r][c] !== 0) r--;
      tempBoard[r][c] = 2;
      if (checkWinner(tempBoard) === 2) { chosenCol = c; break; }
    }
    // 2. Block
    if (chosenCol === -1) {
      for (let c of validCols) {
        const tempBoard = currentBoard.map(r => [...r]);
        let r = ROWS - 1; while (r >= 0 && tempBoard[r][c] !== 0) r--;
        tempBoard[r][c] = 1;
        if (checkWinner(tempBoard) === 1) { chosenCol = c; break; }
      }
    }
    // 3. Random
    if (chosenCol === -1) chosenCol = validCols[Math.floor(Math.random() * validCols.length)];
    
    let row = ROWS - 1;
    while (row >= 0 && currentBoard[row][chosenCol] !== 0) row--;
    
    setAnimatingPiece({ col: chosenCol, player: 2 });
    playSound('pop');

    dropY.value = withTiming(row * CELL_SIZE, { duration: 500 }, () => {
      runOnJS(handleMoveComplete)(row, chosenCol, 2);
    });
  }, [board, winner, checkWinner, playSound, dropY, handleMoveComplete]);

  const dropPieceRef = useRef(() => {});
  dropPieceRef.current = (col) => {
    if (winner || isThinking || animatingPiece || isProcessingRef.current || (gameMode === 'alone' && currentPlayer === 2)) return;

    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][col] === 0) { row = r; break; }
    }
    if (row === -1) return;

    isProcessingRef.current = true;
    setAnimatingPiece({ col, player: currentPlayer });
    playSound('pop');

    dropY.value = withTiming(row * CELL_SIZE, { duration: 500 }, () => {
      runOnJS(handleMoveComplete)(row, col, currentPlayer);
    });
  };

  const dropPiece = useCallback((col) => {
    dropPieceRef.current(col);
  }, []);

  const onColumnTap = useCallback((col) => {
    dropPieceRef.current(col);
  }, []);

  const boardTouch = useTouchHandler({
    onStart: ({ x }) => {
      const col = Math.floor(x / CELL_SIZE);
      if (col >= 0 && col < COLS) {
        runOnJS(onColumnTap)(col);
      }
    },
  }, [CELL_SIZE, onColumnTap]);

  // --- LOGIC EFFECTS ---

  // 1. Winner Check
  useEffect(() => {
    const win = checkWinner(board);
    if (win && !winner) {
      setWinner(win);
      playSound(win === 'draw' ? 'wrong' : 'win');
    }
  }, [board, winner, checkWinner, playSound]);

  // 2. AI Turn Management
  useEffect(() => {
    let timer;
    if (!winner && gameMode === 'alone' && currentPlayer === 2 && !isProcessingRef.current) {
      // Start thinking message
      setIsThinking(true);
      // Logic is inside makeComputerMove which will be called after delay
      timer = setTimeout(() => {
        makeComputerMove();
      }, 800);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [currentPlayer, gameMode, winner, makeComputerMove]); // Removed isThinking from deps to avoid self-cancellation

  const resetGame = () => {
    setBoard(Array(ROWS).fill(null).map(() => Array(COLS).fill(0)));
    setCurrentPlayer(1);
    setWinner(null);
    setIsThinking(false);
    setAnimatingPiece(null);
    isProcessingRef.current = false;
    dropY.value = -CELL_SIZE;
    playSound('pop');
  };

  const handleListen = () => {
    const msg = winner 
      ? (winner === 'draw' ? t.draw : (winner === 1 ? t.redWins : t.yellowWins))
      : (currentPlayer === 1 ? t.yourTurn : (gameMode === 'alone' ? t.computerTurn : t.friendTurn));
    speak(msg, language);
  };

  const boardPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT), 15, 15));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        path.addCircle(c * CELL_SIZE + CELL_SIZE / 2, r * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE * 0.4);
      }
    }
    path.setFillType(FillType.EvenOdd);
    return path;
  }, [BOARD_WIDTH, BOARD_HEIGHT, CELL_SIZE]);

  return (
    <View style={styles.container}>
      <AnimatedBackground />
      <Header title={`🔴 ${t.connect4Game} 🟡`} rightComponent={
        <TouchableOpacity onPress={handleListen}><Ionicons name="volume-high" size={28} color="white" /></TouchableOpacity>
      }/>
      <View style={[styles.content, { paddingHorizontal: SCREEN_WIDTH * 0.05, paddingVertical: SCREEN_HEIGHT * 0.05 }]}>
        <View style={styles.modeContainer}>
          <TouchableOpacity style={[styles.modeBtn, gameMode === 'alone' && styles.activeMode]} onPress={() => { setGameMode('alone'); resetGame(); }}>
            <Ionicons name="person" size={24} color={gameMode === 'alone' ? 'white' : '#666'} />
            <Text style={[styles.modeText, gameMode === 'alone' && styles.activeModeText]}>{t.playAlone}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, gameMode === 'friend' && styles.activeMode]} onPress={() => { setGameMode('friend'); resetGame(); }}>
            <Ionicons name="people" size={24} color={gameMode === 'friend' ? 'white' : '#666'} />
            <Text style={[styles.modeText, gameMode === 'friend' && styles.activeModeText]}>{t.playWithFriend}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statusBox}>
          {winner ? (
            <Text style={styles.winnerMsg}>{winner === 'draw' ? t.draw : (winner === 1 ? `🔴 ${t.redWins}` : `🟡 ${t.yellowWins}`)}</Text>
          ) : (
            <Text style={[styles.turnMsg, { color: currentPlayer === 1 ? '#FF6347' : '#D4AF37' }]}>
              {currentPlayer === 1 ? `🔴 ${t.yourTurn}` : (gameMode === 'alone' ? `🤖 ${t.computerTurn}` : `🟡 ${t.friendTurn}`)}
            </Text>
          )}
        </View>
        <View style={[styles.boardWrapper, { width: BOARD_WIDTH, height: BOARD_HEIGHT }]}>
          <Canvas style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT }} onTouch={boardTouch}>
            {board.map((row, r) => row.map((cell, c) => cell !== 0 && (
              <Circle key={`static-${r}-${c}`} cx={c * CELL_SIZE + CELL_SIZE / 2} cy={r * CELL_SIZE + CELL_SIZE / 2} r={CELL_SIZE * 0.42}>
                <LinearGradient start={vec(c * CELL_SIZE, r * CELL_SIZE)} end={vec((c+1) * CELL_SIZE, (r+1) * CELL_SIZE)} colors={cell === 1 ? ['#FF6347', '#B22222'] : ['#FFD700', '#DAA520']} />
              </Circle>
            )))}
            {animatingPiece && (
              <Circle cx={animatingPiece.col * CELL_SIZE + CELL_SIZE / 2} cy={dropY} r={CELL_SIZE * 0.42}>
                <LinearGradient start={vec(animatingPiece.col * CELL_SIZE, 0)} end={vec((animatingPiece.col + 1) * CELL_SIZE, CELL_SIZE)} colors={animatingPiece.player === 1 ? ['#FF6347', '#B22222'] : ['#FFD700', '#DAA520']} />
              </Circle>
            )}
            <Path path={boardPath} color="#1E90FF" />
          </Canvas>
        </View>
        <TouchableOpacity style={styles.resetBtn} onPress={resetGame}><Ionicons name="refresh" size={30} color="white" /></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#00CED1' },
  content: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center'
  },
  modeContainer: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  modeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, elevation: 3 },
  activeMode: { backgroundColor: '#00CED1' },
  modeText: { marginLeft: 8, fontSize: 14, fontFamily: 'Fredoka-SemiBold', color: '#666' },
  activeModeText: { color: 'white' },
  statusBox: { height: 50, justifyContent: 'center', marginBottom: 5 },
  turnMsg: { fontSize: 20, fontFamily: 'Fredoka-SemiBold', textShadowColor: 'rgba(0,0,0,0.1)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  winnerMsg: { fontSize: 24, fontFamily: 'Fredoka-SemiBold', color: '#32CD32' },
  boardWrapper: { 
    borderRadius: 15, 
    overflow: 'hidden', 
    elevation: 10, 
    backgroundColor: 'white',
  },
  resetBtn: { marginTop: 20, backgroundColor: '#FF69B4', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 5 },
});
