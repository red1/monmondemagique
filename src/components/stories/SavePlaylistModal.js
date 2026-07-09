import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function SavePlaylistModal({
  visible,
  onClose,
  onSave,
  storyCount,
  labels,
}) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (visible) setName('');
  }, [visible]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{labels.title}</Text>
          <Text style={styles.subtitle}>{labels.subtitle(storyCount)}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={labels.placeholder}
            placeholderTextColor="#aaa"
            autoFocus
            maxLength={60}
          />
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{labels.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!name.trim()}
            >
              <Ionicons name="bookmark" size={18} color="white" />
              <Text style={styles.saveText}>{labels.save}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
  },
  title: { fontFamily: 'Fredoka-SemiBold', fontSize: 20, color: '#333', marginBottom: 8 },
  subtitle: { fontFamily: 'Fredoka-SemiBold', fontSize: 14, color: '#666', marginBottom: 16 },
  input: {
    backgroundColor: '#f8f8f8',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#9B59B6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Fredoka-SemiBold',
    color: '#333',
    marginBottom: 16,
  },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  cancelText: { fontFamily: 'Fredoka-SemiBold', fontSize: 15, color: '#666' },
  saveBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#9B59B6',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { fontFamily: 'Fredoka-SemiBold', fontSize: 15, color: 'white' },
});
