import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Une erreur inattendue est survenue.',
    };
  }

  componentDidCatch(error, info) {
    if (__DEV__) {
      console.error('[AppErrorBoundary]', error, info?.componentStack);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>🛡️</Text>
        <Text style={styles.title}>Oups, petit problème</Text>
        <Text style={styles.message}>{this.state.message}</Text>
        <TouchableOpacity style={styles.btn} onPress={this.handleRetry} activeOpacity={0.85}>
          <Text style={styles.btnText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 24,
    color: '#FFD700',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  btn: {
    backgroundColor: '#00CED1',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  btnText: {
    fontFamily: 'Fredoka-SemiBold',
    fontSize: 16,
    color: 'white',
  },
});
