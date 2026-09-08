import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useNavigation } from 'expo-router';
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
import { Avatar } from '../components/Avatar';
import { AvatarPickerModal } from '../components/AvatarPickerModal';
import { useAuthStore } from '../store/useAuthStore';

// Maksymalna długość nicku = liczba znaków w "ciasteczka_i_jednorozce".
// Dozwolone znaki: litery, cyfry, "_", "-" i "!" — niedozwolone NIE są usuwane
// w locie (jak poprzednio), tylko sygnalizowane na czerwono, żeby użytkownik
// widział, co dokładnie wpisał źle, zamiast znaku po prostu znikającego.
// Wyjątek: spacje są usuwane automatycznie i po cichu (nigdy nie trafiają do
// stanu, więc nie pojawią się w komunikacie o niedozwolonych znakach).
const USERNAME_MAX_LENGTH = 'ciasteczka_i_jednorozce'.length;
const USERNAME_INVALID_CHARS = /[^a-zA-Z0-9_!-]/g;

function stripSpaces(text: string): string {
  return text.replace(/\s/g, '');
}

function findInvalidChars(text: string): string[] {
  const matches = text.match(USERNAME_INVALID_CHARS);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

export default function OnboardingScreen() {
  const navigation = useNavigation();
  const createProfile = useAuthStore((s) => s.createProfile);
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar);

  const [username, setUsername] = useState('');
  // Dokładnie jedno z dwóch jest ustawione na raz: własne zdjęcie z galerii
  // (wgrywane dopiero przy zapisie) albo jeden z 12 gotowych avatarów
  // (zapisywany jako "asset:N", bez uploadu — patrz components/Avatar.tsx).
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [assetAvatar, setAssetAvatar] = useState<string | null>(null);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAssetAvatar = (value: string) => {
    setAssetAvatar(value);
    setLocalAvatarUri(null);
    setAvatarModalVisible(false);
  };

  const pickPhotoAvatar = async () => {
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
      setAssetAvatar(null);
      setAvatarModalVisible(false);
    }
  };

  const invalidChars = findInvalidChars(username);
  const hasInvalidChars = invalidChars.length > 0;

  const handleSave = async () => {
    setError(null);
    if (hasInvalidChars) {
      setError('Usuń niedozwolone znaki z nazwy użytkownika.');
      return;
    }
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
      } else if (assetAvatar) {
        avatarUrl = assetAvatar;
      }
      await createProfile(trimmed, avatarUrl);
      // Po utworzeniu profilu Stack.Protected w app/_layout.tsx sam
      // przełącza grupę tras (guard hasProfile). navigation.reset ustawia
      // CAŁY stos jednym, nieanimowanym przeskokiem: dno = strona główna
      // (żeby strzałka "cofnij" na Twój profil miała dokąd wrócić — bez
      // tego był błąd GO_BACK), wierzch = Twój profil. W przeciwieństwie do
      // osobnych router.replace()+router.push() (dwa kroki nawigacji, więc
      // ryzyko mignięcia strony głównej i animacji wjazdu profilu z prawej)
      // to jeden atomowy skok — użytkownik widzi tylko "Twój profil".
      navigation.reset({
        index: 1,
        routes: [{ name: '(tabs)' }, { name: 'profile' }],
      });
    } catch (e: any) {
      const message: string = e?.message ?? 'Nie udało się zapisać profilu.';
      setError(message.includes('duplicate') || message.includes('unique') ? 'Ta nazwa użytkownika jest już zajęta.' : message);
    } finally {
      setSaving(false);
    }
  };

  const hasAvatar = !!(localAvatarUri || assetAvatar);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
    >
      <Image
        source={require('../assets/background/maintenace_background.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <Text style={styles.title}>Stwórz swój profil</Text>

      <TouchableOpacity style={styles.avatarPicker} onPress={() => setAvatarModalVisible(true)}>
        {hasAvatar ? (
          <Avatar url={localAvatarUri ?? assetAvatar} size={120} />
        ) : (
          <Text style={styles.avatarPlaceholderText}>Dodaj{'\n'}avatar</Text>
        )}
      </TouchableOpacity>

      <TextInput
        style={[styles.input, hasInvalidChars && styles.inputInvalid]}
        placeholder="Nazwa użytkownika"
        placeholderTextColor="#7C8798"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={USERNAME_MAX_LENGTH}
        value={username}
        onChangeText={(text) => setUsername(stripSpaces(text))}
      />
      {hasInvalidChars ? (
        <Text style={styles.invalidCharsText}>niedozwolone znaki: {invalidChars.join(', ')}!</Text>
      ) : (
        <Text style={styles.hintText}>maks. {USERNAME_MAX_LENGTH} znaków.</Text>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving || hasInvalidChars}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Zapisz i zacznij</Text>}
      </TouchableOpacity>

      {/* Wybór avatara: 12 gotowych avatarów (3 ekrany po 4, przewijane
          strzałkami) + upload własnego zdjęcia — wspólny komponent z profile.tsx. */}
      <AvatarPickerModal
        visible={avatarModalVisible}
        onClose={() => setAvatarModalVisible(false)}
        onPickAsset={pickAssetAvatar}
        onPickPhoto={pickPhotoAvatar}
      />
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
  inputInvalid: { borderColor: '#E07A5F' },
  invalidCharsText: { color: '#E07A5F', fontSize: 11, marginBottom: 16, textAlign: 'center' },
  errorText: { color: '#E07A5F', marginBottom: 12, textAlign: 'center' },
  hintText: { color: '#7C8798', fontSize: 11, marginBottom: 16, textAlign: 'center' },
  saveButton: { backgroundColor: '#4a7', borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
