import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  value: string | null;
  title?: string;
  maxDate?: string | null;
  minDate?: string | null;
  onConfirm: (date: string) => void;
  onCancel: () => void;
}

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const ITEM_H = 46;
const VISIBLE = 5;
const PICKER_H = ITEM_H * VISIBLE;

function daysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

function range(from: number, to: number): number[] {
  const arr: number[] = [];
  for (let i = from; i <= to; i++) arr.push(i);
  return arr;
}

// ─── Column ───────────────────────────────────────────────────────────────────
// Fully self-contained: scroll position is managed internally.
// Parent is only notified via onSelect when scroll ends.

function Column({
  items,
  initialIndex,
  resetKey,
  onSelect,
  renderLabel,
  flex = 1,
}: {
  items: number[];
  initialIndex: number;
  resetKey: number;
  onSelect: (index: number) => void;
  renderLabel: (v: number) => string;
  flex?: number;
}) {
  const ref = useRef<ScrollView>(null);
  // Track current visual index internally — never driven by parent after mount
  const currentIdx = useRef(initialIndex);
  // Suppress the useEffect scroll when it's already in sync
  const didMount = useRef(false);

  // Jump to position whenever resetKey changes (modal re-opens or value resets)
  useEffect(() => {
    const idx = Math.max(0, Math.min(initialIndex, items.length - 1));
    currentIdx.current = idx;
    const delay = didMount.current ? 0 : 80;
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: idx * ITEM_H, animated: false });
    }, delay);
    didMount.current = true;
    return () => clearTimeout(t);
  }, [resetKey]); // intentionally only resetKey — not initialIndex

  const snapToNearest = (y: number) => {
    const idx = Math.max(0, Math.min(Math.round(y / ITEM_H), items.length - 1));
    ref.current?.scrollTo({ y: idx * ITEM_H, animated: true });
    if (idx !== currentIdx.current) {
      currentIdx.current = idx;
      onSelect(idx);
    }
  };

  return (
    <View style={[col.wrap, { flex }]}>
      <ScrollView
        ref={ref}
        style={{ height: PICKER_H }}
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={0}
        onScrollEndDrag={(e) => snapToNearest(e.nativeEvent.contentOffset.y)}
        onMomentumScrollEnd={(e) => snapToNearest(e.nativeEvent.contentOffset.y)}
      >
        {items.map((v, i) => (
          <TouchableOpacity
            key={v}
            style={col.item}
            onPress={() => {
              currentIdx.current = i;
              ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
              onSelect(i);
            }}
            activeOpacity={0.6}
          >
            <Text style={col.itemText}>{renderLabel(v)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* Fade top */}
      <View pointerEvents="none" style={col.fadeTop} />
      {/* Fade bottom */}
      <View pointerEvents="none" style={col.fadeBottom} />
      {/* Selection box */}
      <View pointerEvents="none" style={col.highlight} />
    </View>
  );
}

const col = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  item: { height: ITEM_H, justifyContent: 'center', alignItems: 'center' },
  itemText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  highlight: {
    position: 'absolute',
    top: ITEM_H * 2,
    left: 2, right: 2,
    height: ITEM_H,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#A9DFE9',
    backgroundColor: 'rgba(86,178,193,0.1)',
  },
  fadeTop: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: ITEM_H * 2,
    backgroundColor: 'transparent',
  },
  fadeBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: ITEM_H * 2,
    backgroundColor: 'transparent',
  },
});

// ─── DatePickerModal ──────────────────────────────────────────────────────────

export default function DatePickerModal({
  visible, value, title = 'Pilih Tanggal',
  minDate, maxDate,
  onConfirm, onCancel,
}: Props) {
  const now = new Date();

  const parseValue = (v: string | null) => {
    if (v) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d;
    }
    return now;
  };

  const minYear = minDate ? new Date(minDate).getFullYear() : 2020;
  const maxYear = maxDate ? new Date(maxDate).getFullYear() : now.getFullYear() + 1;
  const years = range(minYear, maxYear);
  const months = range(1, 12);

  // Internal state — only set when modal opens
  const [day, setDay] = useState(now.getDate());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  // Bumped each time modal opens to trigger Column reset
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (visible) {
      const d = parseValue(value);
      setDay(d.getDate());
      setMonth(d.getMonth() + 1);
      setYear(d.getFullYear());
      setResetKey((k) => k + 1);
    }
  }, [visible]);

  const totalDays = daysInMonth(month, year);
  const days = range(1, totalDays);

  const dayIdx = Math.max(0, Math.min(day - 1, totalDays - 1));
  const monthIdx = month - 1;
  const yearIdx = Math.max(0, years.indexOf(year));

  const handleConfirm = () => {
    const safeDay = Math.min(day, daysInMonth(month, year));
    const m = month.toString().padStart(2, '0');
    const d = safeDay.toString().padStart(2, '0');
    onConfirm(`${year}-${m}-${d}`);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity style={s.card} activeOpacity={1} onPress={() => {}}>

          <View style={s.header}>
            <Ionicons name="calendar-outline" size={18} color="#347385" />
            <Text style={s.title}>{title}</Text>
            <TouchableOpacity onPress={onCancel}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={s.preview}>
            <Text style={s.previewText}>
              {day.toString().padStart(2, '0')} {MONTHS[month - 1]} {year}
            </Text>
          </View>

          <View style={s.colLabels}>
            <Text style={[s.colLabel, { flex: 1 }]}>Tgl</Text>
            <Text style={[s.colLabel, { flex: 2 }]}>Bulan</Text>
            <Text style={[s.colLabel, { flex: 1.4 }]}>Tahun</Text>
          </View>

          <View style={s.pickers}>
            <Column
              items={days}
              initialIndex={dayIdx}
              resetKey={resetKey}
              onSelect={(i) => setDay(days[i])}
              renderLabel={(v) => v.toString().padStart(2, '0')}
              flex={1}
            />
            <Column
              items={months}
              initialIndex={monthIdx}
              resetKey={resetKey}
              onSelect={(i) => setMonth(months[i])}
              renderLabel={(v) => MONTHS[v - 1]}
              flex={2}
            />
            <Column
              items={years}
              initialIndex={yearIdx}
              resetKey={resetKey}
              onSelect={(i) => setYear(years[i])}
              renderLabel={(v) => v.toString()}
              flex={1.4}
            />
          </View>

          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={s.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm} activeOpacity={0.85}>
              <Text style={s.confirmBtnText}>Pilih</Text>
            </TouchableOpacity>
          </View>

        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 20,
    width: '100%', maxWidth: 360,
    paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20,
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '800', color: '#111827' },

  preview: {
    backgroundColor: '#EEF8FA', borderRadius: 12, paddingVertical: 10,
    alignItems: 'center',
  },
  previewText: { fontSize: 16, fontWeight: '800', color: '#347385' },

  colLabels: { flexDirection: 'row', paddingHorizontal: 4 },
  colLabel: { textAlign: 'center', fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.4 },

  pickers: { flexDirection: 'row', gap: 4 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#F3F4F6', alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  confirmBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#347385', alignItems: 'center',
  },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
