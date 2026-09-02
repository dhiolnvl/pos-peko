import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TransferSettings {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_active: boolean;
}

const CACHE_KEY = 'qasio_transfer_settings';

export const transferService = {
  async getActive(): Promise<TransferSettings | null> {
    try {
      const { data, error } = await supabase
        .from('transfer_settings')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
        return data as TransferSettings;
      }
    } catch {}

    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw) as TransferSettings;
    } catch {}

    return null;
  },

  async save(settings: { bank_name: string; account_number: string; account_name: string }): Promise<void> {
    await supabase.from('transfer_settings').update({ is_active: false }).eq('is_active', true);

    const { error } = await supabase.from('transfer_settings').insert({
      bank_name: settings.bank_name,
      account_number: settings.account_number,
      account_name: settings.account_name,
      is_active: true,
    });
    if (error) throw new Error(error.message);

    await AsyncStorage.removeItem(CACHE_KEY);
  },

  async delete(): Promise<void> {
    await supabase.from('transfer_settings').update({ is_active: false }).eq('is_active', true);
    await AsyncStorage.removeItem(CACHE_KEY);
  },
};
