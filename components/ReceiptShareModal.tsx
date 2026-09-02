import React, { useRef, useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReceiptImageView, { type ReceiptImageData } from './ReceiptImageView';
import { captureAndShareReceipt } from '@/lib/captureReceipt';
import { qrisService } from '@/lib/qrisService';

interface Props {
  visible: boolean;
  data: ReceiptImageData | null;
  onClose: () => void;
}

export default function ReceiptShareModal({ visible, data, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const receiptRef = useRef<View>(null);
  const [capturing, setCapturing] = useState(false);
  const [qrisContent, setQrisContent] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !data) return;
    const needsQris = data.paymentMethod === 'qris' ||
      (data.paymentMethod === 'split' && data.splitPayment?.secondMethod === 'qris');
    if (!needsQris) { setQrisContent(null); return; }
    qrisService.getActive().then((s) => {
      if (s?.qris_content) {
        const amount = data.paymentMethod === 'split'
          ? (data.splitPayment?.secondAmount ?? data.total)
          : data.total;
        setQrisContent(qrisService.generateDynamic(s.qris_content, amount));
      }
    }).catch(() => {});
  }, [visible, data]);

  const handleShare = async () => {
    if (!data) return;
    setCapturing(true);
    try {
      await captureAndShareReceipt(receiptRef);
    } catch {
      Alert.alert('Gagal', 'Tidak bisa membagikan gambar struk.');
    } finally {
      setCapturing(false);
    }
  };

  if (!data) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Bagikan Struk</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.previewScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.previewShadow}>
              <View ref={receiptRef} collapsable={false}>
                <ReceiptImageView data={{ ...data, qrisContent }} />
              </View>
            </View>
          </ScrollView>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btnShare, capturing && styles.btnDisabled]}
              onPress={handleShare}
              disabled={capturing}
              activeOpacity={0.8}
            >
              {capturing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                  <Text style={styles.btnShareText}>Kirim ke WhatsApp</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F3F4F6',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  closeBtn: { padding: 4 },

  previewScroll: { alignItems: 'center', paddingVertical: 12 },
  previewShadow: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
    borderRadius: 4, overflow: 'hidden',
  },

  btnRow: {
    paddingHorizontal: 16, paddingTop: 12,
  },
  btnShare: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#25D366', borderRadius: 14,
    paddingVertical: 14,
  },
  btnDisabled: { opacity: 0.6 },
  btnShareText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
