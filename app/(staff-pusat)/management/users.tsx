/**
 * Kelola User - Staff Pusat
 * - Hanya bisa tambah/edit/nonaktifkan back_office dan cashier
 * - Owner dan staff_pusat ditampilkan read-only
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, Alert, FlatList,
  useWindowDimensions, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { supabase, createUserAccount, getUsersInBranch } from '@/lib/supabase';
import { fetchAllBranches } from '@/lib/ownerQueries';
import type { Branch } from '@/types';

type Role = 'owner' | 'staff_pusat' | 'back_office' | 'cashier';
type FilterRole = 'all' | 'back_office' | 'cashier' | 'readonly';

// Role yang bisa dikelola oleh staff_pusat
const EDITABLE_ROLES: Role[] = ['back_office', 'cashier'];
// Role yang hanya ditampilkan read-only
const READONLY_ROLES: Role[] = ['owner', 'staff_pusat'];

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  branch_id: string | null;
  is_active: boolean;
  branch?: { id: string; name: string } | null;
}

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  staff_pusat: 'Staff Pusat',
  back_office: 'Staff Cabang',
  cashier: 'Kasir',
};

const ROLE_COLORS: Record<Role, { bg: string; text: string; dot: string }> = {
  owner: { bg: '#EBF4F6', text: '#347385', dot: '#347385' },
  staff_pusat: { bg: '#EDE9FE', text: '#5B21B6', dot: '#7C3AED' },
  back_office: { bg: '#FEF3C7', text: '#B45309', dot: '#F59E0B' },
  cashier: { bg: '#DCFCE7', text: '#15803D', dot: '#22C55E' },
};

const ROLE_ICONS: Record<Role, keyof typeof Ionicons.glyphMap> = {
  owner: 'shield-checkmark',
  staff_pusat: 'briefcase',
  back_office: 'desktop-outline',
  cashier: 'storefront',
};

const FILTER_OPTIONS: {
  key: FilterRole;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { key: 'all', label: 'Semua', icon: 'people', color: '#347385' },
  { key: 'back_office', label: 'Staff Cabang', icon: 'desktop-outline', color: '#F59E0B' },
  { key: 'cashier', label: 'Kasir', icon: 'storefront', color: '#22C55E' },
  { key: 'readonly', label: 'Baca Saja', icon: 'lock-closed', color: '#9CA3AF' },
];

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, color, compact,
}: {
  label: string; value: number; icon: keyof typeof Ionicons.glyphMap; color: string; compact?: boolean;
}) {
  if (compact) {
    return (
      <View style={statStyles.cardCompact}>
        <View style={[statStyles.iconBoxCompact, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={14} color={color} />
        </View>
        <Text style={[statStyles.valueCompact, { color }]}>{value}</Text>
        <Text style={statStyles.labelCompact} numberOfLines={1}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconBox, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={statStyles.textCol}>
        <Text style={[statStyles.value, { color }]}>{value}</Text>
        <Text style={statStyles.label}>{label}</Text>
      </View>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  iconBox: {
    width: 34, height: 34, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  textCol: { gap: 1 },
  value: { fontSize: 18, fontWeight: '800', lineHeight: 22 },
  label: { fontSize: 10, fontWeight: '600', color: '#9CA3AF' },

  cardCompact: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 6, paddingVertical: 10, borderWidth: 1, borderColor: '#F0F0F0',
  },
  iconBoxCompact: {
    width: 28, height: 28, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  valueCompact: { fontSize: 16, fontWeight: '800', lineHeight: 20 },
  labelCompact: { fontSize: 9, fontWeight: '600', color: '#9CA3AF', textAlign: 'center' },
});

// ─── User card ────────────────────────────────────────────────────────────────

function UserCard({
  user, onEdit, onResetPassword, onToggleActive, readOnly,
}: {
  user: UserRow;
  onEdit: () => void;
  onResetPassword: () => void;
  onToggleActive: () => void;
  readOnly: boolean;
}) {
  const rc = ROLE_COLORS[user.role] ?? ROLE_COLORS.cashier;
  const initial = user.name.trim().charAt(0).toUpperCase();

  return (
    <View style={[cardStyles.card, { borderColor: rc.dot + '30' }, !user.is_active && cardStyles.cardInactive]}>
      <View style={cardStyles.body}>
        <View style={cardStyles.topRow}>
          <View style={[cardStyles.avatarRing, { borderColor: rc.dot }]}>
            <View style={[cardStyles.avatar, { backgroundColor: rc.bg }]}>
              <Text style={[cardStyles.avatarText, { color: rc.text }]}>{initial}</Text>
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <View style={cardStyles.nameRow}>
              <Text style={cardStyles.name} numberOfLines={1}>{user.name}</Text>
              {!user.is_active && (
                <View style={cardStyles.inactivePill}>
                  <Text style={cardStyles.inactivePillText}>Nonaktif</Text>
                </View>
              )}
            </View>
            <Text style={cardStyles.email} numberOfLines={1}>{user.email}</Text>
          </View>

          <View style={[cardStyles.roleBadge, { backgroundColor: rc.bg }]}>
            <Ionicons name={ROLE_ICONS[user.role] ?? 'person'} size={12} color={rc.text} />
            <Text style={[cardStyles.roleBadgeText, { color: rc.text }]}>
              {ROLE_LABELS[user.role]}
            </Text>
          </View>
        </View>

        {user.branch && (
          <View style={cardStyles.branchRow}>
            <Ionicons name="business-outline" size={12} color="#9CA3AF" />
            <Text style={cardStyles.branchText} numberOfLines={1}>{user.branch.name}</Text>
          </View>
        )}

        {readOnly ? (
          <View style={cardStyles.readOnlyBanner}>
            <Ionicons name="lock-closed-outline" size={12} color="#9CA3AF" />
            <Text style={cardStyles.readOnlyText}>Tidak dapat diedit oleh Staff Pusat</Text>
          </View>
        ) : (
          <>
            <View style={cardStyles.divider} />
            <View style={cardStyles.actions}>
              <TouchableOpacity style={cardStyles.actionBtn} onPress={onEdit}>
                <Ionicons name="create-outline" size={14} color="#347385" />
                <Text style={[cardStyles.actionText, { color: '#347385' }]}>Edit</Text>
              </TouchableOpacity>
              <View style={cardStyles.actionSep} />
              <TouchableOpacity style={cardStyles.actionBtn} onPress={onResetPassword}>
                <Ionicons name="key-outline" size={14} color="#B45309" />
                <Text style={[cardStyles.actionText, { color: '#B45309' }]}>Reset Pass</Text>
              </TouchableOpacity>
              <View style={cardStyles.actionSep} />
              <TouchableOpacity style={cardStyles.actionBtn} onPress={onToggleActive}>
                <Ionicons
                  name={user.is_active ? 'person-remove-outline' : 'person-add-outline'}
                  size={14}
                  color={user.is_active ? '#DC2626' : '#15803D'}
                />
                <Text style={[cardStyles.actionText, { color: user.is_active ? '#DC2626' : '#15803D' }]}>
                  {user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  cardInactive: { opacity: 0.45 },
  body: { padding: 14, gap: 10 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarRing: {
    width: 50, height: 50, borderRadius: 15, borderWidth: 2, padding: 2, flexShrink: 0,
  },
  avatar: { flex: 1, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800' },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '700', color: '#111827', flexShrink: 1 },
  email: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },

  inactivePill: {
    backgroundColor: '#F3F4F6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  inactivePillText: { fontSize: 9, color: '#9CA3AF', fontWeight: '700', letterSpacing: 0.3 },

  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, flexShrink: 0,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },

  branchRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 2 },
  branchText: { fontSize: 12, color: '#9CA3AF', flex: 1 },

  divider: { height: 1, backgroundColor: '#F3F4F6' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 4, paddingVertical: 2,
  },
  actionText: { fontSize: 11, fontWeight: '600' },
  actionSep: { width: 1, height: 16, backgroundColor: '#E5E7EB' },

  readOnlyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F9FAFB', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  readOnlyText: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' },
});

// ─── UserForm modal ───────────────────────────────────────────────────────────

interface UserFormProps {
  user: Partial<UserRow> | null;
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}

function UserForm({ user, branches, onClose, onSaved }: UserFormProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const isEdit = !!user?.id;
  const scrollRef = useRef<ScrollView>(null);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Staff pusat hanya bisa assign back_office atau cashier
  const availableRoles: Role[] = ['back_office', 'cashier'];

  const [role, setRole] = useState<Role>(
    user?.role && EDITABLE_ROLES.includes(user.role as Role)
      ? (user.role as Role)
      : 'cashier',
  );
  const [branchId, setBranchId] = useState<string>(
    user?.branch_id ?? branches[0]?.id ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) { setError('Nama wajib diisi'); return; }
    if (!isEdit && !email.trim()) { setError('Email wajib diisi'); return; }
    if (!isEdit && password.length < 6) { setError('Password minimal 6 karakter'); return; }
    if (!branchId) { setError('Pilih cabang terlebih dahulu'); return; }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        const { error: e } = await supabase.rpc('owner_update_user', {
          p_user_id: user!.id!,
          p_name: name.trim(),
          p_role: role,
          p_branch_id: branchId,
          p_is_active: user!.is_active ?? true,
        });
        if (e) throw e;
      } else {
        await createUserAccount({
          email: email.trim(),
          password,
          name: name.trim(),
          role: role as 'back_office' | 'cashier',
          branch_id: branchId,
        });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={fmStyles.container}>
        <View style={[fmStyles.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={onClose} style={fmStyles.headerClose}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={fmStyles.headerTitle}>
            {isEdit ? 'Edit User' : 'Tambah User Baru'}
          </Text>
          <TouchableOpacity onPress={save} disabled={saving} style={fmStyles.saveBtn}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={fmStyles.saveBtnText}>Simpan</Text>
            )}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View
            style={[
              fmStyles.formOuter,
              isTablet && { maxWidth: 620, alignSelf: 'center', width: '100%' },
            ]}
          >
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={fmStyles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              {!!error && (
                <View style={fmStyles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={15} color="#DC2626" />
                  <Text style={fmStyles.errorText}>{error}</Text>
                </View>
              )}

              <Text style={fmStyles.sectionLabel}>Informasi Akun</Text>
              <View style={fmStyles.sectionCard}>
                <View style={fmStyles.fieldRow}>
                  <Text style={fmStyles.fieldLabel}>Nama Lengkap</Text>
                  <View style={fmStyles.inputRow}>
                    <Ionicons name="person-outline" size={16} color="#9CA3AF" style={fmStyles.inputIcon} />
                    <TextInput
                      style={fmStyles.input}
                      value={name}
                      onChangeText={setName}
                      placeholder="Nama lengkap"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>

                {!isEdit && (
                  <>
                    <View style={fmStyles.fieldDivider} />
                    <View style={fmStyles.fieldRow}>
                      <Text style={fmStyles.fieldLabel}>Email</Text>
                      <View style={fmStyles.inputRow}>
                        <Ionicons name="mail-outline" size={16} color="#9CA3AF" style={fmStyles.inputIcon} />
                        <TextInput
                          style={fmStyles.input}
                          value={email}
                          onChangeText={setEmail}
                          placeholder="user@email.com"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                      </View>
                    </View>
                    <View style={fmStyles.fieldDivider} />
                    <View style={fmStyles.fieldRow}>
                      <Text style={fmStyles.fieldLabel}>Password</Text>
                      <View style={fmStyles.inputRow}>
                        <Ionicons name="lock-closed-outline" size={16} color="#9CA3AF" style={fmStyles.inputIcon} />
                        <TextInput
                          style={[fmStyles.input, { flex: 1 }]}
                          value={password}
                          onChangeText={setPassword}
                          placeholder="Min. 6 karakter"
                          placeholderTextColor="#9CA3AF"
                          secureTextEntry={!showPass}
                        />
                        <TouchableOpacity onPress={() => setShowPass(!showPass)} style={fmStyles.eyeBtn}>
                          <Ionicons
                            name={showPass ? 'eye-off-outline' : 'eye-outline'}
                            size={16} color="#9CA3AF"
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                )}
              </View>

              <Text style={fmStyles.sectionLabel}>Role</Text>
              <View style={fmStyles.roleRow}>
                {availableRoles.map((r) => {
                  const rc = ROLE_COLORS[r];
                  const active = role === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[fmStyles.roleCard, active && { borderColor: rc.dot, backgroundColor: rc.bg }]}
                      onPress={() => setRole(r)}
                    >
                      {active && (
                        <View style={[fmStyles.roleCheckmark, { backgroundColor: rc.dot }]}>
                          <Ionicons name="checkmark" size={10} color="#fff" />
                        </View>
                      )}
                      <View style={[fmStyles.roleIconBox, active && { backgroundColor: rc.dot + '22' }]}>
                        <Ionicons
                          name={ROLE_ICONS[r]}
                          size={22}
                          color={active ? rc.dot : '#9CA3AF'}
                        />
                      </View>
                      <Text style={[fmStyles.roleLabel, active && { color: rc.text, fontWeight: '700' }]}>
                        {ROLE_LABELS[r]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={fmStyles.sectionLabel}>Cabang</Text>
              <View style={fmStyles.sectionCard}>
                {branches.map((b, index) => {
                  const active = branchId === b.id;
                  return (
                    <React.Fragment key={b.id}>
                      {index > 0 && <View style={fmStyles.fieldDivider} />}
                      <TouchableOpacity style={fmStyles.branchRow} onPress={() => setBranchId(b.id)}>
                        <View style={[fmStyles.branchDot, { backgroundColor: active ? '#347385' : '#D1D5DB' }]} />
                        <Text style={[fmStyles.branchName, active && fmStyles.branchNameActive]}>
                          {b.name}
                        </Text>
                        {active && <Ionicons name="checkmark-circle" size={18} color="#347385" />}
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const fmStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  headerClose: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827' },
  saveBtn: {
    backgroundColor: '#347385', paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 10, minWidth: 80, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  formOuter: { flex: 1 },
  scrollContent: { padding: 16, gap: 8, paddingBottom: 48 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#FECACA', marginBottom: 4,
  },
  errorText: { color: '#DC2626', fontSize: 13, flex: 1 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 8, marginBottom: 6, paddingHorizontal: 2,
  },
  sectionCard: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  fieldRow: { paddingHorizontal: 16, paddingVertical: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 2, marginTop: 8 },
  fieldDivider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 8, fontSize: 14, color: '#111827' },
  eyeBtn: { padding: 4 },

  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  roleCard: {
    flex: 1, alignItems: 'center', gap: 8, padding: 16,
    borderRadius: 14, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#E5E7EB', position: 'relative',
  },
  roleCheckmark: {
    position: 'absolute', top: 8, right: 8,
    width: 16, height: 16, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  roleIconBox: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center', alignItems: 'center',
  },
  roleLabel: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },

  branchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  branchDot: { width: 8, height: 8, borderRadius: 4 },
  branchName: { fontSize: 14, color: '#374151', flex: 1 },
  branchNameActive: { color: '#347385', fontWeight: '700' },
});

// ─── Reset Password modal ─────────────────────────────────────────────────────

function ResetPasswordModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [newPass, setNewPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (newPass.length < 6) { setError('Password minimal 6 karakter'); return; }
    setSaving(true);
    setError('');
    try {
      const { error: e } = await supabase.functions.invoke('reset-user-password', {
        body: { user_id: userId, new_password: newPass },
      });
      if (e) throw e;
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? 'Gagal reset password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={rpStyles.overlay}>
          <View style={[rpStyles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={rpStyles.handle} />
            {done ? (
              <View style={{ alignItems: 'center', gap: 14, paddingVertical: 12 }}>
                <View style={rpStyles.successIcon}>
                  <Ionicons name="checkmark-circle" size={52} color="#22C55E" />
                </View>
                <Text style={rpStyles.successTitle}>Password Berhasil Direset</Text>
                <Text style={rpStyles.successSub}>Beritahu pengguna password barunya</Text>
                <TouchableOpacity
                  style={{ alignSelf: 'stretch', backgroundColor: '#347385', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                  onPress={onClose}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Tutup</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={rpStyles.title}>Reset Password</Text>
                <Text style={rpStyles.subtitle}>Masukkan password baru untuk pengguna ini</Text>
                {!!error && (
                  <View style={rpStyles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                    <Text style={rpStyles.errorText}>{error}</Text>
                  </View>
                )}
                <View style={rpStyles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={16} color="#9CA3AF" style={{ marginHorizontal: 12 }} />
                  <TextInput
                    style={rpStyles.input}
                    value={newPass}
                    onChangeText={setNewPass}
                    placeholder="Password baru (min. 6 karakter)"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPass}
                  />
                  <TouchableOpacity onPress={() => setShowPass(!showPass)} style={{ paddingHorizontal: 12 }}>
                    <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={rpStyles.btnSecondary} onPress={onClose}>
                    <Text style={rpStyles.btnSecondaryText}>Batal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={rpStyles.btnPrimary} onPress={save} disabled={saving}>
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={rpStyles.btnPrimaryText}>Reset</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const rpStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 14, minHeight: 320,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: -6 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10,
  },
  errorText: { color: '#DC2626', fontSize: 12, flex: 1 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 14, color: '#111827' },
  btnPrimary: { flex: 1, backgroundColor: '#347385', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnSecondary: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnSecondaryText: { color: '#6B7280', fontWeight: '700', fontSize: 15 },
  successIcon: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center',
  },
  successTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  successSub: { fontSize: 13, color: '#6B7280', marginTop: -4 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function StaffPusatUsersManagement() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 768;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<FilterRole>('all');
  const [search, setSearch] = useState('');
  const [formUser, setFormUser] = useState<Partial<UserRow> | null | false>(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, branchesData] = await Promise.all([
        getUsersInBranch(null),
        fetchAllBranches() as Promise<Branch[]>,
      ]);
      const branchMap: Record<string, { id: string; name: string }> = {};
      branchesData.forEach((b) => { branchMap[b.id] = { id: b.id, name: b.name }; });
      const withBranch: UserRow[] = (usersData as UserRow[])
        .map((u) => ({
          ...u,
          branch: u.branch_id ? (branchMap[u.branch_id] ?? null) : null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setUsers(withBranch);
      setBranches(branchesData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = (user: UserRow) => {
    if (READONLY_ROLES.includes(user.role)) {
      Alert.alert('Tidak Diizinkan', 'Akun ini tidak dapat diubah oleh Staff Pusat.');
      return;
    }
    Alert.alert(
      user.is_active ? 'Nonaktifkan User' : 'Aktifkan User',
      `${user.is_active ? 'Nonaktifkan' : 'Aktifkan'} akun "${user.name}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: user.is_active ? 'Nonaktifkan' : 'Aktifkan',
          style: user.is_active ? 'destructive' : 'default',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('owner_update_user', {
                p_user_id: user.id,
                p_name: user.name,
                p_role: user.role,
                p_branch_id: user.branch_id,
                p_is_active: !user.is_active,
              });
              if (error) throw error;
              setUsers((prev) =>
                prev.map((u) => u.id === user.id ? { ...u, is_active: !u.is_active } : u)
              );
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Gagal mengubah status');
            }
          },
        },
      ],
    );
  };

  const filtered = users.filter((u) => {
    if (filterRole === 'readonly') {
      if (!READONLY_ROLES.includes(u.role)) return false;
    } else if (filterRole !== 'all') {
      if (u.role !== filterRole) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const activeCount = users.filter((u) => u.is_active).length;
  const boCount = users.filter((u) => u.role === 'back_office').length;
  const cashierCount = users.filter((u) => u.role === 'cashier').length;
  const readonlyCount = users.filter((u) => READONLY_ROLES.includes(u.role)).length;

  const numCols = isTablet ? 2 : 1;

  return (
    <View style={styles.root}>
      <OwnerPageHeader
        title="Kelola User"
        subtitle={`${users.length} pengguna terdaftar`}
        onBack={() => router.back()}
        rightElement={
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setFormUser({})}
          >
            <Ionicons name="person-add-outline" size={18} color="#fff" />
          </TouchableOpacity>
        }
      />

      <View style={[styles.contentArea, isTablet && { alignItems: 'center' }]}>
        <View style={[styles.contentInner, isTablet && { maxWidth: 960 }]}>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#347385" />
              <Text style={styles.loadingText}>Memuat data...</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(u) => u.id}
              key={isTablet ? 'tablet' : 'phone'}
              numColumns={numCols}
              columnWrapperStyle={numCols > 1 ? styles.columnWrapper : undefined}
              contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
              ListHeaderComponent={
                <View style={styles.listHeader}>
                  {/* Stat cards */}
                  <View style={styles.statsRow}>
                    <StatCard label="Aktif" value={activeCount} icon="pulse" color="#22C55E" compact={!isTablet} />
                    <StatCard label="Staff Cabang" value={boCount} icon="desktop-outline" color="#F59E0B" compact={!isTablet} />
                    <StatCard label="Kasir" value={cashierCount} icon="storefront" color="#347385" compact={!isTablet} />
                    <StatCard label="Baca Saja" value={readonlyCount} icon="lock-closed" color="#9CA3AF" compact={!isTablet} />
                  </View>

                  {/* Filter chips */}
                  <View style={styles.chipWrap}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipContent}
                    >
                      {FILTER_OPTIONS.map((item) => {
                        const active = filterRole === item.key;
                        const count = item.key === 'all'
                          ? users.length
                          : item.key === 'readonly'
                            ? readonlyCount
                            : users.filter((u) => u.role === item.key).length;
                        return (
                          <TouchableOpacity
                            key={item.key}
                            style={[styles.chip, active && { backgroundColor: item.color }]}
                            onPress={() => setFilterRole(item.key)}
                          >
                            <Ionicons name={item.icon} size={13} color={active ? '#fff' : '#6B7280'} />
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {item.label}
                            </Text>
                            {active && (
                              <View style={[styles.chipBadge, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                                <Text style={styles.chipBadgeText}>{count}</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* Search */}
                  <View style={styles.searchRow}>
                    <View style={styles.searchBox}>
                      <Ionicons name="search-outline" size={16} color="#9CA3AF" style={{ marginLeft: 14 }} />
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Cari nama atau email..."
                        value={search}
                        onChangeText={setSearch}
                        placeholderTextColor="#9CA3AF"
                      />
                      {!!search && (
                        <TouchableOpacity onPress={() => setSearch('')} style={{ paddingHorizontal: 12 }}>
                          <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              }
              ListEmptyComponent={
                <View style={styles.centered}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="people-outline" size={40} color="#D1D5DB" />
                  </View>
                  <Text style={styles.emptyTitle}>Tidak ada user</Text>
                  <Text style={styles.emptySub}>
                    {search ? 'Coba kata kunci lain' : 'Tambahkan user pertama dengan tombol +'}
                  </Text>
                </View>
              }
              renderItem={({ item: user }) => {
                const isReadOnly = READONLY_ROLES.includes(user.role);
                return (
                  <View style={isTablet ? styles.colItem : styles.fullItem}>
                    <UserCard
                      user={user}
                      readOnly={isReadOnly}
                      onEdit={() => {
                        if (isReadOnly) {
                          Alert.alert('Tidak Diizinkan', 'Akun ini tidak dapat diedit oleh Staff Pusat.');
                          return;
                        }
                        setFormUser(user);
                      }}
                      onResetPassword={() => {
                        if (isReadOnly) {
                          Alert.alert('Tidak Diizinkan', 'Reset password akun ini tidak diizinkan.');
                          return;
                        }
                        setResetUserId(user.id);
                      }}
                      onToggleActive={() => toggleActive(user)}
                    />
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>

      {formUser !== false && (
        <UserForm
          user={formUser}
          branches={branches.filter((b) => b.is_active)}
          onClose={() => setFormUser(false)}
          onSaved={() => { setFormUser(false); load(); }}
        />
      )}
      {resetUserId && (
        <ResetPasswordModal
          userId={resetUserId}
          onClose={() => setResetUserId(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },

  headerBtn: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },

  contentArea: { flex: 1 },
  contentInner: { flex: 1, width: '100%' },

  statsRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
  },

  chipWrap: { height: 48, justifyContent: 'center', marginTop: 8 },
  chipContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  chipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },
  chipBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  chipBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  searchRow: { paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  searchInput: { flex: 1, paddingVertical: 12, paddingRight: 4, fontSize: 14, color: '#111827' },

  centered: { paddingTop: 60, alignItems: 'center', gap: 12 },
  loadingText: { color: '#9CA3AF', fontSize: 14 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 32 },

  list: { gap: 12 },
  listHeader: { marginBottom: 12 },
  columnWrapper: { gap: 12, paddingHorizontal: 16 },
  colItem: { flex: 1, minWidth: 0 },
  fullItem: { width: '100%', paddingHorizontal: 16 },
});
