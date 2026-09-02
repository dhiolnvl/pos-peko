import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { useAuthStore } from '@/store/authStore';

interface SettingItem {
  label: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  iconColor: string;
  route: string;
}

const ITEMS: SettingItem[] = [
  {
    label: 'Pengaturan Printer',
    subtitle: 'Koneksi thermal printer Bluetooth',
    icon: 'print-outline',
    iconBg: '#EEF8FA',
    iconColor: '#347385',
    route: '/(backoffice)/settings/printer',
  },
  {
    label: 'Riwayat Pembaruan',
    subtitle: 'Versi dan catatan perubahan aplikasi',
    icon: 'time-outline',
    iconBg: '#F0FDF4',
    iconColor: '#16A34A',
    route: '/(backoffice)/settings/changelog',
  },
];

export default function BackofficeProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, currentBranch, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Keluar', 'Yakin ingin keluar dari akun ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Keluar',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  const roleLabel = user?.role === 'back_office' ? 'Staff Cabang' : user?.role ?? '';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Profil</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <TabletCenteredView>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color="#347385" />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name ?? '-'}</Text>
              <Text style={styles.profileEmail}>{user?.email ?? '-'}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{roleLabel}</Text>
              </View>
              {currentBranch && (
                <Text style={styles.branchText}>{currentBranch.name}</Text>
              )}
            </View>
          </View>

          <Text style={styles.sectionTitle}>Pengaturan</Text>

          <View style={styles.list}>
            {ITEMS.map((item, index) => (
              <TouchableOpacity
                key={item.route}
                style={[styles.row, index === ITEMS.length - 1 && styles.rowLast]}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={20} color={item.iconColor} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={styles.rowSub}>{item.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.logoutText}>Keluar</Text>
          </TouchableOpacity>
        </TabletCenteredView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16,
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#EEF8FA',
    justifyContent: 'center', alignItems: 'center',
  },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  profileEmail: { fontSize: 12, color: '#6B7280' },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF8FA', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2, marginTop: 4,
  },
  roleText: { fontSize: 11, fontWeight: '600', color: '#347385' },
  branchText: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: '#9CA3AF',
    marginHorizontal: 20, marginTop: 20, marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  list: {
    marginHorizontal: 16,
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  rowLast: { borderBottomWidth: 0 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  rowSub: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#FEF2F2', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  logoutText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },
});
