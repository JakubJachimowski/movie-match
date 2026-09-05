import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, colorFromAvatar, isColorAvatar } from '../../components/Avatar';
import { supabase } from '../../lib/supabase';

const AVATAR_BASE_SIZE = 84;

interface DecisionRow {
  id: string;
  title: string;
  year: string | null;
  direction: 'left' | 'right';
}

export default function FriendHistoryScreen() {
  const router = useRouter();
  const { connectionId, partnerId, username, avatarUrl } = useLocalSearchParams<{
    connectionId: string;
    partnerId: string;
    username: string;
    avatarUrl?: string;
  }>();

  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tapnięcie w avatar znajomego powiększa go na całą szerokość ekranu, wyświetla
  // ponad resztą interfejsu i przygasza tło o 75%. GÓRNA krawędź avatara podczas
  // animacji się nie przemieszcza (zakotwiczona w miejscu, gdzie był mały avatar) —
  // avatar rośnie tylko w dół i na boki. Osiągamy to animując width/height/left
  // bezpośrednio (nie transform-scale, który skalowałby też od góry).
  const { width: screenWidth } = useWindowDimensions();
  const avatarAnchorRef = useRef<View>(null);
  const [enlarged, setEnlarged] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0, size: AVATAR_BASE_SIZE });
  const progress = useRef(new Animated.Value(0)).current;

  const targetSize = screenWidth;
  const targetX = 0;

  const overlaySize = progress.interpolate({ inputRange: [0, 1], outputRange: [origin.size, targetSize] });
  const overlayRadius = progress.interpolate({ inputRange: [0, 1], outputRange: [origin.size / 2, targetSize / 2] });
  const overlayLeft = progress.interpolate({ inputRange: [0, 1], outputRange: [origin.x, targetX] });
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.75] });

  const toggleAvatarSize = () => {
    if (enlarged) {
      setEnlarged(false);
      Animated.spring(progress, { toValue: 0, friction: 8, useNativeDriver: false }).start(() => {
        setOverlayMounted(false);
      });
    } else {
      avatarAnchorRef.current?.measureInWindow((x, y, width) => {
        setOrigin({ x, y, size: width || AVATAR_BASE_SIZE });
        setOverlayMounted(true);
        setEnlarged(true);
        requestAnimationFrame(() => {
          Animated.spring(progress, { toValue: 1, friction: 8, useNativeDriver: false }).start();
        });
      });
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('decisions')
        .select('id, title, year, direction')
        .eq('connection_id', connectionId)
        .eq('user_id', partnerId)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
      } else {
        setDecisions((data ?? []) as DecisionRow[]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [connectionId, partnerId]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/images/moviematchbackground.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.overlay} />

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={36}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        {/* Nickname znajomego (tytuł) powiększony o 20%. */}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {username || '(nieznany)'}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.profileHeader}>
        <TouchableOpacity activeOpacity={1} onPress={toggleAvatarSize}>
          {/* Ukrywamy avatar w miejscu, gdy overlay jest zamontowany — jego
              powiększona kopia jest wtedy renderowana nad całym interfejsem. */}
          <View ref={avatarAnchorRef} style={overlayMounted ? styles.hiddenAvatar : undefined}>
            <Avatar url={avatarUrl} size={AVATAR_BASE_SIZE} fallbackLetter={username} />
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#E8E4D9" style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.emptyText}>{error}</Text>
      ) : decisions.length === 0 ? (
        <Text style={styles.emptyText}>{username} nie przesunął jeszcze żadnego filmu.</Text>
      ) : (
        <FlatList
          data={decisions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={[styles.arrow, item.direction === 'right' ? styles.arrowRight : styles.arrowLeft]}>
                {item.direction === 'right' ? '→' : '←'}
              </Text>
              <Text style={styles.rowText} numberOfLines={1}>
                {item.title}
                {item.year ? ` (${item.year})` : ''}
              </Text>
            </View>
          )}
        />
      )}

      {overlayMounted && (
        <TouchableOpacity activeOpacity={1} style={styles.enlargeOverlay} onPress={toggleAvatarSize}>
          <Animated.View style={[styles.enlargeBackdrop, { opacity: backdropOpacity }]} />
          <Animated.View
            style={[
              styles.enlargedAvatarFrame,
              {
                top: origin.y, // stała — górna krawędź avatara nigdy się nie przemieszcza
                left: overlayLeft,
                width: overlaySize,
                height: overlaySize,
                borderRadius: overlayRadius,
              },
            ]}
          >
            {isColorAvatar(avatarUrl) ? (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colorFromAvatar(avatarUrl as string) }]} />
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.enlargedPlaceholder]}>
                <Text style={styles.enlargedPlaceholderText}>
                  {(username ?? '?').slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
          </Animated.View>
        </TouchableOpacity>
      )}
    </View>
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
  // 18 -> ~22 (+20%).
  headerTitle: { color: '#E8E4D9', fontSize: 22, fontWeight: 'bold', flex: 1, textAlign: 'center' },

  profileHeader: { alignItems: 'center', paddingBottom: 28, paddingTop: 8 },
  hiddenAvatar: { opacity: 0 },

  emptyText: { color: '#B5AFA0', fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },

  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1D18',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  arrow: { fontSize: 18, fontWeight: 'bold', width: 26 },
  arrowRight: { color: '#4a7' },
  arrowLeft: { color: '#E07A5F' },
  rowText: { color: '#E8E4D9', fontSize: 14, flex: 1 },

  // Warstwa nad całym interfejsem: przyciemnione tło + powiększony avatar,
  // animujący się od pozycji/rozmiaru małego avatara do pełnej szerokości ekranu.
  enlargeOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  enlargeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  enlargedAvatarFrame: {
    position: 'absolute',
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#B5AFA0',
    backgroundColor: '#1E1D18',
  },
  enlargedPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  enlargedPlaceholderText: { color: '#E8E4D9', fontWeight: 'bold', fontSize: 96 },
});
