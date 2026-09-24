import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Text } from './Text';
import { colors, fonts } from './theme';

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect width={40} height={40} rx={12} fill={colors.accent} />
      <Path
        d="M10 29V13.2c0-1.1 1.3-1.6 2.1-.9L20 19.6l7.9-7.3c.8-.7 2.1-.2 2.1.9V29h-4.6v-9.1l-4.3 4a1.6 1.6 0 0 1-2.2 0l-4.3-4V29z"
        fill={colors.onAccent}
      />
      <Rect x={29} y={7} width={4.5} height={4.5} rx={2.25} fill={colors.onAccent} />
    </Svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel="MbareteFans">
      <LogoMark size={size * 1.35} />
      <Text style={[styles.word, { fontSize: size, lineHeight: size * 1.2 }]}>
        mbarete<Text style={[styles.word, styles.fans, { fontSize: size, lineHeight: size * 1.2 }]}>fans</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { fontFamily: fonts.displayBlack, color: colors.text, letterSpacing: -0.6 },
  fans: { color: colors.accent },
});
