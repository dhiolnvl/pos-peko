import { supabase } from './supabase';

export interface MasterProductIpos {
  barcode: string;
  nama_item: string;
  merek: string | null;
  satuan: string | null;
}

// Fallback ketiga setelah produk lokal & OpenFoodFacts tidak ketemu
export async function fetchMasterProductIpos(barcode: string): Promise<MasterProductIpos | null> {
  const { data, error } = await supabase
    .from('master_products_ipos')
    .select('barcode, nama_item, merek, satuan')
    .eq('barcode', barcode)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
