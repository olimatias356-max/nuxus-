import Svg, { Path } from 'react-native-svg';

import { colors } from './theme';

// Shown only for identities verified through KYC — never for paying.
export function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Cuenta verificada" accessibilityRole="image">
      <Path
        d="M12 2l2.4 1.8 3-.2 1 2.8 2.6 1.6-.9 2.9.9 2.9-2.6 1.6-1 2.8-3-.2L12 22l-2.4-1.8-3 .2-1-2.8L3 16l.9-2.9L3 10.2l2.6-1.6 1-2.8 3 .2z"
        fill={colors.verified}
      />
      <Path d="M8.3 12.2l2.5 2.5 4.9-5.2" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
