import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { OwnerPageHeader } from '@/components/OwnerHeader';
import { PrinterSettingsContent } from '@/components/PrinterSettingsContent';

export default function OwnerPrinterSettingsScreen() {
  return (
    <View style={styles.container}>
      <OwnerPageHeader title="Pengaturan Printer" onBack={() => router.back()} />
      <PrinterSettingsContent noPaddingTop />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
});
