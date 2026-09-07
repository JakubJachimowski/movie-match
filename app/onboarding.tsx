import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthStore } from '../store/useAuthStore';

// Maksymalna długość nicku = liczba znaków w "ciasteczka_i_jednorozce".
// Dozwolone znaki: litery, cyfry, "_" i "-".
const USERNAME_MAX_LENGTH = 'ciasteczka_i_jednorozce'.length;
const USERNAME_ALLOWED_CHARS = /[^a-zA-Z0-9_-]/g;

function sanitizeUsername(text: string): string {
  return text.replace(USERNAME_ALLOWED_CHARS, '').slice(0, USERNAME_MAX_LENGTH);
}

export default function OnboardingScreen() {
  const createProfile = useAuthStore((s) => s.createProfile);
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar);

  const [username, setUsername] = useState('');
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Potrzebuję dostępu do galerii, żeby ustawić avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setLocalAvatarUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    setError(null);
    const trimmed = username.trim();
    if (trimmed.length < 3) {
      setError('Nazwa użytkownika musi mieć co najmniej 3 znaki.');
      return;
    }
    setSaving(true);
    try {
      let avatarUrl: string | null = null;
      if (localAvatarUri) {
        avatarUrl = await uploadAvatar(localAvatarUri);
      }
      await createProfile(trimmed, avatarUrl);
    } catch (e: any) {
      const message: string = e?.message ?? 'Nie udało się zapisać profilu.';
      setError(message.includes('duplicate') || message.includes('unique') ? 'Ta nazwa użytkownika jest już zajęta.' : message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
    >
      <Image
        source={require('../assets/images/moviematchbackground7.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <Text style={styles.title}>Stwórz swój profil</Text>

      <TouchableOpacity style={styles.avatarPicker} onPress={pickAvatar}>
        {localAvatarUri ? (
          <Image source={{ uri: localAvatarUri }} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <Text style={styles.avatarPlaceholderText}>Dodaj{'\n'}avatar</Text>
        )}
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        placeholder="Nazwa użytkownika"
        placeholderTextColor="#7C8798"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={USERNAME_MAX_LENGTH}
        value={username}
        onChangeText={(text) => setUsername(sanitizeUsername(text))}
      />
      <Text style={styles.hintText}>
        Litery, cyfry, „_” i „-”, maks. {USERNAME_MAX_LENGTH} znaków.
      </Text>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Zapisz i zacznij</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F17', justifyContent: 'center', padding: 24 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 15, 23,0.72)' },
  title: { color: '#ECEEF2', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  avatarPicker: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarPlaceholderText: { color: '#7C8798', textAlign: 'center', fontSize: 13 },
  input: {
    backgroundColor: '#141A24',
    borderWidth: 0.5,
    borderColor: '#7C8798',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ECEEF2',
    fontSize: 15,
    marginBottom: 12,
  },
  errorText: { color: '#E07A5F', marginBottom: 12, textAlign: 'center' },
  hintText: { color: '#7C8798', fontSize: 11, marginBottom: 16, textAlign: 'center' },
  saveButton: { backgroundColor: '#4a7', borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
