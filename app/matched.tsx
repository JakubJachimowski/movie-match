import { StyleSheet, Text, View } from 'react-native';

export default function MatchedScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Wspólnie polubione filmy pojawią się tutaj,{'\n'}gdy podłączymy konta i parowanie.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#26251F', alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { color: '#E8E4D9', fontSize: 16, textAlign: 'center', lineHeight: 24 },
});