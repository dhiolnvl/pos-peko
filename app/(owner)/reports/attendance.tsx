import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, useWindowDimensions, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { supabase } from '@/lib/supabase';
import { buildAttendancePdfHtml, fmtDurationFull, type AttendancePdfRow } from '@/lib/reportQueries';
import useAuthStore from '@/store/authStore';

interface Branch { id: string; name: string; }

interface AttendanceRow {
  id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  check_in_branch: { name: string } | null;
  check_out_branch: { name: string } | null;
  employee: { name: string; position: string | null; branch: { name: string } | null } | null;
}

interface EmployeeSummary {
  employee_id: string;
  name: string;
  position: string | null;
  branch_name: string | null;
  total_hadir: number;
  total_terlambat: number;
  avg_duration_minutes: number;
  records: AttendanceRow[];
}

type Preset = 'today' | 'week' | 'month';

function getRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === 'today') {
    const today = dateStr(now);
    return { from: today, to: today };
  }
  if (preset === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { from: dateStr(start), to: dateStr(now) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: dateStr(start), to: dateStr(now) };
}

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
}

function durationMinutes(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0;
  return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000);
}

function fmtDuration(minutes: number): string {
  if (minutes <= 0) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}j` : `${h}j ${m}m`;
}

export default function AttendanceReportScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [preset, setPreset] = useState<Preset>('today');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<EmployeeSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { currentBranch } = useAuthStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getRange(preset);

      // Load branches sekali
      if (branches.length === 0) {
        const { data: brs } = await supabase
          .from('branches').select('id, name').eq('is_active', true).order('name');
        setBranches(brs ?? []);
      }

      let query = supabase
        .from('attendances')
        .select(`
          id, employee_id, date, check_in, check_out,
          check_in_branch:branches!check_in_branch_id(name),
          check_out_branch:branches!check_out_branch_id(name),
          employee:employees!employee_id(name, position, branch:branches!branch_id(name))
        `)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })
        .order('check_in', { ascending: true });

      if (selectedBranch) {
        query = query.eq('check_in_branch_id', selectedBranch);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as AttendanceRow[];

      // Group per karyawan
      const map = new Map<string, EmployeeSummary>();
      for (const row of rows) {
        const emp = row.employee;
        if (!emp) continue;
        if (!map.has(row.employee_id)) {
          map.set(row.employee_id, {
            employee_id: row.employee_id,
            name: emp.name,
            position: emp.position,
            branch_name: (emp.branch as any)?.name ?? null,
            total_hadir: 0,
            total_terlambat: 0,
            avg_duration_minutes: 0,
            records: [],
          });
        }
        const s = map.get(row.employee_id)!;
        s.records.push(row);
        if (row.check_in) s.total_hadir++;
      }

      // Hitung avg duration
      for (const s of map.values()) {
        const durations = s.records
          .filter(r => r.check_in && r.check_out)
          .map(r => durationMinutes(r.check_in, r.check_out));
        s.avg_duration_minutes = durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0;
      }

      setSummaries(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [preset, selectedBranch]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const { from, to } = getRange(preset);
  const rangeLabel = from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;

  const totalHadir = summaries.reduce((s, e) => s + e.total_hadir, 0);
  const totalKaryawan = summaries.length;

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'week', label: '7 Hari' },
    { key: 'month', label: 'Bulan Ini' },
  ];

  const branchName = selectedBranch ? branches.find(b => b.id === selectedBranch)?.name ?? 'Cabang' : 'Semua Cabang';

  const handleExport = async () => {
    if (summaries.length === 0) return;
    setExporting(true);
    try {
      const pdfRows: AttendancePdfRow[] = summaries
        .flatMap((s) => s.records.map((r) => ({
          date: r.date,
          name: s.name,
          checkInTime: formatTime(r.check_in),
          checkOutTime: r.check_out ? formatTime(r.check_out) : '-:-',
          durationLabel: fmtDurationFull(
            r.check_in && r.check_out
              ? new Date(r.check_out).getTime() - new Date(r.check_in).getTime()
              : 0
          ),
          status: '-',
          note: '-',
        })))
        .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

      const now = new Date();
      const generatedAtLabel = `${now.toLocaleDateString('id-ID')} - ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} WIB`;

      const html = await buildAttendancePdfHtml(pdfRows, {
        periodLabel: rangeLabel,
        branchName,
        storeName: currentBranch?.name ?? 'Toko',
        storeAddress: currentBranch?.address,
        generatedAtLabel,
      });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const fileName = `laporan-presensi-${rangeLabel.replace(/[\s,–]+/g, '-')}.pdf`;

      if (Platform.OS === 'android') {
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
          'content://com.android.externalstorage.documents/tree/primary%3ADownload'
        );
        if (!perm.granted) return;
        const content = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const dest = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, fileName, 'application/pdf');
        await FileSystem.writeAsStringAsync(dest, content, { encoding: 'base64' });
        Alert.alert('Berhasil', `PDF tersimpan:\n${fileName}`);
      } else {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Simpan PDF' });
      }
    } catch (e: any) {
      Alert.alert('Gagal', e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Laporan Presensi</Text>
          <Text style={styles.headerSub}>{rangeLabel}</Text>
        </View>
        <TouchableOpacity
          onPress={handleExport}
          disabled={exporting || summaries.length === 0}
          style={[styles.exportBtn, (exporting || summaries.length === 0) && { opacity: 0.5 }]}
        >
          {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="download-outline" size={16} color="#fff" />}
          <Text style={styles.exportBtnText}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={load} style={{ padding: 8 }}>
          <Ionicons name="refresh" size={20} color="#347385" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <TabletCenteredView>
          {/* Filter periode */}
          <View style={styles.filterRow}>
            {PRESETS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[styles.presetBtn, preset === p.key && styles.presetBtnActive]}
                onPress={() => setPreset(p.key)}
              >
                <Text style={[styles.presetText, preset === p.key && styles.presetTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Filter cabang */}
          {branches.length > 1 && (
            <View style={styles.branchFilterWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                <TouchableOpacity
                  style={[styles.branchChip, selectedBranch === null && styles.branchChipActive]}
                  onPress={() => setSelectedBranch(null)}
                >
                  <Text style={[styles.branchChipText, selectedBranch === null && styles.branchChipTextActive]}>Semua Cabang</Text>
                </TouchableOpacity>
                {branches.map(b => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.branchChip, selectedBranch === b.id && styles.branchChipActive]}
                    onPress={() => setSelectedBranch(b.id)}
                  >
                    <Text style={[styles.branchChipText, selectedBranch === b.id && styles.branchChipTextActive]}>{b.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Stats */}
          <View style={[styles.statsRow, isTablet && styles.statsRowTablet]}>
            <View style={styles.statCard}>
              <Text style={styles.statNum}>{totalKaryawan}</Text>
              <Text style={styles.statLabel}>Karyawan</Text>
            </View>
            <View style={[styles.statCard, { borderColor: '#BBF7D0' }]}>
              <Text style={[styles.statNum, { color: '#16A34A' }]}>{totalHadir}</Text>
              <Text style={styles.statLabel}>Total Hadir</Text>
            </View>
            <View style={[styles.statCard, { borderColor: '#BFDBFE' }]}>
              <Text style={[styles.statNum, { color: '#2563EB' }]}>
                {summaries.filter(s => s.avg_duration_minutes > 0).length > 0
                  ? fmtDuration(Math.round(
                      summaries.filter(s => s.avg_duration_minutes > 0)
                        .reduce((a, b) => a + b.avg_duration_minutes, 0) /
                      summaries.filter(s => s.avg_duration_minutes > 0).length
                    ))
                  : '-'}
              </Text>
              <Text style={styles.statLabel}>Rata-rata Durasi</Text>
            </View>
          </View>

          {/* List karyawan */}
          {loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color="#347385" /></View>
          ) : summaries.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>Tidak ada data presensi</Text>
              <Text style={styles.emptySubText}>pada periode {rangeLabel}</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {summaries.map((s, i) => {
                const isExpanded = expandedId === s.employee_id;
                return (
                  <View key={s.employee_id} style={[styles.empCard, i === summaries.length - 1 && { borderBottomWidth: 0 }]}>
                    <TouchableOpacity
                      style={styles.empRow}
                      onPress={() => setExpandedId(isExpanded ? null : s.employee_id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.empAvatar}>
                        <Text style={styles.empAvatarText}>{s.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.empName}>{s.name}</Text>
                        <Text style={styles.empSub}>
                          {[s.position, s.branch_name].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <View style={styles.empStats}>
                        <View style={styles.empBadge}>
                          <Ionicons name="checkmark-circle" size={13} color="#16A34A" />
                          <Text style={styles.empBadgeText}>{s.total_hadir}x hadir</Text>
                        </View>
                        {s.avg_duration_minutes > 0 && (
                          <Text style={styles.empDuration}>{fmtDuration(s.avg_duration_minutes)}</Text>
                        )}
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16} color="#9CA3AF" style={{ marginLeft: 4 }}
                      />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.records}>
                        {s.records.map((r, ri) => {
                          const dur = durationMinutes(r.check_in, r.check_out);
                          return (
                            <View key={r.id} style={[styles.recordRow, ri === s.records.length - 1 && { borderBottomWidth: 0 }]}>
                              <View style={styles.recordDate}>
                                <Text style={styles.recordDateText}>{formatDate(r.date)}</Text>
                              </View>
                              <View style={styles.recordTimes}>
                                <View style={styles.recordTimeCell}>
                                  <Ionicons name="log-in-outline" size={12} color="#16A34A" />
                                  <Text style={styles.recordTimeIn}>{formatTime(r.check_in)}</Text>
                                  {r.check_in_branch && (
                                    <Text style={styles.recordBranch}>{(r.check_in_branch as any).name}</Text>
                                  )}
                                </View>
                                <Ionicons name="arrow-forward" size={12} color="#D1D5DB" />
                                <View style={styles.recordTimeCell}>
                                  <Ionicons name="log-out-outline" size={12} color={r.check_out ? '#DC2626' : '#D1D5DB'} />
                                  <Text style={[styles.recordTimeOut, !r.check_out && { color: '#D1D5DB' }]}>
                                    {r.check_out ? formatTime(r.check_out) : 'Belum'}
                                  </Text>
                                  {r.check_out_branch && (
                                    <Text style={styles.recordBranch}>{(r.check_out_branch as any).name}</Text>
                                  )}
                                </View>
                              </View>
                              <Text style={styles.recordDur}>{dur > 0 ? fmtDuration(dur) : '-'}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </TabletCenteredView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { paddingVertical: 60, alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#347385', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  exportBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
  },
  presetBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
  },
  presetBtnActive: { backgroundColor: '#347385', borderColor: '#347385' },
  presetText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  presetTextActive: { color: '#fff' },

  branchFilterWrap: { height: 48, justifyContent: 'center', marginBottom: 4 },
  branchChip: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#fff',
  },
  branchChipActive: { backgroundColor: '#347385', borderColor: '#347385' },
  branchChipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  branchChipTextActive: { color: '#fff', fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  statsRowTablet: {},
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  statNum: { fontSize: 22, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 10, color: '#9CA3AF', marginTop: 2, textAlign: 'center' },

  empty: { alignItems: 'center', paddingVertical: 56, gap: 8 },
  emptyText: { fontSize: 15, color: '#9CA3AF', fontWeight: '600' },
  emptySubText: { fontSize: 12, color: '#D1D5DB' },

  list: {
    marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2, overflow: 'hidden',
  },
  empCard: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  empRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  empAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  empAvatarText: { fontSize: 16, fontWeight: '700', color: '#347385' },
  empName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  empSub: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  empStats: { alignItems: 'flex-end', gap: 3 },
  empBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  empBadgeText: { fontSize: 12, fontWeight: '600', color: '#16A34A' },
  empDuration: { fontSize: 11, color: '#6B7280' },

  records: {
    backgroundColor: '#F9FAFB', borderTopWidth: 1, borderTopColor: '#F3F4F6',
    paddingHorizontal: 16,
  },
  recordRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  recordDate: { width: 72 },
  recordDateText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  recordTimes: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordTimeCell: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  recordTimeIn: { fontSize: 13, fontWeight: '700', color: '#16A34A' },
  recordTimeOut: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  recordBranch: { fontSize: 9, color: '#9CA3AF', marginLeft: 2 },
  recordDur: { fontSize: 12, color: '#6B7280', width: 40, textAlign: 'right' },
});
