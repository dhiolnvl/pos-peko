import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  maxLength?: number;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];

export function NumpadInput({ value, onChange, prefix = 'Rp', maxLength = 12 }: Props) {
  const handleKey = (key: string) => {
    if (key === '⌫') {
      onChange(value.length <= 1 ? '0' : value.slice(0, -1));
      return;
    }
    const raw = value === '0' ? key : value + key;
    if (raw.length > maxLength) return;
    onChange(raw);
  };

  const display = parseInt(value || '0', 10).toLocaleString('id-ID');

  return (
    <View style={styles.container}>
      <View style={styles.display}>
        <Text style={styles.prefix}>{prefix}</Text>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {display}
        </Text>
      </View>

      <View style={styles.grid}>
        {KEYS.map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.key, key === '⌫' && styles.keyDelete]}
            onPress={() => handleKey(key)}
            activeOpacity={0.6}
          >
            <Text style={[styles.keyText, key === '⌫' && styles.keyDeleteText]}>
              {key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },

  display: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#F0F9FA', borderRadius: 14, marginBottom: 16,
    gap: 6,
  },
  prefix: { fontSize: 18, fontWeight: '600', color: '#718096' },
  value: { fontSize: 36, fontWeight: '800', color: '#1A202C', flexShrink: 1 },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  key: {
    width: '30%', flexGrow: 1,
    paddingVertical: 16, borderRadius: 12,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  keyDelete: { backgroundColor: '#FFF5F5', borderColor: '#FED7D7' },
  keyText: { fontSize: 20, fontWeight: '600', color: '#1A202C' },
  keyDeleteText: { fontSize: 22, color: '#E53E3E' },
});
