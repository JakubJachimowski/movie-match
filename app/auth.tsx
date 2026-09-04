import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthStore } from '../store/useAuthStore';

export default function AuthScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError('Podaj e-mail i hasło.');
      return;
    }
    if (mode === 'signUp' && password !== confirmPassword) {
      setError('Hasła się nie zgadzają.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signIn') {
        await signIn(email.trim(), password, rememberMe);
      } else {
        await signUp(email.trim(), password, rememberMe);
        setInfo('Konto utworzone. Jeśli w projekcie włączone jest potwierdzanie e-mail, sprawdź skrzynkę, a następnie się zaloguj.');
        setMode('signIn');
        setConfirmPassword('');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Coś poszło nie tak.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Image
        source={require('../assets/images/moviematchbackground.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>MovieMatch</Text>
          <Text style={styles.subtitle}>{mode === 'signIn' ? 'Zaloguj się' : 'Załóż konto'}</Text>

          <TextInput
            style={styles.input}
            placeholder="E-mail"
            placeholderTextColor="#B5AFA0"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Hasło"
              placeholderTextColor="#B5AFA0"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#B5AFA0" />
            </TouchableOpacity>
          </View>

          {mode === 'signUp' && (
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Powtórz hasło"
                placeholderTextColor="#B5AFA0"
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword((v) => !v)}
                hitSlop={8}
              >
                <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color="#B5AFA0" />
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe((v) => !v)} hitSlop={8}>
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && <Ionicons name="checkmark" size={14} color="#26251F" />}
            </View>
            <Text style={styles.rememberText}>Zapamiętaj mnie na tym urządzeniu</Text>
          </TouchableOpacity>

          {error && <Text style={styles.errorText}>{error}</Text>}
          {info && <Text style={styles.infoText}>{info}</Text>}

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#26251F" />
            ) : (
              <Text style={styles.submitButtonText}>
                {mode === 'signIn' ? 'Zaloguj się' : 'Zarejestruj się'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setError(null);
              setInfo(null);
              setConfirmPassword('');
              setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'));
            }}
          >
            <Text style={styles.switchText}>
              {mode === 'signIn' ? 'Nie masz konta? Zarejestruj się' : 'Masz już konto? Zaloguj się'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#26251F' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(38,37,31,0.72)' },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  title: { color: '#E8E4D9', fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  subtitle: { color: '#B5AFA0', fontSize: 16, textAlign: 'center', marginBottom: 24 },
  input: {
    backgroundColor: 'rgba(30,29,24,0.9)',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#E8E4D9',
    fontSize: 15,
    marginBottom: 12,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30,29,24,0.9)',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  passwordInput: { flex: 1, color: '#E8E4D9', fontSize: 15, paddingVertical: 12 },
  eyeButton: { paddingLeft: 8, paddingVertical: 4 },

  rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#B5AFA0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: { backgroundColor: '#4a7', borderColor: '#4a7' },
  rememberText: { color: '#E8E4D9', fontSize: 14 },

  errorText: { color: '#E07A5F', marginBottom: 12, textAlign: 'center' },
  infoText: { color: '#9FBF8F', marginBottom: 12, textAlign: 'center' },
  submitButton: {
    backgroundColor: '#4a7',
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  switchText: { color: '#B5AFA0', textAlign: 'center' },
});
