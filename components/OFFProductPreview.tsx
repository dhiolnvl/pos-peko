import React, { useState } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { OFFProduct, NutrientLevel } from '@/lib/openFoodFacts';

interface Props {
  product: OFFProduct;
  onConfirm: (chosenName: string) => void;
  onEdit: () => void;
  isUploading?: boolean;
}

function buildAlternativeName(product: OFFProduct): string | null {
  const parts: string[] = [];
  if (product.brands) parts.push(product.brands.split(',')[0].trim());
  if (product.name) parts.push(product.name.trim());
  if (product.product_quantity != null) {
    parts.push(`${product.product_quantity}${product.product_quantity_unit ?? ''}`);
  }
  const alt = parts.join(' ').trim();
  // Hanya tawarkan alternatif kalau berbeda dari nama asli dan nama aslinya pendek (≤ 2 kata)
  const wordCount = (product.name ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (wordCount <= 2 && alt !== product.name.trim() && alt.length > product.name.trim().length) {
    return alt;
  }
  return null;
}

const NUTRISCORE_COLOR: Record<string, string> = {
  a: '#1E8A3E', b: '#56A83C', c: '#E8C518', d: '#E37518', e: '#D62B2B',
};

const NOVA_COLOR: Record<number, string> = {
  1: '#1E8A3E', 2: '#56A83C', 3: '#E8C518', 4: '#D62B2B',
};

const NOVA_LABEL: Record<number, string> = {
  1: 'Tidak diproses', 2: 'Diproses minimal',
  3: 'Diproses', 4: 'Ultra-diproses',
};

const NUTRIENT_LEVEL_COLOR: Record<string, string> = {
  low: '#1E8A3E',
  moderate: '#E37518',
  high: '#D62B2B',
};

const NUTRIENT_LEVEL_LABEL: Record<string, string> = {
  low: 'Rendah',
  moderate: 'Sedang',
  high: 'Tinggi',
};

function NutrientLevelBadge({ level }: { level: NutrientLevel }) {
  if (!level) return null;
  return (
    <View style={[styles.levelBadge, { backgroundColor: NUTRIENT_LEVEL_COLOR[level] + '22' }]}>
      <View style={[styles.levelDot, { backgroundColor: NUTRIENT_LEVEL_COLOR[level] }]} />
      <Text style={[styles.levelText, { color: NUTRIENT_LEVEL_COLOR[level] }]}>
        {NUTRIENT_LEVEL_LABEL[level]}
      </Text>
    </View>
  );
}

function NutrientRow({
  label, value, unit, level,
}: {
  label: string; value: number | null; unit: string; level?: NutrientLevel;
}) {
  if (value == null) return null;
  return (
    <View style={styles.nutriRow}>
      <Text style={styles.nutriLabel}>{label}</Text>
      <View style={styles.nutriRight}>
        {level ? <NutrientLevelBadge level={level} /> : null}
        <Text style={styles.nutriValue}>{value.toFixed(1)} {unit}</Text>
      </View>
    </View>
  );
}

export function OFFProductPreview({ product, onConfirm, onEdit, isUploading }: Props) {
  const grade = product.nutriscore_grade?.toLowerCase();
  const nova = product.nova_group;
  const nl = product.nutrient_levels;

  const altName = buildAlternativeName(product);
  const [selectedName, setSelectedName] = useState<'original' | 'alt'>('original');
  const chosenName = selectedName === 'alt' && altName ? altName : (product.name || '');

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Gambar */}
      {product.image_url ? (
        <Image source={{ uri: product.image_url }} style={styles.image} resizeMode="contain" />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Ionicons name="image-outline" size={48} color="#CBD5E0" />
        </View>
      )}

      {/* Nama & Merek */}
      <Text style={styles.name}>{chosenName || '—'}</Text>
      {product.brands && <Text style={styles.brand}>{product.brands}</Text>}

      {/* Pilihan nama — hanya tampil kalau ada alternatif */}
      {altName && (
        <View style={styles.namePicker}>
          <Text style={styles.namePickerLabel}>Pilih nama produk:</Text>
          <TouchableOpacity
            style={[styles.nameOption, selectedName === 'original' && styles.nameOptionActive]}
            onPress={() => setSelectedName('original')}
          >
            <View style={styles.nameOptionRadio}>
              {selectedName === 'original'
                ? <View style={styles.nameOptionRadioDot} />
                : null}
            </View>
            <View style={styles.nameOptionBody}>
              <Text style={styles.nameOptionTag}>Nama API</Text>
              <Text style={[styles.nameOptionText, selectedName === 'original' && styles.nameOptionTextActive]} numberOfLines={2}>
                {product.name || '—'}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.nameOption, selectedName === 'alt' && styles.nameOptionActive]}
            onPress={() => setSelectedName('alt')}
          >
            <View style={styles.nameOptionRadio}>
              {selectedName === 'alt'
                ? <View style={styles.nameOptionRadioDot} />
                : null}
            </View>
            <View style={styles.nameOptionBody}>
              <Text style={styles.nameOptionTag}>Nama Lengkap</Text>
              <Text style={[styles.nameOptionText, selectedName === 'alt' && styles.nameOptionTextActive]} numberOfLines={2}>
                {altName}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}
      {product.product_quantity != null && (
        <Text style={styles.quantity}>
          {product.product_quantity} {product.product_quantity_unit ?? ''}
        </Text>
      )}
      {product.serving_size && (
        <Text style={styles.servingSize}>Sajian: {product.serving_size}</Text>
      )}

      {/* Badge Nutriscore & NOVA */}
      <View style={styles.badges}>
        {grade && NUTRISCORE_COLOR[grade] && (
          <View style={[styles.badge, { backgroundColor: NUTRISCORE_COLOR[grade] }]}>
            <Text style={styles.badgeText}>Nutri-Score {grade.toUpperCase()}</Text>
          </View>
        )}
        {nova != null && NOVA_COLOR[nova] && (
          <View style={[styles.badge, { backgroundColor: NOVA_COLOR[nova] }]}>
            <Text style={styles.badgeText}>NOVA {nova}</Text>
          </View>
        )}
      </View>

      {/* Info NOVA */}
      {nova != null && NOVA_LABEL[nova] && (
        <Text style={styles.novaLabel}>{NOVA_LABEL[nova]}</Text>
      )}

      {/* Nutrisi */}
      {(product.energy_kcal_100g != null || product.fat_100g != null) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nutrisi per 100g</Text>
          <NutrientRow label="Energi" value={product.energy_kcal_100g} unit="kkal" />
          <NutrientRow label="Karbohidrat" value={product.carbohydrates_100g} unit="g" />
          <NutrientRow label="Gula" value={product.sugars_100g} unit="g" level={nl?.sugars} />
          <NutrientRow label="Lemak" value={product.fat_100g} unit="g" level={nl?.fat} />
          <NutrientRow label="Lemak jenuh" value={product.saturated_fat_100g} unit="g" level={nl?.saturated_fat} />
          <NutrientRow label="Protein" value={product.proteins_100g} unit="g" />
          <NutrientRow label="Garam" value={product.salt_100g} unit="g" level={nl?.salt} />
        </View>
      )}

      {/* Keterangan level nutrisi */}
      {nl && (
        <View style={styles.legendRow}>
          {(['low', 'moderate', 'high'] as const).map((lvl) => (
            <View key={lvl} style={styles.legendItem}>
              <View style={[styles.levelDot, { backgroundColor: NUTRIENT_LEVEL_COLOR[lvl] }]} />
              <Text style={styles.legendText}>{NUTRIENT_LEVEL_LABEL[lvl]}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Bahan */}
      {product.ingredients_text && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bahan-bahan</Text>
          <Text style={styles.ingredients}>{product.ingredients_text}</Text>
        </View>
      )}

      {/* Alergen */}
      {product.allergens ? (
        <View style={styles.allergenBox}>
          <Ionicons name="warning-outline" size={16} color="#C05621" />
          <Text style={styles.allergenText}>Alergen: {product.allergens}</Text>
        </View>
      ) : null}

      {/* Tombol */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.confirmBtn, isUploading && { opacity: 0.6 }]}
          onPress={() => onConfirm(chosenName)}
          disabled={isUploading}
        >
          <Ionicons name={isUploading ? 'cloud-upload-outline' : 'checkmark-circle-outline'} size={20} color="#fff" />
          <Text style={styles.confirmText}>
            {isUploading ? 'Mengupload gambar...' : 'Pakai Data Ini'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.editBtn} onPress={onEdit} disabled={isUploading}>
          <Ionicons name="create-outline" size={18} color="#347385" />
          <Text style={styles.editText}>Edit Manual</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40, alignItems: 'center' },

  image: { width: 180, height: 180, borderRadius: 12, marginBottom: 12 },
  imagePlaceholder: {
    width: 180, height: 180, borderRadius: 12, backgroundColor: '#F7FAFC',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },

  name: { fontSize: 18, fontWeight: '700', color: '#1A202C', textAlign: 'center', marginBottom: 4 },
  brand: { fontSize: 14, color: '#718096', marginBottom: 4 },
  quantity: { fontSize: 13, color: '#A0AEC0', marginBottom: 2 },
  servingSize: { fontSize: 12, color: '#A0AEC0', marginBottom: 12 },

  badges: { flexDirection: 'row', gap: 8, marginBottom: 6, marginTop: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  novaLabel: { fontSize: 12, color: '#718096', marginBottom: 16 },

  section: { width: '100%', marginTop: 16 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#4A5568', marginBottom: 8,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  nutriRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F0F4F8',
  },
  nutriLabel: { fontSize: 14, color: '#4A5568', flex: 1 },
  nutriRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nutriValue: { fontSize: 14, fontWeight: '600', color: '#1A202C' },

  levelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
  },
  levelDot: { width: 7, height: 7, borderRadius: 4 },
  levelText: { fontSize: 11, fontWeight: '600' },

  legendRow: {
    flexDirection: 'row', gap: 14, marginTop: 10, alignSelf: 'flex-start',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 11, color: '#718096' },

  ingredients: { fontSize: 13, color: '#4A5568', lineHeight: 20 },

  allergenBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFAF0', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: '#FEEBC8', marginTop: 12, width: '100%',
  },
  allergenText: { fontSize: 13, color: '#C05621', flex: 1 },

  namePicker: {
    width: '100%', marginTop: 12, marginBottom: 4, gap: 8,
    backgroundColor: '#F7FAFC', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  namePickerLabel: { fontSize: 12, fontWeight: '700', color: '#4A5568', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  nameOption: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  nameOptionActive: { borderColor: '#347385', backgroundColor: '#EEF8FA' },
  nameOptionRadio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#CBD5E0',
    alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0,
  },
  nameOptionRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#347385' },
  nameOptionBody: { flex: 1, gap: 2 },
  nameOptionTag: { fontSize: 10, fontWeight: '700', color: '#A0AEC0', textTransform: 'uppercase', letterSpacing: 0.4 },
  nameOptionText: { fontSize: 13, fontWeight: '600', color: '#4A5568' },
  nameOptionTextActive: { color: '#1A202C' },

  actions: { marginTop: 16, width: '100%', gap: 10 },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#347385', borderRadius: 12, paddingVertical: 14,
  },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1, borderColor: '#347385', borderRadius: 12, paddingVertical: 12,
  },
  editText: { color: '#347385', fontSize: 14, fontWeight: '600' },
});
