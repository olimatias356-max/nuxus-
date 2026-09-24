import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Eye, EyeOff, type LucideIcon } from '@/ui/icons';

import { Text } from './Text';
import { colors, fonts, radius } from './theme';

export type InputProps = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
  icon?: LucideIcon;
  secureToggle?: boolean;
  hintTone?: 'subtle' | 'accent' | 'warning';
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, hintTone = 'subtle', icon: Icon, secureToggle, secureTextEntry, style, multiline, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  return (
    <View style={styles.wrap}>
      <Text variant="smallStrong" tone="muted" style={styles.label}>
        {label}
      </Text>
      <View
        style={[
          styles.field,
          multiline && styles.multiline,
          focused && styles.focused,
          !!error && styles.errorBorder,
        ]}>
        {Icon ? <Icon size={18} color={focused ? colors.accent : colors.textSubtle} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          secureTextEntry={hidden}
          multiline={multiline}
          maxFontSizeMultiplier={1.5}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          {...rest}
        />
        {secureToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}
            onPress={() => setHidden((h) => !h)}
            hitSlop={12}>
            {hidden ? <Eye size={20} color={colors.textSubtle} /> : <EyeOff size={20} color={colors.textSubtle} />}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="small" tone="danger" accessibilityLiveRegion="polite" style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone={hintTone} style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { marginLeft: 2 },
  field: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  multiline: { alignItems: 'flex-start', paddingVertical: 12 },
  focused: { borderColor: colors.accent, backgroundColor: colors.surface },
  errorBorder: { borderColor: colors.danger },
  input: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 16, paddingVertical: 12 },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top', paddingVertical: 0 },
  helper: { marginLeft: 2 },
});
