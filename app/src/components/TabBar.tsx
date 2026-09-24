import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import * as Haptics from 'expo-haptics';
import { Bell, Clapperboard, House, Plus } from '@/ui/icons';

import { useAuth } from '@/lib/auth';
import { useBadges } from '@/lib/api/activity';
import { Avatar, colors, TAB_BAR_HEIGHT, Text } from '@/ui';

const ITEMS: Record<string, { label: string; icon?: typeof House }> = {
  home: { label: 'Inicio', icon: House },
  reels: { label: 'Reels', icon: Clapperboard },
  new: { label: 'Crear' },
  activity: { label: 'Actividad', icon: Bell },
  me: { label: 'Perfil' },
};

export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { profile, userId } = useAuth();
  const { data: badges } = useBadges(!!userId);
  const onReels = state.routes[state.index]?.name === 'reels';

  return (
    <View
      style={[styles.bar, { paddingBottom: insets.bottom, height: TAB_BAR_HEIGHT + insets.bottom }, onReels && styles.barDark]}
      accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const item = ITEMS[route.name];
        if (!item) return null;
        const focused = state.index === index;
        const color = focused ? colors.text : colors.textSubtle;

        if (route.name === 'new') {
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel="Crear publicación"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                router.push('/create');
              }}
              style={styles.tab}>
              <View style={styles.create}>
                <Plus size={24} color={colors.onAccent} strokeWidth={2.8} />
              </View>
            </Pressable>
          );
        }

        const badge = route.name === 'activity' ? badges?.unread_notifications : undefined;
        const Icon = item.icon;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={badge ? `${item.label}, ${badge} sin leer` : item.label}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={styles.tab}>
            {route.name === 'me' ? (
              <View style={[styles.avatarRing, focused && { borderColor: colors.text }]}>
                <Avatar path={profile?.avatar_path} name={profile?.display_name ?? 'yo'} size={26} />
              </View>
            ) : Icon ? (
              <Icon size={25} color={color} strokeWidth={focused ? 2.4 : 2} fill={focused && route.name === 'home' ? color : 'transparent'} />
            ) : null}
            <Text variant="caption" style={{ color, fontSize: 10 }}>
              {item.label}
            </Text>
            {badge ? <View style={styles.dot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  barDark: { backgroundColor: '#000', borderTopColor: 'rgba(255,255,255,0.08)' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 },
  create: { width: 52, height: 38, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { borderRadius: 16, borderWidth: 2, borderColor: 'transparent', padding: 1 },
  dot: { position: 'absolute', top: 6, right: '30%', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.like, borderWidth: 1.5, borderColor: colors.bg },
});
