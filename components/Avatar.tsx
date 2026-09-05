import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

// Avatar może być albo prawdziwym URL-em zdjęcia (Supabase Storage), albo jednym
// z 5 placeholderowych kolorów zapisanym jako "color:#RRGGBB" — to rozróżnienie
// trzyma się w jednym miejscu, żeby każdy ekran renderował avatar tak samo.
export const AVATAR_COLOR_PREFIX = 'color:';

export const AVATAR_COLOR_OPTIONS = ['#E07A5F', '#4AA785', '#E8A33D', '#5B7DB1', '#9B6BB3'];

export function isColorAvatar(url: string | null | undefined): url is string {
  return !!url && url.startsWith(AVATAR_COLOR_PREFIX);
}

export function colorFromAvatar(url: string): string {
  return url.slice(AVATAR_COLOR_PREFIX.length);
}

interface AvatarProps {
  url: string | null | undefined;
  size: number;
  fallbackLetter?: string;
}

export function Avatar({ url, size, fallbackLetter }: AvatarProps) {
  const shapeStyle = { width: size, height: size, borderRadius: size / 2 };

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
  base: { borderWidth: 0.5, borderColor: '#B5AFA0' },
  placeholder: { backgroundColor: '#1E1D18', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#E8E4D9', fontWeight: 'bold' },
});
