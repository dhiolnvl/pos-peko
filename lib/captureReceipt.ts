import { Platform, Linking } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { RefObject } from 'react';

export async function captureAndShareReceipt(ref: RefObject<any>): Promise<void> {
  // Capture view ke PNG
  const uri = await captureRef(ref, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });

  if (Platform.OS === 'android') {
    // Di Android: coba buka WA langsung via intent dengan file image
    // WA hanya terima URI yang bisa dibaca via content:// atau share intent
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Bagikan struk',
      });
    }
  } else {
    // iOS: pakai share sheet — user bisa pilih WA langsung
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'Bagikan struk',
      });
    }
  }
}
