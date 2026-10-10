import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from './Button';

type Props = { fileName: string; stage: string; progress: number; onCancel: () => void };

export function ProcessingScreen({ fileName, stage, progress, onCancel }: Props) {
  const t = useTheme();
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={t.accent} />
      <Text style={[styles.file, { color: t.text }]} numberOfLines={2}>{fileName}</Text>
      <Text style={{ color: t.muted, textAlign: 'center' }} accessibilityLiveRegion="polite">{stage}</Text>
      <View style={[styles.track, { backgroundColor: t.border }]}>
        <View style={[styles.fill, { backgroundColor: t.accent, width: `${Math.round(Math.min(1, Math.max(0.03, progress)) * 100)}%` }]} />
      </View>
      <Text style={{ color: t.muted, fontSize: 12, textAlign: 'center' }}>
        Isso pode levar alguns minutos, dependendo da música e do servidor.
      </Text>
      <Button label="Cancelar" variant="secondary" onPress={onCancel} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 28, justifyContent: 'center', gap: 16 },
  file: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
