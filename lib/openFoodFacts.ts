import { supabase } from './supabase';

export type NutrientLevel = 'low' | 'moderate' | 'high' | null;

export interface OFFProduct {
  barcode: string;
  name: string;
  brands: string | null;
  image_url: string | null;
  ingredients_text: string | null;
  product_quantity: number | null;
  product_quantity_unit: string | null;
  serving_size: string | null;
  nutriscore_grade: string | null;
  nova_group: number | null;
  allergens: string | null;
  off_categories: string | null;
  energy_kcal_100g: number | null;
  carbohydrates_100g: number | null;
  fat_100g: number | null;
  saturated_fat_100g: number | null;
  sugars_100g: number | null;
  proteins_100g: number | null;
  salt_100g: number | null;
  nutrient_levels: {
    fat: NutrientLevel;
    saturated_fat: NutrientLevel;
    sugars: NutrientLevel;
    salt: NutrientLevel;
  } | null;
}

export async function fetchOFFProduct(barcode: string): Promise<OFFProduct | null> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { headers: { 'User-Agent': 'QasioPOS/1.0' } }
    );
    if (!response.ok) return null;
    const json = await response.json();
    if (json.status !== 1 || !json.product) return null;

    const p = json.product;
    const n = p.nutriments ?? {};

    return {
      barcode,
      name: p.product_name_id || p.product_name_en || p.product_name || '',
      brands: p.brands || null,
      image_url: p.image_front_url || p.image_url || null,
      ingredients_text: p.ingredients_text_id || p.ingredients_text_en || p.ingredients_text || null,
      product_quantity: p.product_quantity != null ? parseFloat(p.product_quantity) || null : null,
      product_quantity_unit: p.product_quantity_unit || null,
      serving_size: p.serving_size || null,
      nutriscore_grade: p.nutriscore_grade || null,
      nova_group: p.nova_group != null ? parseInt(p.nova_group) || null : null,
      allergens: p.allergens || null,
      off_categories: p.categories || null,
      energy_kcal_100g: n['energy-kcal_100g'] ?? null,
      carbohydrates_100g: n.carbohydrates_100g ?? null,
      fat_100g: n.fat_100g ?? null,
      saturated_fat_100g: n['saturated-fat_100g'] ?? null,
      sugars_100g: n.sugars_100g ?? null,
      proteins_100g: n.proteins_100g ?? null,
      salt_100g: n.salt_100g ?? null,
      nutrient_levels: p.nutrient_levels ? {
        fat: (p.nutrient_levels.fat as NutrientLevel) ?? null,
        saturated_fat: (p.nutrient_levels['saturated-fat'] as NutrientLevel) ?? null,
        sugars: (p.nutrient_levels.sugars as NutrientLevel) ?? null,
        salt: (p.nutrient_levels.salt as NutrientLevel) ?? null,
      } : null,
    };
  } catch {
    return null;
  }
}

// Download gambar dari URL lalu upload ke Supabase Storage, return public URL
export async function uploadOFFImageToStorage(imageUrl: string, barcode: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    const ext = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
    const path = `products/off_${barcode}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });

    if (error) return null;

    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
}
