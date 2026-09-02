import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

const PRIMARY = '#347385';

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

type SettingItemProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
  isTablet?: boolean;
};

function SettingItem({ icon, label, onPress, danger = false, isTablet = false }: SettingItemProps) {
  const color = danger ? '#EF4444' : '#111827';
  const iconColor = danger ? '#EF4444' : PRIMARY;

  return (
    <TouchableOpacity
      style={[styles.settingItem, isTablet && styles.settingItemTablet]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.settingItemLeft]}>
        <View style={[styles.iconBox, danger && styles.iconBoxDanger]}>
          <Ionicons name={icon} size={isTablet ? 22 : 20} color={iconColor} />
        </View>
        <Text style={[styles.settingLabel, { color }, isTablet && styles.settingLabelTablet]}>
          {label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#C4C4C4" />
    </TouchableOpacity>
  );
}

type SectionProps = {
  title: string;
  children: React.ReactNode;
  isTablet?: boolean;
};

function Section({ title, children, isTablet = false }: SectionProps) {
  return (
    <View style={[styles.section, isTablet && styles.sectionTablet]}>
      <Text style={[styles.sectionTitle, isTablet && styles.sectionTitleTablet]}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const initials = getInitials(user?.name ?? 'SP');

  const handleLogout = () => {
    Alert.alert('Keluar', 'Yakin ingin keluar dari akun ini?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: logout },
    ]);
  };

  const handleGantiPassword = () => {
    Alert.alert('Ganti Password', 'Fitur akan segera tersedia.');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, isTablet && styles.headerTitleTablet]}>Pengaturan</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
          isTablet && styles.scrollContentTablet,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profil */}
        <View style={[styles.profileCard, isTablet && styles.profileCardTablet]}>
          <View style={[styles.avatar, isTablet && styles.avatarTablet]}>
            <Text style={[styles.avatarText, isTablet && styles.avatarTextTablet]}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, isTablet && styles.profileNameTablet]}>
              {user?.name ?? '-'}
            </Text>
            <Text style={[styles.profileEmail, isTablet && styles.profileEmailTablet]}>
              {user?.email ?? '-'}
            </Text>
            <View style={styles.roleBadge}>
              <Text style={[styles.roleText, isTablet && styles.roleTextTablet]}>Staff Pusat</Text>
            </View>
          </View>
        </View>

        {/* Section Pengaturan */}
        <Section title="Pengaturan" isTablet={isTablet}>
          <SettingItem
            icon="lock-closed-outline"
            label="Ganti Password"
            onPress={handleGantiPassword}
            isTablet={isTablet}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="print-outline"
            label="Printer Struk"
            onPress={() => router.push('/(staff-pusat)/settings/printer' as any)}
            isTablet={isTablet}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="document-text-outline"
            label="Changelog"
            onPress={() => router.push('/(staff-pusat)/settings/changelog' as any)}
            isTablet={isTablet}
          />
        </Section>

        {/* Section Akun */}
        <Section title="Akun" isTablet={isTablet}>
          <SettingItem
            icon="log-out-outline"
            label="Keluar"
            onPress={handleLogout}
            danger
            isTablet={isTablet}
          />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerTitleTablet: {
    fontSize: 22,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  scrollContentTablet: {
    paddingHorizontal: 40,
    paddingTop: 24,
    maxWidth: 680,
    alignSelf: 'center',
    width: '100%',
  },

  // Profil
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  profileCardTablet: {
    padding: 24,
    borderRadius: 20,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarTablet: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  avatarTextTablet: {
    fontSize: 28,
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  profileNameTablet: {
    fontSize: 20,
  },
  profileEmail: {
    fontSize: 13,
    color: '#6B7280',
  },
  profileEmailTablet: {
    fontSize: 15,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF8FA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
    color: PRIMARY,
  },
  roleTextTablet: {
    fontSize: 13,
  },

  // Sections
  section: {
    gap: 8,
  },
  sectionTablet: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 4,
  },
  sectionTitleTablet: {
    fontSize: 13,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  // Setting item
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingItemTablet: {
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBoxDanger: {
    backgroundColor: '#FEF2F2',
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  settingLabelTablet: {
    fontSize: 17,
  },

  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 66,
  },
});
