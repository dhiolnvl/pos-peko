import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const { login, isLoading, error, clearError, isAuthenticated, user, currentBranch } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'owner' && !currentBranch) {
        router.replace('/(auth)/select-branch');
      } else if (user.role === 'owner') {
        router.replace('/(owner)');
      } else if (user.role === 'back_office') {
        router.replace('/(backoffice)');
      } else if (user.role === 'cashier') {
        router.replace('/(cashier)');
      }
    }
  }, [isAuthenticated, user, currentBranch]);

  const validateForm = (): boolean => {
    setValidationError('');
    clearError();

    if (!email.trim()) {
      setValidationError('Email harus diisi');
      return false;
    }

    if (!email.includes('@')) {
      setValidationError('Format email tidak valid');
      return false;
    }

    if (!password) {
      setValidationError('Password harus diisi');
      return false;
    }

    if (password.length < 6) {
      setValidationError('Password minimal 6 karakter');
      return false;
    }

    return true;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: any) {
      console.error('Login error:', err);
    }
  };

  const handleQuickLogin = async (quickEmail: string, quickPassword: string) => {
    setEmail(quickEmail);
    setPassword(quickPassword);
    setValidationError('');
    clearError();
    try {
      await login(quickEmail, quickPassword);
    } catch (err: any) {
      console.error('Quick login error:', err);
    }
  };

  const displayError = validationError || error;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Image
              source={require('@/assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.subtitle}>Sistem Kasir Multi-Cabang</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color="#56B2C1" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="email@example.com"
                  value={email}
                  onChangeText={(text) => { setEmail(text); setValidationError(''); clearError(); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                  placeholderTextColor="#A0AEC0"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#56B2C1" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Masukkan password"
                  value={password}
                  onChangeText={(text) => { setPassword(text); setValidationError(''); clearError(); }}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                  placeholderTextColor="#A0AEC0"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon} disabled={isLoading}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#A0AEC0" />
                </TouchableOpacity>
              </View>
            </View>

            {displayError && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color="#E53E3E" />
                <Text style={styles.errorText}>{displayError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Masuk</Text>
              )}
            </TouchableOpacity>

            <View style={styles.quickLoginContainer}>
              <View style={styles.quickLoginDivider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>Quick Login</Text>
                <View style={styles.dividerLine} />
              </View>
              <View style={styles.quickLoginButtons}>
                <TouchableOpacity
                  style={[styles.quickLoginBtn, styles.quickLoginOwner]}
                  onPress={() => handleQuickLogin('owner@pekopetshop.com', 'owner@pekopetshop.com')}
                  disabled={isLoading}
                >
                  <Ionicons name="shield-checkmark-outline" size={16} color="#347385" />
                  <Text style={[styles.quickLoginBtnText, { color: '#347385' }]}>Owner</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickLoginBtn, styles.quickLoginKasir]}
                  onPress={() => handleQuickLogin('kasir@pekopetshop.com', 'kasir@pekopetshop.com')}
                  disabled={isLoading}
                >
                  <Ionicons name="person-outline" size={16} color="#56B2C1" />
                  <Text style={[styles.quickLoginBtnText, { color: '#56B2C1' }]}>Kasir</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.quickLoginButtons}>
                <TouchableOpacity
                  style={[styles.quickLoginBtn, styles.quickLoginStaff]}
                  onPress={() => handleQuickLogin('staff@pekopetshop.com', 'staff@pekopetshop.com')}
                  disabled={isLoading}
                >
                  <Ionicons name="briefcase-outline" size={16} color="#E69738" />
                  <Text style={[styles.quickLoginBtnText, { color: '#E69738' }]}>Staff Cabang</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickLoginBtn, styles.quickLoginPusat]}
                  onPress={() => handleQuickLogin('staffpusat@pekopetshop.com', 'staffpusat@pekopetshop.com')}
                  disabled={isLoading}
                >
                  <Ionicons name="business-outline" size={16} color="#7B61FF" />
                  <Text style={[styles.quickLoginBtnText, { color: '#7B61FF' }]}>Staff Pusat</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.infoText}>
              Akun dibuat oleh pemilik toko. Hubungi pemilik jika Anda belum memiliki akun.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F7F9',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 240,
    height: 110,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#718096',
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3748',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A9DFE9',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#1A202C',
  },
  eyeIcon: {
    padding: 4,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF5F5',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEB2B2',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#E53E3E',
  },
  button: {
    backgroundColor: '#56B2C1',
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 12,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  quickLoginContainer: {
    gap: 12,
  },
  quickLoginDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#A9DFE9',
  },
  dividerText: {
    fontSize: 12,
    color: '#56B2C1',
    fontWeight: '500',
  },
  quickLoginButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  quickLoginBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  quickLoginOwner: {
    backgroundColor: '#EEF8FA',
    borderColor: '#347385',
  },
  quickLoginKasir: {
    backgroundColor: '#EEF8FA',
    borderColor: '#56B2C1',
  },
  quickLoginStaff: {
    backgroundColor: '#FFF8EE',
    borderColor: '#E69738',
  },
  quickLoginPusat: {
    backgroundColor: '#F3F0FF',
    borderColor: '#7B61FF',
  },
  quickLoginBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
