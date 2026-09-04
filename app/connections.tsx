import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useConnectionsStore } from '../store/useConnectionsStore';

function formatExpiry(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ConnectionsScreen() {
  const router = useRouter();
  const pendingInvite = useConnectionsStore((s) => s.pendingInvite);
  const fetchConnections = useConnectionsStore((s) => s.fetchConnections);
  const createInvite = useConnectionsStore((s) => s.createInvite);
  const acceptInvite = useConnectionsStore((s) => s.acceptInvite);

  const [generating, setGenerating] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const isExpired = pendingInvite ? new Date(pendingInvite.expiresAt).getTime() < Date.now() : true;

  const handleGenerateInvite = async () => {
    setError(null);
    setCopied(false);
    setGenerating(true);
    try {
      await createInvite();
    } catch (e: any) {
      setError(e?.message ?? 'Nie udało się wygenerować kodu.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCode = async () => {
    if (!pendingInvite) return;
    await Clipboard.setStringAsync(pendingInvite.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = async () => {
    setError(null);
    if (!joinCode.trim()) {
      setError('Wpisz kod zaproszenia.');
      return;
    }
    setJoining(true);
    try {
      await acceptInvite(joinCode.trim());
      setJoinCode('');
      Alert.alert('Połączono!', 'Nowy znajomy został dodany.');
    } catch (e: any) {
      setError(e?.message ?? 'Nie udało się połączyć — sprawdź kod.');
    } finally {
      setJoining(false);
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

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Połączenia</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Zaproś kogoś</Text>
        {pendingInvite && !isExpired ? (
          <View style={styles.inviteBox}>
            <Text style={styles.inviteCode}>{pendingInvite.code}</Text>
            <Text style={styles.inviteExpiry}>ważny do {formatExpiry(pendingInvite.expiresAt)}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopyCode}>
              <Text style={styles.copyButtonText}>{copied ? 'Skopiowano ✓' : 'Kopiuj kod'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <TouchableOpacity style={styles.secondaryButton} onPress={handleGenerateInvite} disabled={generating}>
          {generating ? (
            <ActivityIndicator color="#E8E4D9" />
          ) : (
            <Text style={styles.secondaryButtonText}>
              {pendingInvite && !isExpired ? 'Wygeneruj nowy kod' : 'Wygeneruj kod zaproszenia'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Dołącz do kogoś</Text>
        <TextInput
          style={styles.input}
          placeholder="Kod zaproszenia"
          placeholderTextColor="#B5AFA0"
          autoCapitalize="characters"
          value={joinCode}
          onChangeText={setJoinCode}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}
        <TouchableOpacity style={styles.primaryButton} onPress={handleJoin} disabled={joining}>
          {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Połącz</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#26251F' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(38,37,31,0.72)' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backArrow: { color: '#E8E4D9', fontSize: 26 },
  headerTitle: { color: '#E8E4D9', fontSize: 18, fontWeight: 'bold' },

  scrollContent: { padding: 20, paddingBottom: 60 },
  sectionTitle: { color: '#E8E4D9', fontSize: 16, fontWeight: 'bold', marginTop: 20, marginBottom: 10 },

  inviteBox: {
    backgroundColor: '#1E1D18',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  inviteCode: { color: '#E8E4D9', fontSize: 28, fontWeight: 'bold', letterSpacing: 4 },
  inviteExpiry: { color: '#B5AFA0', fontSize: 12, marginTop: 6, marginBottom: 12 },
  copyButton: {
    backgroundColor: '#333',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  copyButtonText: { color: '#E8E4D9', fontWeight: 'bold', fontSize: 13 },

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

  secondaryButton: {
    backgroundColor: '#333',
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#E8E4D9', fontWeight: 'bold' },
  primaryButton: { backgroundColor: '#4a7', borderRadius: 30, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: 'bold' },
});
