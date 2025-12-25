import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, SafeAreaView, Dimensions, TextInput, FlatList, Keyboard } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSounds } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getStrings } from '../constants/Strings';
import Header from '../src/components/shared/Header';
import AnimatedBackground from '../src/components/shared/AnimatedBackground';
import { speak } from '../src/utils/speechService';

const { width } = Dimensions.get('window');

const WORDS = [
    'POMME', 'CHAT', 'CHIEN', 'SOLEIL', 'MAISON', 'ECOLE', 'FLEUR', 'OISEAU', 'LIVRE', 'JARDIN', 'BATEAU', 'AVION', 'TRAIN', 'VELO', 'AMIS', 'FAMILLE', 'BONBON', 'CHOCOLAT', 'GATEAU', 'FRUIT', 'LEGUME', 'CAROTTE', 'TOMATE', 'BANANE', 'FRAISE', 'CERISE', 'POIRE', 'ORANGE', 'CITRON', 'POMME', 'RAISIN', 'ANANAS', 'PECHE', 'ABRICOT', 'PRUNE', 'MELON', 'PASTEQUE', 'FRAISE', 'FRAMBOISE', 'MYRTILLE', 'MAMAN', 'PAPA', 'FRERE', 'SOEUR', 'GRAND-MERE', 'GRAND-PERE', 'ONCLE', 'TANTE', 'COUSIN', 'COUSINE', 'NEVEU', 'NIECE', 'AMI', 'AMIE', 'CAMARADE', 'VILLAGE', 'VILLE', 'PAYS', 'MONDE', 'TERRE', 'CIEL', 'ETOILE', 'LUNE', 'SOLEIL', 'NUAGE', 'PLUIE', 'NEIGE', 'VENT', 'ORAGE', 'ECLAIR', 'ARC-EN-CIEL', 'MER', 'OCEAN', 'LAC', 'RIVIERE', 'MONTAGNE', 'FORET', 'DESERT', 'ILE', 'PLAGE', 'VAGUE', 'SABLE', 'COQUILLAGE', 'POISSON', 'BALEINE', 'DAUPHIN', 'REQUIN', 'TORTUE', 'CRABE', 'CREVETTE', 'ETOILE DE MER', 'CHEVREUIL', 'LAPIN', 'ECUREUIL', 'HERISSON', 'RENARD', 'LOUP', 'OURS', 'CERF', 'SANGLIER', 'HIBOU', 'AIGLE', 'CANARD', 'OIE', 'POULE', 'COQ', 'POUSSIN', 'VACHE', 'CHEVRE', 'MOUTON', 'COCHON', 'CHEVAL', 'ANE', 'CHIEN', 'CHAT', 'SOURIS', 'HAMSTER', 'LAPIN', 'PERROQUET', 'CANARI', 'POISSON ROUGE', 'LION', 'TIGRE', 'ELEPHANT', 'GIRAFE', 'ZEBRE', 'SINGE', 'GORILLE', 'CHIMPANZE', 'HIPPOPOTAME', 'RHINOCEROS', 'CROCODILE', 'SERPENT', 'LÉZARD', 'GRENOUILLE', 'CRAPAUD', 'ARAIGNÉE', 'FOURMI', 'ABEILLE', 'GUÊPE', 'PAPILLON', 'LIBELLULE', 'MOUCHE', 'MOUSTIQUE', 'COCCINELLE', 'ESCARGOT', 'LIMAÇON', 'VERS DE TERRE', 'ROUGE', 'BLEU', 'VERT', 'JAUNE', 'ORANGE', 'VIOLET', 'ROSE', 'MARRON', 'NOIR', 'BLANC', 'GRIS', 'BEIGE', 'TURQUOISE', 'DORE', 'ARGENTE', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF', 'DIX', 'ONZE', 'DOUZE', 'TREIZE', 'QUATORZE', 'QUINZE', 'SEIZE', 'DIX-SEPT', 'DIX-HUIT', 'DIX-NINE', 'VINGT', 'TRENTE', 'QUARANTE', 'CINQUANTE', 'SOIXANTE', 'SEPTANTE', 'OCTANTE', 'NONANTE', 'CENT', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE', 'JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE', 'PRINTEMPS', 'ETE', 'AUTOMNE', 'HIVER', 'MATIN', 'MIDI', 'APRES-MIDI', 'SOIR', 'NUIT', 'HEURE', 'MINUTE', 'SECONDE', 'JOUR', 'SEMAINE', 'MOIS', 'ANNEE', 'SIECLE', 'TÊTE', 'CHEVEUX', 'VISAGE', 'FRONT', 'OEIL', 'NEZ', 'BOUCHE', 'LEVRE', 'DENT', 'LANGUE', 'OREILLE', 'COU', 'EPAULE', 'BRAS', 'COUDE', 'POIGNET', 'MAIN', 'DOIGT', 'POUCE', 'INDEX', 'MAJEUR', 'ANNULAIRE', 'AURICULAIRE', 'ONGLE', 'POITRINE', 'VENTRE', 'DOS', 'JAMBE', 'CUISSE', 'GENOU', 'CHEVILLE', 'PIED', 'ORTEIL', 'TALON', 'PEAU', 'SANG', 'OS', 'COEUR', 'POUMON', 'ESTOMAC', 'CERVEAU', 'CHEMISE', 'T-SHIRT', 'PULL', 'GILET', 'VESTE', 'MANTEAU', 'PANTALON', 'JEAN', 'SHORT', 'JUPE', 'ROBE', 'CHAUSSETTE', 'CHAUSSURE', 'BOTTE', 'SANDALE', 'CHAPEAU', 'BONNET', 'CASQUETTE', 'ECHARPE', 'GANT', 'CEINTURE', 'CRAVATE', 'PYJAMA', 'MAILLOT DE BAIN', 'LUNETTE', 'MONTRE', 'BIJOU', 'BAGUE', 'COLLIER', 'BOUCLE D\'OREILLE', 'SAC', 'PORTEFEUILLE', 'PARAPLUIE', 'TABLE', 'CHAISE', 'FAUTEUIL', 'CANAPE', 'LIT', 'ARMOIRE', 'ETAGERE', 'BUREAU', 'LAMPE', 'MIROIR', 'TAPIS', 'RIDEAU', 'FENETRE', 'PORTE', 'MUR', 'PLAFOND', 'SOL', 'ESCALIER', 'CUISINE', 'SALON', 'CHAMBRE', 'SALLE DE BAIN', 'TOILETTE', 'BALCON', 'TERRASSE', 'GARAGE', 'ASSASSIETTE', 'VERRE', 'COUTEAU', 'FOURCHETTE', 'CUILLERE', 'BOL', 'TASSE', 'POELE', 'CASSEROLE', 'FOUR', 'REFRIGERATEUR', 'CONGÉLATEUR', 'LAVE-VAISSELLE', 'LAVE-LINGE', 'TELEVISION', 'ORDINATEUR', 'TELEPHONE', 'RADIO', 'REVEIL', 'ASPIRATEUR', 'FER A REPASSER', 'STYLOS', 'CRAYON', 'GOMME', 'REGLE', 'CISEAUX', 'COLLE', 'CAHIER', 'CLASSEUR', 'FEUILLE', 'PAPIER', 'ENVELOPPE', 'TIMBRE', 'LIVRE', 'DICTIONNAIRE', 'JOURNAL', 'MAGAZINE', 'MEDECIN', 'INFIRMIER', 'DENTISTE', 'PHARMACIEN', 'VETERINAIRE', 'PROFESSEUR', 'MAITRE', 'MAITRESSE', 'POLICIER', 'POMPIER', 'FACTEUR', 'BOULANGER', 'BOUCHER', 'EPICIER', 'VENDEUR', 'SERVEUR', 'CUISINIER', 'AGRICULTEUR', 'JARDINIER', 'CHAUFFEUR', 'PILOTE', 'MARIN', 'MECANICIEN', 'ELECTRICIEN', 'PLOMBIER', 'MENUISIER', 'MACON', 'PEINTRE', 'ARTISTE', 'MUSICIEN', 'CHANTEUR', 'ACTEUR', 'ECRIVAIN', 'JOURNALISTE', 'FOTOGRAPHE', 'INGENIEUR', 'AVOCAT', 'JUGE', 'POLITICIEN', 'SPORTIF', 'FOOTBALLEUR', 'TENNISMAN', 'CYCLISTE', 'NAGEUR', 'DANSEUR'
];

const MAX_MISTAKES = 10;
const KEY_WIDTH = (width * 0.45) / 7;

export default function HangmanGame() {
  const router = useRouter();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);
  const [word, setWord] = useState('');
  const [guessedLetters, setGuessedLetters] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const [gameStatus, setGameStatus] = useState('playing'); // playing, won, lost
  const [keyboardMode, setKeyboardMode] = useState('virtual'); // virtual, physical
  const inputRef = useRef(null);

  useEffect(() => {
    startNewGame();
  }, []);

  const startNewGame = () => {
    const randomWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    setWord(randomWord);
    setGuessedLetters([]);
    setMistakes(0);
    setGameStatus('playing');
    playSound('pop');
  };

  const handleGuess = (letter) => {
    if (gameStatus !== 'playing' || guessedLetters.includes(letter)) return;

    setGuessedLetters(prev => [...prev, letter]);
    
    if (!word.includes(letter)) {
      const newMistakes = mistakes + 1;
      setMistakes(newMistakes);
      playSound('wrong');
      if (newMistakes >= MAX_MISTAKES) {
        setGameStatus('lost');
        playSound('wrong');
      }
    } else {
      playSound('success');
      const allGuessed = word.split('').every(l => 
        l === ' ' || l === '-' || guessedLetters.includes(l) || l === letter
      );
      if (allGuessed) {
        setGameStatus('won');
        playSound('win');
      }
    }
  };

  const handlePhysicalInput = (text) => {
    const lastChar = text.slice(-1).toUpperCase();
    if (lastChar >= 'A' && lastChar <= 'Z') {
      handleGuess(lastChar);
    }
  };

  const toggleKeyboard = () => {
    playSound('pop');
    const newMode = keyboardMode === 'virtual' ? 'physical' : 'virtual';
    setKeyboardMode(newMode);
    if (newMode === 'physical') {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      Keyboard.dismiss();
    }
  };

  const renderHangman = () => {
    const color = mistakes >= MAX_MISTAKES ? '#FF4500' : '#444';
    const parts = [
      <View key="base" style={styles.base} />,
      <View key="pole" style={styles.pole} />,
      <View key="top" style={styles.topBar} />,
      <View key="rope" style={styles.rope} />,
      <View key="head" style={styles.head} />,
      <View key="body" style={styles.body} />,
      <View key="armL" style={styles.armLeft} />,
      <View key="armR" style={styles.armRight} />,
      <View key="legL" style={styles.legLeft} />,
      <View key="legR" style={styles.legRight} />,
    ];

    return (
      <View style={styles.hangmanContainer}>
        {parts.slice(0, mistakes)}
      </View>
    );
  };

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  const handleSpeakInstruction = () => {
    const text = t.back === 'Retour' ? 'Trouve le mot caché en choisissant les lettres !' : 'Find the hidden word by choosing letters!';
    speak(text, language);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <AnimatedBackground />
      <Header 
        title={`${t.hangmanGame}`} 
        rightComponent={
          <View style={{flexDirection:'row', gap: 10}}>
            <TouchableOpacity onPress={handleSpeakInstruction}>
              <Ionicons name="volume-high" size={28} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleKeyboard} style={styles.keyboardToggle}>
              <Ionicons name={keyboardMode === 'virtual' ? "keypad" : "keyboard"} size={28} color="white" />
            </TouchableOpacity>
          </View>
        }
      />

      <View style={styles.gameContainer}>
        {/* Left Column: Figure & Word */}
        <View style={styles.leftColumn}>
          {renderHangman()}
          <View style={styles.wordDisplay}>
            {word.split('').map((letter, index) => (
              <View key={index} style={styles.letterSlot}>
                <Text style={styles.letterText}>
                  {letter === ' ' ? ' ' : 
                   letter === '-' ? '-' :
                   guessedLetters.includes(letter) || gameStatus === 'lost' ? letter : ''}
                </Text>
                {letter !== ' ' && letter !== '-' && <View style={styles.letterUnderline} />}
              </View>
            ))}
          </View>
        </View>

        {/* Right Column: Keyboard */}
        <View style={styles.rightColumn}>
          {keyboardMode === 'virtual' ? (
            <View style={styles.keyboard}>
              {alphabet.map((letter) => (
                <TouchableOpacity
                  key={letter}
                  style={[
                    styles.key,
                    guessedLetters.includes(letter) && (word.includes(letter) ? styles.keyCorrect : styles.keyIncorrect)
                  ]}
                  onPress={() => handleGuess(letter)}
                  disabled={guessedLetters.includes(letter) || gameStatus !== 'playing'}
                >
                  <Text style={[styles.keyText, guessedLetters.includes(letter) && styles.keyTextUsed]}>
                    {letter}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.physicalInputContainer}>
              <Text style={styles.physicalText}>{t.back === 'Retour' ? 'Tape au clavier !' : 'Type on keyboard!'}</Text>
              <TextInput
                ref={inputRef}
                style={styles.hiddenInput}
                autoFocus
                autoCapitalize="characters"
                onChangeText={handlePhysicalInput}
                value=""
                blurOnSubmit={false}
              />
              <TouchableOpacity onPress={() => inputRef.current?.focus()} style={styles.focusBtn}>
                <Ionicons name="chatbox-ellipses" size={40} color="#9370DB" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <Modal visible={gameStatus !== 'playing'} transparent animationType="bounce">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>
              {gameStatus === 'won' ? '🎉' : '😢'}
            </Text>
            <Text style={styles.modalTitle}>
              {gameStatus === 'won' ? t.bravo : (t.back === 'Retour' ? 'Oh non !' : 'Oh no!')}
            </Text>
            <Text style={styles.modalText}>
              {gameStatus === 'won' 
                ? (t.back === 'Retour' ? 'Tu as trouvé le mot !' : 'You found the word!') 
                : (t.back === 'Retour' ? `Le mot était : ${word}` : `The word was: ${word}`)}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.speakBtn} onPress={() => speak(gameStatus === 'won' ? (t.back === 'Retour' ? 'Tu as trouvé le mot !' : 'You found the word!') : (t.back === 'Retour' ? `Le mot était : ${word}` : `The word was: ${word}`), language)}>
                <Ionicons name="volume-high" size={32} color="white" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.playAgainBtn} onPress={startNewGame}>
                <Text style={styles.playAgainText}>{t.play}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuBtn} onPress={() => router.back()}>
                <Text style={styles.menuBtnText}>{t.back}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F8FF' },
  keyboardToggle: { padding: 5 },
  gameContainer: { flex: 1, flexDirection: 'row', padding: 20 },
  leftColumn: { flex: 1.2, alignItems: 'center', justifyContent: 'center' },
  rightColumn: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hangmanContainer: { width: 200, height: 250, marginBottom: 40, position: 'relative' },
  base: { position: 'absolute', bottom: 0, width: 120, height: 10, backgroundColor: '#5D4037', left: 40, borderRadius: 5 },
  pole: { position: 'absolute', bottom: 10, left: 60, width: 10, height: 200, backgroundColor: '#5D4037', borderRadius: 5 },
  topBar: { position: 'absolute', top: 30, left: 60, width: 100, height: 10, backgroundColor: '#5D4037', borderRadius: 5 },
  rope: { position: 'absolute', top: 40, left: 145, width: 4, height: 30, backgroundColor: '#8D6E63' },
  head: { position: 'absolute', top: 70, left: 130, width: 34, height: 34, borderRadius: 17, borderWidth: 4, borderColor: '#333' },
  body: { position: 'absolute', top: 104, left: 145, width: 4, height: 60, backgroundColor: '#333' },
  armLeft: { position: 'absolute', top: 110, left: 125, width: 20, height: 4, backgroundColor: '#333', transform: [{ rotate: '-30deg' }] },
  armRight: { position: 'absolute', top: 110, left: 150, width: 20, height: 4, backgroundColor: '#333', transform: [{ rotate: '30deg' }] },
  legLeft: { position: 'absolute', top: 160, left: 130, width: 20, height: 4, backgroundColor: '#333', transform: [{ rotate: '-45deg' }] },
  legRight: { position: 'absolute', top: 160, left: 145, width: 20, height: 4, backgroundColor: '#333', transform: [{ rotate: '45deg' }] },
  wordDisplay: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  letterSlot: { width: 35, alignItems: 'center' },
  letterText: { fontSize: 32, fontFamily: 'Fredoka-SemiBold', color: '#333', fontWeight: 'bold' },
  letterUnderline: { width: '100%', height: 3, backgroundColor: '#333', marginTop: 5 },
  keyboard: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  key: { width: KEY_WIDTH, height: 55, backgroundColor: 'white', borderRadius: 10, justifyContent: 'center', alignItems: 'center', elevation: 3, borderBottomWidth: 4, borderBottomColor: '#ddd' },
  keyCorrect: { backgroundColor: '#76D256', borderBottomColor: '#4CA832' },
  keyIncorrect: { backgroundColor: '#FF6347', borderBottomColor: '#D32F2F', opacity: 0.5 },
  keyText: { fontSize: 24, fontFamily: 'Fredoka-SemiBold', color: '#333', fontWeight: 'bold' },
  keyTextUsed: { color: 'white' },
  physicalInputContainer: { alignItems: 'center', gap: 20 },
  physicalText: { fontSize: 20, fontFamily: 'Fredoka-SemiBold', color: '#9370DB' },
  hiddenInput: { width: 1, height: 1, opacity: 0 },
  focusBtn: { padding: 20, backgroundColor: 'white', borderRadius: 40, elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: 'white', padding: 30, borderRadius: 25, width: width * 0.8, alignItems: 'center', elevation: 10 },
  modalEmoji: { fontSize: 80, marginBottom: 20 },
  modalTitle: { fontSize: 32, fontFamily: 'Fredoka-SemiBold', color: '#333', marginBottom: 10 },
  modalText: { fontSize: 20, fontFamily: 'Fredoka-SemiBold', color: '#666', textAlign: 'center', marginBottom: 30 },
  modalActions: { flexDirection: 'row', gap: 15, alignItems: 'center' },
  speakBtn: { backgroundColor: '#76D256', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  playAgainBtn: { backgroundColor: '#76D256', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 50 },
  playAgainText: { color: 'white', fontSize: 20, fontFamily: 'Fredoka-SemiBold' },
  menuBtn: { backgroundColor: '#FF6347', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 50 },
  menuBtnText: { color: 'white', fontSize: 20, fontFamily: 'Fredoka-SemiBold' },
});
