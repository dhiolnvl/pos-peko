import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Switch, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { thermalPrinterService, type PrinterDevice } from '@/lib/thermalPrinterService';
import { printTestPage } from '@/lib/printerHelper';

interface Props {
  /** Kalau true, component manage sendiri paddingTop (untuk cashier/backoffice yang pakai header custom) */
  noPaddingTop?: boolean;
}

export function PrinterSettingsContent({ noPaddingTop }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [status, setStatus] = useState(thermalPrinterService.getConnectionStatus());
  const [autoConnect, setAutoConnect] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
      thermalPrinterService.getAutoConnect().then(setAutoConnect);
      const interval = setInterval(refreshStatus, 2000);
      return () => clearInterval(interval);
    }, [])
  );

  const refreshStatus = () => setStatus(thermalPrinterService.getConnectionStatus());

  const handleScan = async () => {
    setScanning(true);
    setDevices([]);
    try {
      const found = await thermalPrinterService.scanDevices();
      setDevices(found);
      if (found.length === 0) {
        Alert.alert(
          'Tidak Ada Perangkat',
          'Tidak ditemukan printer Bluetooth. Pastikan printer sudah di-pair di pengaturan Bluetooth perangkat Anda.'
        );
      }
    } catch (e: any) {
      Alert.alert('Gagal', e.message ?? 'Tidak dapat mencari perangkat');
    } finally {
      setScanning(false);
    }
  };

  const handleConnect = async (device: PrinterDevice) => {
    setConnecting(device.inner_mac_address);
    try {
      await thermalPrinterService.connect(device);
      refreshStatus();
      Alert.alert('Terhubung', `Berhasil terhubung ke ${device.device_name}`);
    } catch (e: any) {
      Alert.alert('Gagal', e.message ?? 'Tidak dapat terhubung ke printer');
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = () => {
    Alert.alert('Putuskan Koneksi', 'Yakin ingin memutuskan koneksi printer?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Putuskan', style: 'destructive',
        onPress: async () => {
          try {
            await thermalPrinterService.disconnect();
            refreshStatus();
          } catch (e: any) {
            Alert.alert('Gagal', e.message ?? 'Gagal memutuskan koneksi');
          }
        },
      },
    ]);
  };

  const handleAutoConnect = async (val: boolean) => {
    setAutoConnect(val);
    await thermalPrinterService.setAutoConnect(val);
  };

  const handleTestPrint = async () => {
    if (!status.isConnected) {
      Alert.alert('Printer Tidak Terhubung', 'Hubungkan printer terlebih dahulu.');
      return;
    }
    setTesting(true);
    try {
      await printTestPage();
      Alert.alert('Berhasil', 'Test print berhasil!');
    } catch (e: any) {
      Alert.alert('Gagal', e.message ?? 'Gagal test print');
    } finally {
      setTesting(false);
    }
  };

  const contentWidth = isTablet ? Math.min(width * 0.6, 560) : width;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingBottom: insets.bottom + 32, alignSelf: 'center', width: contentWidth },
        noPaddingTop && { paddingTop: 4 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Status koneksi */}
      <Text style={styles.sectionTitle}>Status Koneksi</Text>
      <View style={styles.statusCard}>
        <View style={[styles.statusDot, status.isConnected && styles.statusDotActive]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusLabel}>
            {status.isConnected ? 'Terhubung' : 'Tidak Terhubung'}
          </Text>
          {status.device && (
            <Text style={styles.statusDevice}>{status.device.device_name}</Text>
          )}
        </View>
        {status.isConnected && (
          <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
            <Text style={styles.disconnectBtnText}>Putuskan</Text>
          </TouchableOpacity>
        )}
      </View>

      {status.isConnected && (
        <View style={styles.autoConnectCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.autoConnectLabel}>Auto Connect</Text>
            <Text style={styles.autoConnectSub}>Otomatis terhubung saat app dibuka</Text>
          </View>
          <Switch
            value={autoConnect}
            onValueChange={handleAutoConnect}
            trackColor={{ false: '#E5E7EB', true: '#A9DFE9' }}
            thumbColor={autoConnect ? '#347385' : '#fff'}
          />
        </View>
      )}

      {status.isConnected && (
        <TouchableOpacity
          style={[styles.testBtn, testing && { opacity: 0.6 }]}
          onPress={handleTestPrint}
          disabled={testing}
        >
          {testing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="print-outline" size={18} color="#fff" />
              <Text style={styles.testBtnText}>Test Print</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Scan perangkat */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Perangkat Tersedia</Text>
        <TouchableOpacity
          style={[styles.scanBtn, scanning && { opacity: 0.6 }]}
          onPress={handleScan}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator size="small" color="#347385" />
          ) : (
            <>
              <Ionicons name="bluetooth" size={15} color="#347385" />
              <Text style={styles.scanBtnText}>Cari</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {devices.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bluetooth-outline" size={44} color="#D1D5DB" />
          <Text style={styles.emptyStateText}>
            Belum ada perangkat.{'\n'}Tap "Cari" untuk mencari printer.
          </Text>
        </View>
      ) : (
        <View style={styles.deviceList}>
          {devices.map((device) => {
            const isThisConnecting = connecting === device.inner_mac_address;
            const isConnectedDevice = status.device?.inner_mac_address === device.inner_mac_address;
            return (
              <TouchableOpacity
                key={device.inner_mac_address}
                style={[styles.deviceCard, isConnectedDevice && styles.deviceCardActive]}
                onPress={() => handleConnect(device)}
                disabled={!!connecting || isConnectedDevice}
                activeOpacity={0.75}
              >
                <View style={[styles.deviceIcon, isConnectedDevice && styles.deviceIconActive]}>
                  <Ionicons
                    name="print-outline"
                    size={22}
                    color={isConnectedDevice ? '#fff' : '#347385'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.deviceName, isConnectedDevice && { color: '#347385' }]}>
                    {device.device_name}
                  </Text>
                  <Text style={styles.deviceMac}>{device.inner_mac_address}</Text>
                </View>
                {isThisConnecting ? (
                  <ActivityIndicator size="small" color="#347385" />
                ) : isConnectedDevice ? (
                  <Ionicons name="checkmark-circle" size={20} color="#347385" />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={18} color="#347385" />
        <Text style={styles.infoText}>
          Pastikan printer Bluetooth sudah di-pair melalui pengaturan Bluetooth perangkat Anda terlebih dahulu, kemudian tap "Cari" di atas.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 4,
  },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#D1D5DB' },
  statusDotActive: { backgroundColor: '#16A34A' },
  statusLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  statusDevice: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  disconnectBtn: {
    backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  disconnectBtnText: { fontSize: 12, fontWeight: '700', color: '#DC2626' },

  autoConnectCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  autoConnectLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  autoConnectSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  testBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 12, backgroundColor: '#347385',
  },
  testBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  scanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EEF8FA', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  scanBtnText: { fontSize: 13, fontWeight: '700', color: '#347385' },

  emptyState: {
    backgroundColor: '#fff', borderRadius: 12, padding: 32,
    alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  emptyStateText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },

  deviceList: { gap: 8 },
  deviceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  deviceCardActive: { borderColor: '#A9DFE9', backgroundColor: '#F0FAFB' },
  deviceIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#EEF8FA', justifyContent: 'center', alignItems: 'center',
  },
  deviceIconActive: { backgroundColor: '#347385' },
  deviceName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  deviceMac: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#EEF8FA', borderRadius: 10, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#347385',
  },
  infoText: { flex: 1, fontSize: 12, color: '#374151', lineHeight: 18 },
});
