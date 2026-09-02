/**
 * ErrorBoundary
 * Catches unhandled JS errors and shows a friendly screen with reload button.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        </View>
        <Text style={styles.title}>Terjadi Kesalahan</Text>
        <Text style={styles.subtitle}>
          Aplikasi mengalami error yang tidak terduga.{'\n'}Coba muat ulang halaman ini.
        </Text>
        {!!this.state.error?.message && (
          <View style={styles.errorBox}>
            <Text style={styles.errorMsg} numberOfLines={4}>
              {this.state.error.message}
            </Text>
          </View>
        )}
        <TouchableOpacity style={styles.btn} onPress={this.handleReset} activeOpacity={0.85}>
          <Ionicons name="refresh-outline" size={18} color="#fff" />
          <Text style={styles.btnText}>Muat Ulang</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#F9FAFB',
    justifyContent: 'center', alignItems: 'center',
    padding: 32, gap: 12,
  },
  iconWrap: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  errorBox: {
    backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12,
    width: '100%',
  },
  errorMsg: { fontSize: 11, color: '#DC2626', fontFamily: 'monospace' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EF4444', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
