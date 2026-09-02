import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface QRISSettings {
  id: string;
  merchant_name: string;
  merchant_city: string;
  qris_content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CACHE_KEY = 'qasio_qris_settings';

export const qrisService = {
  async getActive(): Promise<QRISSettings | null> {
    try {
      const { data, error } = await supabase
        .from('qris_settings')
        .select('*')
        .eq('is_active', true)
        .single();

      if (!error && data) {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
        return data as QRISSettings;
      }
    } catch {}

    // Fallback offline
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw) as QRISSettings;
    } catch {}

    return null;
  },

  async save(settings: { merchant_name: string; merchant_city: string; qris_content: string }): Promise<void> {
    // Nonaktifkan semua QRIS sebelumnya
    await supabase.from('qris_settings').update({ is_active: false }).eq('is_active', true);

    const { error } = await supabase.from('qris_settings').insert({
      merchant_name: settings.merchant_name,
      merchant_city: settings.merchant_city,
      qris_content: settings.qris_content,
      is_active: true,
    });
    if (error) throw new Error(error.message);

    await AsyncStorage.removeItem(CACHE_KEY);
  },

  async delete(): Promise<void> {
    await supabase.from('qris_settings').update({ is_active: false }).eq('is_active', true);
    await AsyncStorage.removeItem(CACHE_KEY);
  },

  generateDynamic(qrisContent: string, amount: number): string {
    try {
      if (!qrisContent || qrisContent.length < 50) return qrisContent;

      // Hapus CRC (tag 63) di akhir
      let qris = qrisContent.replace(/6304[0-9A-Fa-f]{4}$/, '');

      // Hapus tag amount (54) jika sudah ada (QRIS statis bisa tidak punya)
      const tag53Index = qris.indexOf('5303');
      if (tag53Index !== -1) {
        const afterTag53 = qris.substring(tag53Index);
        const tag54Match = afterTag53.match(/^5303\d{3}54(\d{2})([\d.]+)/);
        if (tag54Match) {
          const tag54Full = '54' + tag54Match[1] + tag54Match[2];
          qris = qris.replace(tag54Full, '');
        }
      }

      // Buat tag amount baru (54)
      const amountStr = amount.toFixed(2);
      const amountTag = `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`;

      // Sisipkan setelah tag 53 (currency, selalu 7 karakter: 5303XXX)
      const tag53Match = qris.match(/5303\d{3}/);
      if (!tag53Match || tag53Match.index === undefined) return qrisContent;

      const insertAt = tag53Match.index + tag53Match[0].length;
      qris = qris.substring(0, insertAt) + amountTag + qris.substring(insertAt);

      // Tambah CRC baru
      qris = qris + '6304';
      qris = qris + calculateCRC16(qris);

      return qris;
    } catch {
      return qrisContent;
    }
  },

  parse(qrisContent: string): { merchantName?: string; merchantCity?: string } {
    try {
      const info: { merchantName?: string; merchantCity?: string } = {};

      const nameMatch = qrisContent.match(/59(\d{2})/);
      if (nameMatch) {
        const len = parseInt(nameMatch[1]);
        const start = qrisContent.indexOf(nameMatch[0]) + 4;
        info.merchantName = qrisContent.substring(start, start + len);
      }

      const cityMatch = qrisContent.match(/60(\d{2})/);
      if (cityMatch) {
        const len = parseInt(cityMatch[1]);
        const start = qrisContent.indexOf(cityMatch[0]) + 4;
        info.merchantCity = qrisContent.substring(start, start + len);
      }

      return info;
    } catch {
      return {};
    }
  },
};

function calculateCRC16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}
