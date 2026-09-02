import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackofficeHeader } from '@/components/BackofficeHeader';
import { TabletCenteredView } from '@/components/TabletCenteredView';
import { useAuthStore } from '@/store/authStore';
import { ensureExpenseTable, getExpenses, getExpenseStats, createExpense, updateExpense, deleteExpense, EXPENSE_CATEGORIES, type Expense, type ExpenseStats } from '@/lib/expenseQueries';

function fmtMoney(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ─── Payment method label ─────────────────────────────────────────────────────

const PM_LABELS: Record<string, string> = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS' };
const PM_COLORS: Record<string, string> = { cash: '#16A34A', transfer: '#347385', qris: '#7C3AED' };
const PM_BG: Record<string, string> = { cash: '#F0FDF4', transfer: '#EEF8FA', qris: '#F5F3FF' };

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconBox, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={statStyles.col}>
        <Text style={[statStyles.value, { color }]} numberOfLines={1}>{value}</Text>
        <Text style={statStyles.label}>{label}</Text>
      </View>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2, minWidth: 140 },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  col: { flex: 1 },
  value: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 11, color: '#6B7280', marginTop: 1 },
});

// ─── Expense card ─────────────────────────────────────────────────────────────

function ExpenseCard({ item, onEdit, onDelete }: { item: Expense; onEdit: () => void; onDelete: () => void }) {
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.left}>
        <View style={[cardStyles.catDot, { backgroundColor: '#56B2C1' }]} />
        <View style={{ flex: 1 }}>
          <View style={cardStyles.topRow}>
            <Text style={cardStyles.desc} numberOfLines={1}>{item.description}</Text>
            <Text style={cardStyles.amount}>{fmtMoney(item.amount)}</Text>
          </View>
          <View style={cardStyles.metaRow}>
            <View style={[cardStyles.catChip]}>
              <Text style={cardStyles.catText}>{item.category}</Text>
            </View>
            <View style={[cardStyles.pmChip, { backgroundColor: PM_BG[item.payment_method] }]}>
              <Text style={[cardStyles.pmText, { color: PM_COLORS[item.payment_method] }]}>{PM_LABELS[item.payment_method]}</Text>
            </View>
            <Text style={cardStyles.date}>{fmtDate(item.date)}</Text>
          </View>
          {!!item.notes && <Text style={cardStyles.notes} numberOfLines={1}>{item.notes}</Text>}
        </View>
      </View>
      <View style={cardStyles.actions}>
        <TouchableOpacity onPress={onEdit} style={cardStyles.actionBtn}>
          <Ionicons name="pencil-outline" size={16} color="#347385" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={[cardStyles.actionBtn, { backgroundColor: '#FEF2F2' }]}>
          <Ionicons name="trash-outline" size={16} color="#DC2626" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  left: { flexDirection: 'row', gap: 10, flex: 1 },
  catDot: { width: 4, borderRadius: 2, alignSelf: 'stretch', marginTop: 2, minHeight: 40 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  desc: { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  amount: { fontSize: 14, fontWeight: '800', color: '#DC2626' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  catChip: { backgroundColor: '#F0F7F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  catText: { fontSize: 11, fontWeight: '600', color: '#347385' },
  pmChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  pmText: { fontSize: 11, fontWeight: '600' },
  date: { fontSize: 11, color: '#9CA3AF' },
  notes: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 6, alignSelf: 'flex-start', paddingLeft: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center' },
});

// ─── Form modal ───────────────────────────────────────────────────────────────

interface FormData {
  category: string;
  description: string;
  amount: string;
  paymentMethod: 'cash' | 'transfer' | 'qris';
  date: string;
  notes: string;
}

const EMPTY_FORM: FormData = {
  category: EXPENSE_CATEGORIES[0],
  description: '',
  amount: '',
  paymentMethod: 'cash',
  date: todayISO(),
  notes: '',
};

function ExpenseFormModal({
  visible,
  expense,
  onClose,
  onSaved,
  branchId,
  userId,
  userName,
}: {
  visible: boolean;
  expense: Expense | null;
  onClose: () => void;
  onSaved: () => void;
  branchId: string;
  userId: string;
  userName: string;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const scrollRef = useRef<ScrollView>(null);
  const notesRef = useRef<View>(null);

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      if (expense) {
        setForm({
          category: expense.category,
          description: expense.description,
          amount: String(expense.amount),
          paymentMethod: expense.payment_method,
          date: expense.date,
          notes: expense.notes ?? '',
        });
      } else {
        setForm({ ...EMPTY_FORM, date: todayISO() });
      }
    }
  }, [visible, expense]);

  const set = (key: keyof FormData, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.description.trim()) { Alert.alert('Perhatian', 'Deskripsi wajib diisi'); return; }
    const amount = parseFloat(form.amount.replace(/[^0-9.]/g, ''));
    if (!amount || amount <= 0) { Alert.alert('Perhatian', 'Nominal wajib diisi dan lebih dari 0'); return; }
    if (!form.date) { Alert.alert('Perhatian', 'Tanggal wajib diisi'); return; }

    setSaving(true);
    try {
      if (expense) {
        await updateExpense(expense.id, {
          category: form.category,
          description: form.description.trim(),
          amount,
          paymentMethod: form.paymentMethod,
          date: form.date,
          notes: form.notes.trim() || undefined,
        });
      } else {
        await createExpense({
          branchId,
          category: form.category,
          description: form.description.trim(),
          amount,
          paymentMethod: form.paymentMethod,
          date: form.date,
          createdBy: userId,
          createdByName: userName,
          notes: form.notes.trim() || undefined,
        });
      }
      onSaved();
    } catch (e: any) {
      Alert.alert('Gagal', e.message ?? 'Terjadi kesalahan');
    } finally {
      setSaving(false);
    }
  };

  const modalW = isTablet ? Math.min(width * 0.7, 540) : width;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={formStyles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ width: modalW }}
        >
          <View style={[formStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* Header */}
            <View style={formStyles.header}>
              <Text style={formStyles.title}>{expense ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}</Text>
              <TouchableOpacity onPress={onClose} style={formStyles.closeBtn}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollRef}
              contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 14 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Kategori */}
              <View>
                <Text style={formStyles.label}>Kategori</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[formStyles.catChip, form.category === cat && formStyles.catChipActive]}
                      onPress={() => set('category', cat)}
                    >
                      <Text style={[formStyles.catChipText, form.category === cat && formStyles.catChipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Deskripsi */}
              <View>
                <Text style={formStyles.label}>Deskripsi <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <TextInput
                  style={formStyles.input}
                  value={form.description}
                  onChangeText={(v) => set('description', v)}
                  placeholder="Contoh: Bayar listrik bulan ini"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              {/* Nominal */}
              <View>
                <Text style={formStyles.label}>Nominal <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <TextInput
                  style={formStyles.input}
                  value={form.amount}
                  onChangeText={(v) => set('amount', v.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                />
              </View>

              {/* Metode pembayaran */}
              <View>
                <Text style={formStyles.label}>Metode Pembayaran</Text>
                <View style={formStyles.pmRow}>
                  {(['cash', 'transfer', 'qris'] as const).map((pm) => (
                    <TouchableOpacity
                      key={pm}
                      style={[formStyles.pmBtn, form.paymentMethod === pm && { backgroundColor: PM_COLORS[pm], borderColor: PM_COLORS[pm] }]}
                      onPress={() => set('paymentMethod', pm)}
                    >
                      <Text style={[formStyles.pmBtnText, form.paymentMethod === pm && { color: '#fff' }]}>{PM_LABELS[pm]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Tanggal */}
              <View>
                <Text style={formStyles.label}>Tanggal <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <TextInput
                  style={formStyles.input}
                  value={form.date}
                  onChangeText={(v) => set('date', v)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              {/* Catatan */}
              <View ref={notesRef}>
                <Text style={formStyles.label}>Catatan (opsional)</Text>
                <TextInput
                  style={[formStyles.input, { height: 80, textAlignVertical: 'top' }]}
                  value={form.notes}
                  onChangeText={(v) => set('notes', v)}
                  placeholder="Keterangan tambahan..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  onFocus={() => {
                    notesRef.current?.measureLayout(
                      scrollRef.current as any,
                      (_x, y) => { scrollRef.current?.scrollTo({ y: y - 16, animated: true }); },
                      () => {}
                    );
                  }}
                />
              </View>
            </ScrollView>

            {/* Tombol simpan */}
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <TouchableOpacity
                style={[formStyles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={formStyles.saveBtnText}>Simpan</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const formStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  sheet: { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxHeight: '90%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', backgroundColor: '#FAFAFA' },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: 'transparent' },
  catChipActive: { backgroundColor: '#EEF8FA', borderColor: '#347385' },
  catChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  catChipTextActive: { color: '#347385' },
  pmRow: { flexDirection: 'row', gap: 10 },
  pmBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  pmBtnText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  saveBtn: { backgroundColor: '#347385', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BackofficeExpensesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { user, currentBranch } = useAuthStore();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<ExpenseStats>({ totalAmount: 0, totalCount: 0, byCategory: [] });
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    if (!currentBranch) {
      setLoading(false);
      return;
    }
    try {
      await ensureExpenseTable();
      const [list, statsData] = await Promise.all([
        getExpenses(currentBranch.id, { category: categoryFilter }),
        getExpenseStats(currentBranch.id),
      ]);
      setExpenses(list);
      setStats(statsData);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentBranch, categoryFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(true); }, [loadData]);

  const handleDelete = (item: Expense) => {
    Alert.alert('Hapus Pengeluaran', `Hapus "${item.description}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus', style: 'destructive',
        onPress: async () => {
          await deleteExpense(item.id);
          loadData(true);
        },
      },
    ]);
  };

  const numCols = isTablet ? 2 : 1;

  return (
    <View style={styles.container}>
      <BackofficeHeader
        title="Pengeluaran"
        subtitle={stats.totalCount > 0 ? `${stats.totalCount} catatan` : undefined}
        rightIcon="add"
        onRightPress={() => { setEditTarget(null); setFormVisible(true); }}
      />

      <TabletCenteredView style={{ backgroundColor: '#F0F7F9' }}>
        {/* Stats */}
        <View style={styles.statsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10, alignItems: 'center' }}
          >
            <StatCard label="Total Pengeluaran" value={fmtMoney(stats.totalAmount)} icon="cash-outline" color="#DC2626" />
            <StatCard label="Jumlah Catatan" value={stats.totalCount} icon="document-text-outline" color="#347385" />
            {stats.byCategory.slice(0, 3).map((c) => (
              <StatCard key={c.category} label={c.category} value={fmtMoney(c.amount)} icon="folder-outline" color="#E69738" />
            ))}
          </ScrollView>
        </View>

        {/* Filter kategori */}
        <View style={styles.filterWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
          >
            <TouchableOpacity
              style={[styles.chip, categoryFilter === 'all' && styles.chipActive]}
              onPress={() => setCategoryFilter('all')}
            >
              <Text style={[styles.chipText, categoryFilter === 'all' && styles.chipTextActive]}>Semua</Text>
            </TouchableOpacity>
            {EXPENSE_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, categoryFilter === cat && styles.chipActive]}
                onPress={() => setCategoryFilter(cat)}
              >
                <Text style={[styles.chipText, categoryFilter === cat && styles.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#56B2C1" />
          </View>
        ) : expenses.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>Belum ada pengeluaran</Text>
            <Text style={styles.emptyDesc}>Tekan tombol + untuk mencatat pengeluaran</Text>
          </View>
        ) : (
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.id}
            numColumns={numCols}
            key={String(numCols)}
            contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 24 }}
            columnWrapperStyle={numCols > 1 ? { paddingHorizontal: 8 } : undefined}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#56B2C1" />}
            renderItem={({ item }) => (
              <View style={numCols > 1 ? { flex: 1, paddingHorizontal: 8 } : {}}>
                <ExpenseCard
                  item={item}
                  onEdit={() => { setEditTarget(item); setFormVisible(true); }}
                  onDelete={() => handleDelete(item)}
                />
              </View>
            )}
          />
        )}
      </TabletCenteredView>

      <ExpenseFormModal
        visible={formVisible}
        expense={editTarget}
        onClose={() => setFormVisible(false)}
        onSaved={() => { setFormVisible(false); loadData(true); }}
        branchId={currentBranch?.id ?? ''}
        userId={user?.id ?? ''}
        userName={user?.name ?? ''}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F7F9' },
  statsWrap: { height: 90, justifyContent: 'center', paddingVertical: 12 },
  filterWrap: { height: 40, justifyContent: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  chipActive: { backgroundColor: '#347385' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 60 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },
  emptyDesc: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', maxWidth: 260 },
});
