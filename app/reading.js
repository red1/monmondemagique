import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView, Modal, Dimensions, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSounds } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getStrings } from '../constants/Strings';
import Header from '../src/components/shared/Header';
import AnimatedBackground from '../src/components/shared/AnimatedBackground';
import { speak } from '../src/utils/speechService';

const { width } = Dimensions.get('window');

const SYLLABLES = ['MA', 'PA', 'TO', 'RI', 'LU', 'BO', 'DE', 'LI', 'FA', 'MI', 'SO', 'RE', 'NA', 'KO', 'GU', 'VE', 'ZA', 'CH', 'FO', 'GA', 'PI', 'LE', 'TA'];
const SYLLABLES_LOWER = ['ma', 'pa', 'to', 'ri', 'lu', 'bo', 'de', 'li', 'fa', 'mi', 'so', 're', 'na', 'ko', 'gu', 've', 'za', 'ch', 'fo', 'ga', 'pi', 'le', 'ta'];

const WORDS_BY_SYLLABLE = {
    'MA': ['MAMAN', 'MARDI', 'MAISON', 'MATIN', 'MAIN', 'MARE', 'MARRON'],
    'PA': ['PAPA', 'PANIER', 'PAPILLON', 'PARC', 'PANTALON', 'PAS', 'PAIN'],
    'TO': ['TOMATE', 'TORTUE', 'TOBOGGAN', 'TOC', 'TORCHE', 'TOUR'],
    'BO': ['BONBON', 'BOTTE', 'BOUCHE', 'BOL', 'BOULE', 'BOUTEILLE', 'BOIS'],
    'CA': ['CAROTTE', 'CAMION', 'CANARD', 'CADEAU', 'CAFE', 'CASQUE', 'CARRE'],
    'PI': ['PIANO', 'PISCINE', 'PINCEAU', 'PIE', 'PILOTE', 'PIRATE', 'PIED'],
    'LI': ['LIVRE', 'LIT', 'LION', 'LIMONADE', 'LUNE', 'LIGNE', 'LIMAÇON'],
    'BA': ['BALLE', 'BANANE', 'BATEAU', 'BALAI', 'BAGUE', 'BAIN', 'BARBE'],
    'CH': ['CHAT', 'CHIEN', 'CHAISE', 'CHAPEAU', 'CHOCOLAT', 'CHAMPIGNON', 'CHEVRE'],
    'VE': ['VELO', 'VERT', 'VERRE', 'VENT', 'VESTE', 'VELOURS', 'VELOCE'],
    'GA': ['GATEAU', 'GARÇON', 'GANT', 'GARE', 'GAZON', 'GALETTE'],
    'RI': ['RIDEAU', 'RIZ', 'RIVIERE', 'ROBE', 'ROI', 'ROUE'],
    'FA': ['FARINE', 'FEE', 'FORET', 'FEU', 'FILLE', 'FLEUR'],
    'MI': ['MIEL', 'MIDI', 'MIROIR', 'MINE', 'MIMOSA', 'MISTIGRI'],
    'SO': ['SOLEIL', 'SOURIS', 'SOUPE', 'SOL', 'SORTIE', 'SORCIER'],
    'RE': ['REINE', 'REPAS', 'REQUIN', 'RENARD', 'REVE', 'REVEIL'],
};

const EMOJI_WORDS = [
    { emoji: '🍎', word: 'POMME' }, { emoji: '🐱', word: 'CHAT' }, { emoji: '🐶', word: 'CHIEN' }, { emoji: '🚗', word: 'VOITURE' }, { emoji: '☀️', word: 'SOLEIL' }, { emoji: '🌙', word: 'LUNE' }, { emoji: '🌸', word: 'FLEUR' }, { emoji: '🎈', word: 'BALLON' }, { emoji: '🍦', word: 'GLACE' }, { emoji: '🦁', word: 'LION' }, { emoji: '🐄', word: 'VACHE' }, { emoji: '🍓', word: 'FRAISE' }, { emoji: '🚲', word: 'VELO' }, { emoji: '🏠', word: 'MAISON' }, { emoji: '🧸', word: 'NOUNOURS' }, { emoji: '🐧', word: 'PINGOUIN' }, { emoji: '🐢', word: 'TORTUE' }, { emoji: '🦋', word: 'PAPILLON' }, { emoji: '🍄', word: 'CHAMPIGNON' }, { emoji: '🧀', word: 'FROMAGE' }, { emoji: '🥕', word: 'CAROTTE' }, { emoji: '🍭', word: 'SUCETTE' },
];

const LOGIC_PAIRS = [
    { q: 'QUI ABOIE ?', a: 'LE CHIEN' }, { q: 'QUI MIAULE ?', a: 'LE CHAT' }, { q: 'COULEUR DU CIEL', a: 'BLEU' }, { q: 'JE BRILLE LE JOUR', a: 'SOLEIL' }, { q: 'JE BRILLE LA NUIT', a: 'LUNE' }, { q: 'ON ME MANGE', a: 'POMME' }, { q: 'JE ROULE', a: 'VELO' }, { q: 'JE CHANTE', a: 'OISEAU' }, { q: 'ROI DE LA JUNGLE', a: 'LION' }, { q: 'JE DONNE DU LAIT', a: 'VACHE' }, { q: 'COULEUR DU FEU', a: 'ROUGE' }, { q: 'COULEUR DE L\'HERBE', a: 'VERT' }, { q: 'ON ME LIT', a: 'LIVRE' }, { q: 'POUR DORMIR', a: 'LIT' }, { q: 'DANS LA MER', a: 'POISSON' },
];

const SUBJECTS = ['LE CHAT', 'LA LUNE', 'MAMAN', 'PAPA', 'LE CHIEN', 'L\'OISEAU', 'LE ROBOT', 'LA FLEUR', 'LE LAPIN', 'LA SOURIS', 'LE SOLEIL', 'LE PETIT GARÇON', 'LA PETITE FILLE'];
const ACTIONS = ['DORT', 'BRILLE', 'MANGE', 'JOUE', 'CHANTE', 'MARCHE', 'SAUTE', 'SOUFFLE', 'REGARDE', 'ECOUTE', 'COURT', 'DANSE'];
const OBJECTS = ['DU LAIT', 'DANS LE CIEL', 'UNE POMME', 'AU BALLON', 'UNE CHANSON', 'VITE', 'TRES HAUT', 'DOUCEMENT', 'UN GATEAU', 'UNE HISTOIRE', 'LA TELE', 'DE LA MUSIQUE'];

export default function ReadingGame() {
    const router = useRouter();
    const { playSound } = useSounds();
    const { language } = useLanguage();
    const t = getStrings(language);
    const [score, setScore] = useState(0);
    const [level, setLevel] = useState(1);
    const [selectedLeft, setSelectedLeft] = useState(null);
    const [matchedPairs, setMatchedPairs] = useState([]);
    const [showTutorial, setShowTutorial] = useState(true);

    const currentLevelPairs = useMemo(() => {
        const pairs = [];
        const numPairs = Math.min(2 + Math.floor(level / 2), 10);
        if (level === 1) { pairs.push({ left: 'MA', right: 'MA' }); pairs.push({ left: 'PA', right: 'PA' }); }
        else if (level === 2) { pairs.push({ left: 'MA', right: 'MA' }); pairs.push({ left: 'PA', right: 'PA' }); pairs.push({ left: 'TO', right: 'TO' }); }
        else if (level <= 5) { const pool = [...SYLLABLES].sort(() => Math.random() - 0.5); for (let i = 0; i < numPairs; i++) { const s = pool[i % pool.length]; pairs.push({ left: s, right: s }); } }
        else if (level <= 8) { const pool = [...SYLLABLES].sort(() => Math.random() - 0.5); for (let i = 0; i < numPairs; i++) { const idx = SYLLABLES.indexOf(pool[i % pool.length]); pairs.push({ left: SYLLABLES[idx], right: SYLLABLES_LOWER[idx] }); } }
        else if (level <= 12) { const keys = Object.keys(WORDS_BY_SYLLABLE).sort(() => Math.random() - 0.5); for (let i = 0; i < numPairs; i++) { const s = keys[i % keys.length]; const words = WORDS_BY_SYLLABLE[s]; pairs.push({ left: s, right: words[Math.floor(Math.random() * words.length)] }); } }
        else if (level <= 16) { const pool = [...EMOJI_WORDS].sort(() => Math.random() - 0.5); for (let i = 0; i < numPairs; i++) { const item = pool[i % pool.length]; pairs.push({ left: item.emoji, right: item.word }); } }
        else if (level <= 20) { const keys = Object.keys(WORDS_BY_SYLLABLE).sort(() => Math.random() - 0.5); for (let i = 0; i < numPairs; i++) { const key = keys[i % keys.length]; const words = [...WORDS_BY_SYLLABLE[key]].sort(() => Math.random() - 0.5); pairs.push({ left: words[0], right: words[1] || words[0] }); } }
        else if (level <= 25) { const subPool = [...SUBJECTS].sort(() => Math.random() - 0.5); const actPool = [...ACTIONS].sort(() => Math.random() - 0.5); for (let i = 0; i < numPairs; i++) pairs.push({ left: subPool[i % subPool.length], right: actPool[i % actPool.length] }); }
        else if (level <= 30) { const pool = [...LOGIC_PAIRS].sort(() => Math.random() - 0.5); for (let i = 0; i < numPairs; i++) { const item = pool[i % pool.length]; pairs.push({ left: item.q, right: item.a }); } }
        else if (level <= 35) { const subPool = [...SUBJECTS].sort(() => Math.random() - 0.5); const actPool = [...ACTIONS].sort(() => Math.random() - 0.5); const objPool = [...OBJECTS].sort(() => Math.random() - 0.5); for (let i = 0; i < numPairs - 1; i++) { const phrase = `${subPool[i % subPool.length]} ${actPool[i % actPool.length]}`; pairs.push({ left: phrase, right: objPool[i % objPool.length] }); } }
        else { const mixPool = [ ...SYLLABLES.map(s => ({ left: s, right: s })), ...EMOJI_WORDS.map(e => ({ left: e.emoji, right: e.word })), ...LOGIC_PAIRS.map(l => ({ left: l.q, right: l.a })), ...SUBJECTS.map((s, i) => ({ left: s, right: ACTIONS[i % ACTIONS.length] })) ].sort(() => Math.random() - 0.5); for (let i = 0; i < numPairs; i++) pairs.push(mixPool[i % mixPool.length]); }
        return pairs;
    }, [level]);

    const gameData = useMemo(() => {
        const left = [...currentLevelPairs].sort(() => Math.random() - 0.5);
        const right = [...currentLevelPairs].sort(() => Math.random() - 0.5);
        return { left, right };
    }, [currentLevelPairs]);

    const handlePressLeft = (item) => {
      if(!matchedPairs.includes(item.left)) {
        playSound('pop'); 
        setSelectedLeft(item);
        if (item.left.length <= 10) speak(item.left, language);
      }
    };

    const handlePressRight = (item) => {
        if (!selectedLeft) {
          if (item.right.length <= 15) speak(item.right, language);
          return;
        }
        const isMatch = currentLevelPairs.find(p => p.left === selectedLeft.left && p.right === item.right);
        if (isMatch) {
            playSound('success'); const newMatched = [...matchedPairs, selectedLeft.left]; setMatchedPairs(newMatched); setSelectedLeft(null); setScore(s => s + level);
            if (newMatched.length === currentLevelPairs.length) {
                playSound('win');
                setTimeout(() => Alert.alert(t.bravo, `${t.level} ${level} ! ✨`, [{ text: t.next, onPress: () => { setLevel(l => l + 1); setMatchedPairs([]); setSelectedLeft(null); setShowTutorial(true); }}]), 500);
            }
        } else { playSound('wrong'); setSelectedLeft(null); }
    };

    const getTutorialText = () => {
        if (level >= 1 && level <= 5) return t.readingSyllables;
        if (level >= 6 && level <= 8) return t.readingSyllables;
        if (level >= 9 && level <= 12) return t.mathGame;
        if (level >= 13 && level <= 20) return t.readingWords;
        if (level >= 21 && level <= 25) return t.readingPhrases;
        if (level >= 26 && level <= 30) return t.readingLogic;
        if (level >= 31 && level <= 35) return t.readingPhrases;
        return t.readingLogic;
    };

    const TutorialModal = () => {
        let title = t.readingSyllables, icon = "book";
        if (level >= 6 && level <= 8) { title = "Aa / AA"; icon = "text"; }
        else if (level >= 9 && level <= 12) { title = t.mathGame; icon = "search"; }
        else if (level >= 13 && level <= 16) { title = t.readingWords; icon = "image"; }
        else if (level >= 17 && level <= 20) { title = t.readingWords; icon = "copy"; }
        else if (level >= 21 && level <= 25) { title = t.readingPhrases; icon = "chatbubbles"; }
        else if (level >= 26 && level <= 30) { title = t.readingLogic; icon = "bulb"; }
        else if (level >= 31 && level <= 35) { title = t.readingPhrases; icon = "document-text"; }
        else if (level > 35) { title = "Mega Mix !"; icon = "star"; }
        const text = getTutorialText();
        return (
            <Modal visible={showTutorial} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalLevel}>{t.level} {level}</Text>
                        <Ionicons name={icon} size={60} color="#FFD700" style={{marginBottom: 10}} />
                        <Text style={styles.modalTitle}>{title}</Text>
                        <Text style={styles.modalText}>{text}</Text>
                        <View style={styles.modalActions}>
                          <TouchableOpacity style={styles.speakBtn} onPress={() => speak(`${title}. ${text}`, language)}>
                            <Ionicons name="volume-high" size={32} color="white" />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.playBtn} onPress={() => { playSound('pop'); setShowTutorial(false); }}>
                              <Text style={styles.playBtnText}>{t.understand}</Text>
                          </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <AnimatedBackground />
            <TutorialModal />
            <Header title={`${t.readingGame}`} rightComponent={
              <View style={{flexDirection:'row', gap: 10}}>
                <TouchableOpacity onPress={() => speak(getTutorialText(), language)}>
                  <Ionicons name="volume-high" size={28} color="white" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setLevel(l => l + 1)}>
                  <Ionicons name="play-forward" size={28} color="white" />
                </TouchableOpacity>
              </View>
            } />
            <View style={styles.scoreHeader}><Text style={styles.scoreText}>{t.score}: {score}</Text></View>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.gameContent}>
                    <View style={styles.column}>{gameData.left.map((item, idx) => (
                        <TouchableOpacity key={'l-'+idx} style={[styles.card, selectedLeft?.left === item.left && styles.selectedCard, matchedPairs.includes(item.left) && styles.matchedCard]} onPress={() => handlePressLeft(item)}>
                            <Text style={[styles.cardText, matchedPairs.includes(item.left) && styles.matchedText]}>{item.left}</Text>
                        </TouchableOpacity>
                    ))}</View>
                    <View style={styles.column}>{gameData.right.map((item, idx) => (
                        <TouchableOpacity key={'r-'+idx} style={[styles.card, matchedPairs.includes(currentLevelPairs.find(p => p.right === item.right)?.left) && styles.matchedCard]} onPress={() => handlePressRight(item)}>
                            <Text style={[styles.cardText, matchedPairs.includes(currentLevelPairs.find(p => p.right === item.right)?.left) && styles.matchedText]}>{item.right}</Text>
                        </TouchableOpacity>
                    ))}</View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFF5E1' },
    scoreHeader: { padding: 5, alignItems: 'center' },
    scoreText: { fontSize: 18, fontFamily: 'Fredoka-SemiBold', color: '#FFD700' },
    scrollContent: { flexGrow: 1 },
    gameContent: { 
        flex: 1, 
        flexDirection: 'row', 
        paddingHorizontal: '5%',
        paddingVertical: '5%',
        gap: 15 
    },
    column: { flex: 1, justifyContent: 'center', gap: 10 },
    card: { backgroundColor: 'white', minHeight: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center', elevation: 3, borderBottomWidth: 4, borderBottomColor: '#ddd', padding: 8 },
    selectedCard: { backgroundColor: '#FFD700', borderBottomColor: '#DAA520', transform: [{scale: 1.02}] },
    matchedCard: { backgroundColor: '#E8F5E9', borderBottomWidth: 0, opacity: 0.6 },
    cardText: { fontSize: 18, fontFamily: 'Fredoka-SemiBold', color: '#333', textAlign: 'center' },
    matchedText: { color: '#4CAF50', textDecorationLine: 'line-through' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalCard: { backgroundColor: 'white', width: '80%', padding: 30, borderRadius: 25, alignItems: 'center', elevation: 10 },
    modalLevel: { fontSize: 18, color: '#999', fontFamily: 'Fredoka-SemiBold' },
    modalTitle: { fontSize: 26, fontFamily: 'Fredoka-SemiBold', color: '#FFD700', marginBottom: 10 },
    modalText: { fontSize: 18, fontFamily: 'Fredoka-SemiBold', color: '#555', textAlign: 'center', marginBottom: 25 },
    modalActions: { flexDirection: 'row', gap: 15, alignItems: 'center' },
    speakBtn: { backgroundColor: '#FFD700', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
    playBtn: { backgroundColor: '#FFD700', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 50, borderBottomWidth: 5, borderBottomColor: '#DAA520' },
    playBtnText: { color: 'white', fontSize: 20, fontFamily: 'Fredoka-SemiBold' }
});
