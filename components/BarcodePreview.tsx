import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Code128B character set (space=0x20 to DEL=0x7E)
const CODE128B_VALUES: Record<string, number> = {};
for (let i = 0x20; i <= 0x7e; i++) {
  CODE128B_VALUES[String.fromCharCode(i)] = i - 0x20;
}

// Code128 bar patterns — each entry is 6 modules (3 bars + 3 spaces alternating, B-S-B-S-B-S)
// Index 0..102 are data/control codes, 103=START_B, 106=STOP
const PATTERNS: number[][] = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
  [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
  [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
  [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
  [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
  [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
  [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
  [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
  [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
  [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
  [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
  [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
  [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
  [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
  [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
  [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
  [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
  [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
  [2,1,1,2,3,2],[2,3,3,1,1,1],[1,1,2,1,4,2],
  // index 103 = START B
  [2,1,1,4,1,2],
  // index 104 = START C (not used)
  [2,1,1,2,1,4],
  // index 105 = CODE C (not used)
  [2,1,1,2,3,2],
  // index 106 = STOP
  [2,3,3,1,1,1,2],
];

const START_B = 104; // actual pattern index for START B
const STOP    = 106; // actual pattern index for STOP

function encodeCode128B(text: string): boolean[] | null {
  const bars: boolean[] = [];

  const pushPattern = (idx: number) => {
    const pat = PATTERNS[idx];
    if (!pat) return;
    let dark = true; // starts with bar (dark)
    for (const w of pat) {
      for (let i = 0; i < w; i++) bars.push(dark);
      dark = !dark;
    }
  };

  // Quiet zone (10 modules)
  for (let i = 0; i < 10; i++) bars.push(false);

  // START B (code 104)
  pushPattern(START_B);

  let checksum = 104; // START B value
  for (let pos = 0; pos < text.length; pos++) {
    const val = CODE128B_VALUES[text[pos]];
    if (val === undefined) return null; // unencodable character
    checksum += val * (pos + 1);
    pushPattern(val);
  }

  // Check symbol
  pushPattern(checksum % 103);

  // STOP
  pushPattern(STOP);

  // Quiet zone
  for (let i = 0; i < 10; i++) bars.push(false);

  return bars;
}

interface Props {
  value: string;
  height?: number;
  showText?: boolean;
}

export function BarcodePreview({ value, height = 64, showText = true }: Props) {
  const [containerWidth, setContainerWidth] = useState(0);
  const bars = useMemo(() => (value ? encodeCode128B(value) : null), [value]);

  if (!value) return null;

  if (!bars) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>Barcode tidak valid (karakter tidak didukung)</Text>
      </View>
    );
  }

  // containerWidth sudah dikurangi padding (32px = 16px * 2)
  const usableWidth = Math.max(0, containerWidth - 32);
  const moduleWidth = usableWidth > 0
    ? Math.max(1, Math.floor(usableWidth / bars.length))
    : 1;
  const totalWidth = bars.length * moduleWidth;

  return (
    <View
      style={styles.wrapper}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {containerWidth > 0 && (
        <View style={[styles.barsRow, { height, width: totalWidth }]}>
          {bars.map((dark, i) => (
            <View
              key={i}
              style={{
                width: moduleWidth,
                height,
                backgroundColor: dark ? '#000' : '#fff',
              }}
            />
          ))}
        </View>
      )}
      {showText && (
        <Text style={styles.barcodeText}>{value}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  barcodeText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 2,
  },
  errorBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: { fontSize: 12, color: '#DC2626' },
});
