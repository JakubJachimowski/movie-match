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
        source={require('../assets/images/moviematchbackground.png')}
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
        placeholderTextColor="#B5AFA0"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Zapisz i zacznij</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#26251F', justifyContent: 'center', padding: 24 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(38,37,31,0.72)' },
  title: { color: '#E8E4D9', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  avatarPicker: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1E1D18',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarPlaceholderText: { color: '#B5AFA0', textAlign: 'center', fontSize: 13 },
  input: {
    backgroundColor: '#1E1D18',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#E8E4D9',
    fontSize: 15,
    marginBottom: 12,
  },
  errorText: { color: '#E07A5F', marginBottom: 12, textAlign: 'center' },
  saveButton: { backgroundColor: '#4a7', borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
