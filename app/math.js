import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView, Image, Modal, ScrollView, useWindowDimensions } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSounds } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getStrings } from '../constants/Strings';
import Header from '../src/components/shared/Header';
import AnimatedBackground from '../src/components/shared/AnimatedBackground';
import { speak } from '../src/utils/speechService';

export default function MathGame() {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { playSound } = useSounds();
  const { language } = useLanguage();
  const t = getStrings(language);
  const isLandscape = width > height;
  
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState('ADD_SIMPLE'); 
  const [showTutorial, setShowTutorial] = useState(true);
  const [showLevelUpChoice, setShowLevelUpChoice] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [pendingScore, setPendingScore] = useState(0);
  
  const [question, setQuestion] = useState({ a: 0, b: 0, ans: 0, op: '+' });
  const [options, setOptions] = useState([]);

  const getPhaseFromScore = (s) => {
      if (s < 20) return 'ADD_SIMPLE'; 
      if (s < 40) return 'SUB_SIMPLE';   
      if (s < 60) return 'MIX'; 
      if (s < 80) return 'MUL';   
      if (s < 100) return 'DIV';
      if (s < 120) return 'MENTAL_ADD';
      if (s < 140) return 'MENTAL_SUB';
      return 'MENTAL_MIX';
  };

  useEffect(() => {
    const newPhase = getPhaseFromScore(score);
    if (newPhase !== phase) {
        setPhase(newPhase);
        setShowTutorial(true); 
    }
  }, [score]);

  const generateQuestion = () => {
    let a, b, ans, op;
    const p = getPhaseFromScore(score);

    switch (p) {
        case 'ADD_SIMPLE': op = '+'; a = Math.floor(Math.random() * (score < 10 ? 5 : 10)) + 1; b = Math.floor(Math.random() * (score < 10 ? 5 : 10)) + 1; ans = a + b; break;
        case 'SUB_SIMPLE': op = '-'; a = Math.floor(Math.random() * 15) + 5; b = Math.floor(Math.random() * (a - 1)) + 1; ans = a - b; break;
        case 'MIX': op = Math.random() > 0.5 ? '+' : '-'; if (op === '+') { a = Math.floor(Math.random()*15); b = Math.floor(Math.random()*15); ans=a+b; } else { a = Math.floor(Math.random()*20)+5; b = Math.floor(Math.random()*a); ans=a-b; } break;
        case 'MUL': op = '×'; a = Math.floor(Math.random() * 5) + 1; b = Math.floor(Math.random() * 5) + 1; ans = a * b; break;
        case 'DIV': op = '÷'; b = Math.floor(Math.random() * 4) + 1; ans = Math.floor(Math.random() * 5) + 1; a = b * ans; break;
        case 'MENTAL_ADD': op = '+'; a = Math.floor(Math.random() * 50) + 10; b = Math.floor(Math.random() * 40) + 5; ans = a + b; break;
        case 'MENTAL_SUB': op = '-'; a = Math.floor(Math.random() * 80) + 20; b = Math.floor(Math.random() * (a - 10)) + 5; ans = a - b; break;
        case 'MENTAL_MIX':
            const rand = Math.random();
            if (rand < 0.3) { op = '+'; a = Math.floor(Math.random() * 60); b = Math.floor(Math.random() * 40); ans = a + b; }
            else if (rand < 0.6) { op = '-'; a = Math.floor(Math.random() * 90); b = Math.floor(Math.random() * a); ans = a - b; }
            else { op = '×'; a = Math.floor(Math.random() * 10); b = Math.floor(Math.random() * 10); ans = a * b; }
            break;
        default: op = '+'; a=1; b=1; ans=2;
    }

    setQuestion({ a, b, ans, op });
    let opts = new Set([ans]);
    while (opts.size < 3) {
      let r = ans + Math.floor(Math.random() * 20) - 10;
      if (r < 0) r = 0;
      opts.add(r);
    }
    setOptions(Array.from(opts).sort(() => Math.random() - 0.5));
  };

  useEffect(() => {
    if (!showTutorial && !showLevelUpChoice) generateQuestion();
  }, [showTutorial, showLevelUpChoice]);

  const handleAnswer = (val) => {
    if (val === question.ans) {
      playSound('success');
      const newScore = score + 1;
      if (newScore > 0 && newScore % 20 === 0) {
          playSound('win'); setPendingScore(newScore); setShowLevelUpChoice(true);
      } else {
          setScore(newScore);
          Alert.alert(t.bravo, t.bravo, [{ text: t.next, onPress: generateQuestion }]);
      }
    } else {
      playSound('wrong');
      Alert.alert(t.tryAgain, t.tryAgain);
    }
  };

  const handleLevelChoice = (choice) => {
      playSound('pop'); setShowLevelUpChoice(false); setScore(pendingScore);
  };

  const skipLevel = () => {
      playSound('pop');
      Alert.alert(t.skip + '?', t.skip + '?', [
          { text: t.back === 'Retour' ? 'Non' : 'No', style: "cancel" },
          { text: t.back === 'Retour' ? 'Oui !' : 'Yes!', onPress: () => setScore((Math.floor(score / 20) + 1) * 20) }
      ]);
  };

  const getHelpText = () => {
      const { a, b, op, ans } = question;
      if (op === '+') return t.helpAdd(a, b, ans);
      if (op === '-') return t.helpSub(a, b, ans);
      if (op === '×') return t.helpMul(a, b, ans);
      if (op === '÷') return t.helpDiv(a, b, ans);
      return t.tryAgain;
  };

  const handleSpeakQuestion = () => {
    const { a, b, op } = question;
    let opText = op;
    if (op === '+') opText = t.back === 'Retour' ? 'plus' : 'plus';
    if (op === '-') opText = t.back === 'Retour' ? 'moins' : 'minus';
    if (op === '×') opText = t.back === 'Retour' ? 'fois' : 'times';
    if (op === '÷') opText = t.back === 'Retour' ? 'divisé par' : 'divided by';
    
    const text = `${a} ${opText} ${b} ${t.back === 'Retour' ? 'égale combien ?' : 'equals how much?'}`;
    speak(text, language);
  };

  const TutorialModal = () => {
      let title=t.next, text=t.understand, icon="🚀";
      if (phase === 'ADD_SIMPLE') { title = t.mathGame + " (+)"; text = t.tutorialAdd; icon="🍎"; }
      else if (phase === 'SUB_SIMPLE') { title = t.mathGame + " (-)"; text = t.tutorialSub; icon="🍪"; }
      else if (phase === 'MIX') { title = "Mix !"; text = t.tutorialMix; icon="👀"; }
      else if (phase === 'MUL') { title = "Multiplication (×)"; text = t.tutorialMul; icon="📦"; }
      else if (phase === 'DIV') { title = "Division (÷)"; text = t.tutorialDiv; icon="🍰"; }
      else if (phase.startsWith('MENTAL')) { title = "Calcul Mental 🧠"; text = t.tutorialMental; icon="⚡"; }

      return (
        <Modal visible={showTutorial} transparent animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                    <Text style={styles.modalEmoji}>{icon}</Text>
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

  const LevelUpModal = () => (
    <Modal visible={showLevelUpChoice} transparent animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
                <Text style={styles.modalEmoji}>⭐</Text>
                <Text style={styles.modalTitle}>{t.level} !</Text>
                <Text style={styles.modalText}>{t.score}: {pendingScore}</Text>
                <View style={{gap: 15, width: '100%'}}>
                    <TouchableOpacity style={[styles.playBtn, {backgroundColor:'#4CAF50'}]} onPress={() => handleLevelChoice('next')}>
                        <Text style={styles.playBtnText}>{t.next} 🚀</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.playBtn, {backgroundColor:'#2196F3'}]} onPress={() => handleLevelChoice('stay')}>
                        <Text style={styles.playBtnText}>{t.back} 🔄</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    </Modal>
  );

  const HelpModal = () => (
    <Modal visible={showHelp} transparent animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
                <Ionicons name="help-circle" size={60} color="#FFD700" style={{marginBottom: 10}} />
                <Text style={styles.modalTitle}>{t.help}</Text>
                <Text style={styles.modalText}>{getHelpText()}</Text>
                <Text style={[styles.modalText, {fontWeight: 'bold', color: '#4CAF50'}]}>{t.score}: {question.ans}</Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={[styles.speakBtn, {backgroundColor: '#FFD700'}]} onPress={() => speak(getHelpText(), language)}>
                    <Ionicons name="volume-high" size={32} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.playBtn, {backgroundColor: '#FFD700'}]} onPress={() => { playSound('pop'); setShowHelp(false); }}>
                      <Text style={styles.playBtnText}>{t.understand}</Text>
                  </TouchableOpacity>
                </View>
            </View>
        </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <AnimatedBackground />
      <TutorialModal />
      <LevelUpModal />
      <HelpModal />

      <Header 
        title={`${t.mathGame}`} 
        rightComponent={
          <View style={{flexDirection:'row', gap: 10}}>
            <TouchableOpacity onPress={() => { playSound('pop'); setShowHelp(true); }}>
                <Ionicons name="help-circle" size={28} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={skipLevel}>
                <Ionicons name="play-forward" size={28} color="white" />
            </TouchableOpacity>
          </View>
        }
      />

      <View style={styles.scoreHeader}>
          <Text style={styles.scoreText}>{t.score}: {score}</Text>
      </View>

      <View style={styles.content}>
          <View style={styles.questionCard}>
              <View style={styles.row}>
                <Text style={styles.number}>{question.a}</Text>
                <Text style={styles.operator}>{question.op}</Text>
                <Text style={styles.number}>{question.b}</Text>
                <Text style={styles.operator}>=</Text>
                <Text style={[styles.number, {color: '#999'}]}>?</Text>
                <TouchableOpacity onPress={handleSpeakQuestion} style={styles.questionSpeakBtn}>
                  <Ionicons name="volume-high" size={30} color="#76D256" />
                </TouchableOpacity>
              </View>
              {phase === 'ADD_SIMPLE' && question.a <= 10 && question.b <= 10 && (
                  <View style={{flexDirection:'row', flexWrap: 'wrap', justifyContent:'center', marginTop: 15}}>
                      <View style={{flexDirection:'row'}}>{Array(question.a).fill(0).map((_,i)=><Text key={'a'+i} style={{fontSize:24}}>🍎</Text>)}</View>
                      <Text style={styles.visualOp}> + </Text>
                      <View style={{flexDirection:'row'}}>{Array(question.b).fill(0).map((_,i)=><Text key={'b'+i} style={{fontSize:24}}>🍎</Text>)}</View>
                  </View>
              )}
          </View>

          <View style={styles.optionsContainer}>
            {options.map((opt, index) => {
                let color = '#FF85C0'; let darkColor = '#D65D91';
                if (index === 1) { color = '#76D256'; darkColor = '#4CA832'; }
                if (index === 2) { color = '#5CA8FF'; darkColor = '#2B7ACC'; }
                return (
                    <TouchableOpacity key={index} style={[styles.optionBtn, { backgroundColor: color, borderBottomColor: darkColor }]} onPress={() => handleAnswer(opt)} activeOpacity={0.7}>
                      <View style={styles.shine} />
                      <Text style={styles.optionText}>{opt}</Text>
                    </TouchableOpacity>
                );
            })}
          </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5E1' },
  scoreHeader: { padding: 10, alignItems: 'center' },
  scoreText: { fontSize: 20, fontFamily: 'Fredoka-SemiBold', color: '#76D256' },
  content: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    gap: 30,
    marginHorizontal: '5%',
    marginVertical: '5%'
  },
  questionCard: { backgroundColor: 'white', padding: 20, borderRadius: 20, elevation: 5, alignItems: 'center', width: '100%', position: 'relative' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15 },
  number: { fontSize: 50, fontFamily: 'Fredoka-SemiBold', color: '#333' },
  operator: { fontSize: 40, fontFamily: 'Fredoka-SemiBold', color: '#FF6347' },
  visualOp: { fontSize: 20, marginHorizontal: 10, fontWeight: 'bold' },
  questionSpeakBtn: { marginLeft: 10 },
  optionsContainer: { flexDirection: 'row', gap: 15, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  optionBtn: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 6, elevation: 6, overflow: 'hidden' },
  shine: { position: 'absolute', top: 0, left: 10, width: 35, height: 20, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 20, transform: [{ rotate: '-20deg' }] },
  optionText: { fontSize: 30, fontFamily: 'Fredoka-SemiBold', color: 'white' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: 'white', width: '85%', padding: 30, borderRadius: 25, alignItems: 'center', elevation: 10 },
  modalEmoji: { fontSize: 60, marginBottom: 20 },
  modalTitle: { fontSize: 28, fontFamily: 'Fredoka-SemiBold', color: '#FF1493', marginBottom: 15, textAlign: 'center' },
  modalText: { fontSize: 18, fontFamily: 'Fredoka-SemiBold', color: '#555', textAlign: 'center', marginBottom: 30, lineHeight: 26 },
  modalActions: { flexDirection: 'row', gap: 15, alignItems: 'center' },
  speakBtn: { backgroundColor: '#76D256', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  playBtn: { backgroundColor: '#76D256', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 50, borderBottomWidth: 5, borderBottomColor: '#4CA832', alignItems: 'center' },
  playBtnText: { fontSize: 20, color: 'white', fontFamily: 'Fredoka-SemiBold' }
});
