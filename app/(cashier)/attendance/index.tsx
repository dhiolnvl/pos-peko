import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
  Alert, Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { attendanceService, type Employee, type Attendance } from '@/lib/attendanceService';

type Tab = 'belum_checkin' | 'sudah_checkin';

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function todayLabel() {
  return new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function AttendanceScreen() {
  const insets = useSafeAreaInsets();
  const { currentBranch } = useAuthStore();
  const [tab, setTab] = useState<Tab>('belum_checkin');
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);

  // PIN modal
  const [pinModal, setPinModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedAttendance, setSelectedAttendance] = useState<Attendance | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, atts] = await Promise.all([
        attendanceService.getEmployees(),
        attendanceService.getTodayAttendances(),
      ]);
      setEmployees(emps);
      setAttendances(atts);
    } catch (e: any) {
      Alert.alert('Gagal memuat', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const checkedInIds = new Set(attendances.map(a => a.employee_id));
  const checkedOutIds = new Set(attendances.filter(a => a.check_out).map(a => a.employee_id));

  const belumCheckin = employees.filter(e => !checkedInIds.has(e.id));
  const sudahCheckin = attendances.filter(a => !a.check_out);

  const filteredBelum = belumCheckin.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
  const filteredSudah = sudahCheckin.filter(a => {
    const name = (a.employee as any)?.name ?? '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const openCheckin = (emp: Employee) => {
    setSelectedEmployee(emp);
    setSelectedAttendance(null);
    setPinInput('');
    setPinError('');
    setPinModal(true);
  };

  const openCheckout = (att: Attendance) => {
    const emp = employees.find(e => e.id === att.employee_id) ?? null;
    setSelectedEmployee(emp);
    setSelectedAttendance(att);
    setPinInput('');
    setPinError('');
    setPinModal(true);
  };

  const handlePinInput = (key: string) => {
    if (key === '←') {
      setPinInput(p => p.slice(0, -1));
    } else if (pinInput.length < 4) {
      const next = pinInput + key;
      setPinInput(next);
      if (next.length === 4) {
        // Auto submit
        setTimeout(() => submitPin(next), 80);
      }
    }
    setPinError('');
  };

  const submitPin = async (pin: string) => {
    if (!selectedEmployee || !currentBranch?.id) return;
    if (!attendanceService.verifyPin(selectedEmployee, pin)) {
      setPinError('PIN salah, coba lagi');
      setPinInput('');
      return;
    }

    setProcessing(true);
    try {
      if (selectedAttendance) {
        await attendanceService.checkOut(selectedAttendance.id, currentBranch.id);
        Alert.alert('Check-out Berhasil', `${selectedEmployee.name} telah check-out pukul ${formatTime(new Date().toISOString())}`);
      } else {
        await attendanceService.checkIn(selectedEmployee.id, currentBranch.id);
        Alert.alert('Check-in Berhasil', `${selectedEmployee.name} telah check-in pukul ${formatTime(new Date().toISOString())}`);
      }
      setPinModal(false);
      load();
    } catch (e: any) {
      Alert.alert('Gagal', e.message);
    } finally {
      setProcessing(false);
    }
  };

  const NUMPAD = ['1','2','3','4','5','6','7','8','9','','0','←'];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Presensi Karyawan</Text>
          <Text style={styles.headerDate}>{todayLabel()}</Text>
        </View>
        <TouchableOpacity onPress={load} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color="#347385" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{employees.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statCard, { borderColor: '#BBF7D0' }]}>
          <Text style={[styles.statNum, { color: '#16A34A' }]}>{checkedInIds.size}</Text>
          <Text style={styles.statLabel}>Hadir</Text>
        </View>
        <View style={[styles.statCard, { borderColor: '#FECACA' }]}>
          <Text style={[styles.statNum, { color: '#DC2626' }]}>{belumCheckin.length}</Text>
          <Text style={styles.statLabel}>Belum Hadir</Text>
        </View>
        <View style={[styles.statCard, { borderColor: '#BFDBFE' }]}>
          <Text style={[styles.statNum, { color: '#2563EB' }]}>{checkedOutIds.size}</Text>
          <Text style={styles.statLabel}>Sudah Pulang</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nama karyawan..."
          placeholderTextColor="#9CA3AF"
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {([
          { key: 'belum_checkin', label: `Belum Check-in (${filteredBelum.length})` },
          { key: 'sudah_checkin', label: `Sudah Check-in (${filteredSudah.length})` },
        ] as { key: Tab; label: string }[]).map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#347385" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingHorizontal: 16 }}>
          {tab === 'belum_checkin' && (
            filteredBelum.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="checkmark-circle" size={48} color="#BBF7D0" />
                <Text style={styles.emptyText}>Semua karyawan sudah check-in</Text>
              </View>
            ) : (
              <View style={styles.list}>
                {filteredBelum.map((emp, i) => (
                  <TouchableOpacity
                    key={emp.id}
                    style={[styles.card, i === filteredBelum.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => openCheckin(emp)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cardAvatar}>
                      <Text style={styles.cardAvatarText}>{emp.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{emp.name}</Text>
                      {emp.position && <Text style={styles.cardSub}>{emp.position}</Text>}
                      {emp.branch && <Text style={styles.cardSub}>{(emp.branch as any).name}</Text>}
                    </View>
                    <View style={styles.checkinBtn}>
                      <Ionicons name="log-in-outline" size={16} color="#16A34A" />
                      <Text style={styles.checkinBtnText}>Check-in</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )
          )}

          {tab === 'sudah_checkin' && (
            filteredSudah.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="people-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>Belum ada yang check-in</Text>
              </View>
            ) : (
              <View style={styles.list}>
                {filteredSudah.map((att, i) => (
                  <TouchableOpacity
                    key={att.id}
                    style={[styles.card, i === filteredSudah.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => openCheckout(att)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.cardAvatar, { backgroundColor: '#F0FDF4' }]}>
                      <Text style={[styles.cardAvatarText, { color: '#16A34A' }]}>
                        {((att.employee as any)?.name ?? '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{(att.employee as any)?.name ?? '-'}</Text>
                      {(att.employee as any)?.position && (
                        <Text style={styles.cardSub}>{(att.employee as any).position}</Text>
                      )}
                      <View style={styles.timeRow}>
                        <Ionicons name="log-in-outline" size={12} color="#16A34A" />
                        <Text style={styles.timeText}>{formatTime(att.check_in)}</Text>
                        {att.check_in_branch && (
                          <Text style={styles.branchText}> · {(att.check_in_branch as any).name}</Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.checkoutBtn}>
                      <Ionicons name="log-out-outline" size={16} color="#DC2626" />
                      <Text style={styles.checkoutBtnText}>Check-out</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )
          )}
        </ScrollView>
      )}

      {/* PIN Modal */}
      <Modal visible={pinModal} transparent animationType="fade" onRequestClose={() => setPinModal(false)}>
        <View style={styles.pinOverlay}>
          <View style={styles.pinCard}>
            <TouchableOpacity style={styles.pinClose} onPress={() => setPinModal(false)}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>

            <View style={[styles.pinAvatar, selectedAttendance ? { backgroundColor: '#FEF2F2' } : { backgroundColor: '#F0FDF4' }]}>
              <Ionicons
                name={selectedAttendance ? 'log-out-outline' : 'log-in-outline'}
                size={28}
                color={selectedAttendance ? '#DC2626' : '#16A34A'}
              />
            </View>
            <Text style={styles.pinTitle}>{selectedAttendance ? 'Check-out' : 'Check-in'}</Text>
            <Text style={styles.pinName}>{selectedEmployee?.name ?? ''}</Text>
            {selectedEmployee?.position && <Text style={styles.pinPosition}>{selectedEmployee.position}</Text>}

            <Text style={styles.pinPrompt}>Masukkan PIN 4 digit</Text>

            {/* PIN dots */}
            <View style={styles.pinDots}>
              {[0,1,2,3].map(i => (
                <View key={i} style={[styles.pinDot, pinInput.length > i && styles.pinDotFilled]} />
              ))}
            </View>

            {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}

            {/* Numpad */}
            <View style={styles.numpad}>
              {NUMPAD.map((k, idx) => (
                k === '' ? <View key={idx} style={styles.numKey} /> :
                <TouchableOpacity
                  key={idx}
                  style={[styles.numKey, k === '←' && styles.numKeyDelete]}
                  onPress={() => handlePinInput(k)}
                  disabled={processing}
                  activeOpacity={0.7}
                >
                  {k === '←'
                    ? <Ionicons name="backspace-outline" size={22} color="#374151" />
                    : <Text style={styles.numKeyText}>{k}</Text>
                  }
                </TouchableOpacity>
              ))}
            </View>

            {processing && <ActivityIndicator color="#347385" style={{ marginTop: 8 }} />}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerDate: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  refreshBtn: { padding: 8 },
  statsRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12,
  },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
  },
  statNum: { fontSize: 20, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 2, textAlign: 'center' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 4,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  tabs: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, gap: 8,
  },
  tabBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#fff', alignItems: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  tabBtnActive: { backgroundColor: '#347385', borderColor: '#347385' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#fff' },
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
  list: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  cardAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  cardAvatarText: { fontSize: 17, fontWeight: '700', color: '#347385' },
  cardName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  cardSub: { fontSize: 12, color: '#9CA3AF' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  timeText: { fontSize: 12, fontWeight: '600', color: '#16A34A' },
  branchText: { fontSize: 11, color: '#9CA3AF' },
  checkinBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F0FDF4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  checkinBtnText: { fontSize: 12, fontWeight: '700', color: '#16A34A' },
  checkoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#FECACA',
  },
  checkoutBtnText: { fontSize: 12, fontWeight: '700', color: '#DC2626' },
  // PIN Modal
  pinOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  pinCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    width: '100%', maxWidth: 340, alignItems: 'center',
  },
  pinClose: { position: 'absolute', top: 16, right: 16 },
  pinAvatar: {
    width: 64, height: 64, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  pinTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  pinName: { fontSize: 15, fontWeight: '600', color: '#374151', marginTop: 4 },
  pinPosition: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  pinPrompt: { fontSize: 13, color: '#6B7280', marginTop: 16, marginBottom: 12 },
  pinDots: { flexDirection: 'row', gap: 14, marginBottom: 8 },
  pinDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: 'transparent',
  },
  pinDotFilled: { backgroundColor: '#347385', borderColor: '#347385' },
  pinError: { fontSize: 12, color: '#EF4444', marginBottom: 8 },
  numpad: {
    flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 10, marginTop: 8, justifyContent: 'center',
  },
  numKey: {
    width: 68, height: 52, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
  },
  numKeyDelete: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  numKeyText: { fontSize: 22, fontWeight: '600', color: '#1A202C' },
});
