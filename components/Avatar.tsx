import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

// Avatar może być: prawdziwym URL-em zdjęcia (Supabase Storage), jednym z 5
// gotowych avatarów wbudowanych w aplikację (zapisany jako "asset:N") albo
// (starsze konta) jednym z 5 placeholderowych kolorów ("color:#RRGGBB") — to
// rozróżnienie trzyma się w jednym miejscu, żeby każdy ekran renderował avatar
// tak samo.
export const AVATAR_COLOR_PREFIX = 'color:';
export const AVATAR_ASSET_PREFIX = 'asset:';

export const AVATAR_COLOR_OPTIONS = ['#E07A5F', '#4AA785', '#E8A33D', '#5B7DB1', '#9B6BB3'];

// require() musi dostać statyczny literał — stąd mapa 1..12 zamiast dynamicznego
// ścieżkowania po numerze.
const AVATAR_ASSET_SOURCES: Record<string, ReturnType<typeof require>> = {
  '1': require('../assets/avatars/avatar_1.png'),
  '2': require('../assets/avatars/avatar_2.png'),
  '3': require('../assets/avatars/avatar_3.png'),
  '4': require('../assets/avatars/avatar_4.png'),
  '5': require('../assets/avatars/avatar_5.png'),
  '6': require('../assets/avatars/avatar_6.png'),
  '7': require('../assets/avatars/avatar_7.png'),
  '8': require('../assets/avatars/avatar_8.png'),
  '9': require('../assets/avatars/avatar_9.png'),
  '10': require('../assets/avatars/avatar_10.png'),
  '11': require('../assets/avatars/avatar_11.png'),
  '12': require('../assets/avatars/avatar_12.png'),
};

export const AVATAR_ASSET_OPTIONS = Object.keys(AVATAR_ASSET_SOURCES).map((id) => ({
  id,
  value: `${AVATAR_ASSET_PREFIX}${id}`,
  source: AVATAR_ASSET_SOURCES[id],
}));

export function isColorAvatar(url: string | null | undefined): url is string {
  return !!url && url.startsWith(AVATAR_COLOR_PREFIX);
}

export function colorFromAvatar(url: string): string {
  return url.slice(AVATAR_COLOR_PREFIX.length);
}

export function isAssetAvatar(url: string | null | undefined): url is string {
  return !!url && url.startsWith(AVATAR_ASSET_PREFIX);
}

export function assetSourceFromAvatar(url: string) {
  const id = url.slice(AVATAR_ASSET_PREFIX.length);
  return AVATAR_ASSET_SOURCES[id] ?? null;
}

interface AvatarProps {
  url: string | null | undefined;
  size: number;
  fallbackLetter?: string;
}

export function Avatar({ url, size, fallbackLetter }: AvatarProps) {
  const shapeStyle = { width: size, height: size, borderRadius: size / 2 };

  if (isAssetAvatar(url)) {
    const source = assetSourceFromAvatar(url);
    if (source) {
      return <Image source={source} style={[styles.base, shapeStyle]} contentFit="cover" />;
    }
  }

  if (isColorAvatar(url)) {
    return <View style={[styles.base, shapeStyle, { backgroundColor: colorFromAvatar(url) }]} />;
  }

  if (url) {
    return <Image source={{ uri: url }} style={[styles.base, shapeStyle]} contentFit="cover" />;
  }

  return (
    <View style={[styles.base, styles.placeholder, shapeStyle]}>
      <Text style={[styles.placeholderText, { fontSize: size * 0.4 }]}>{(fallbackLetter ?? '?').slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: 0.5, borderColor: '#7C8798' },
  placeholder: { backgroundColor: '#141A24', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#ECEEF2', fontWeight: 'bold' },
});
