# CLAUDE.md — Qasio POS

## Aturan Umum

- Jangan pakai emoticon
- Jangan langsung jalankan `eas update` setelah commit — tunggu perintah eksplisit dari user
- Jangan langsung commit — tunggu perintah eksplisit dari user
- Jangan pernah menambah item yang terlihat di bottom tab navigation. Screen baru tetap harus didaftarkan di dalam folder `(role)` dan di `_layout.tsx` menggunakan `tabBarButton: () => null` agar tersembunyi dari tab bar tapi route-nya tetap valid. Jangan pakai `href: null` (terbukti masih menampilkan tab kosong). Akses screen tersebut lewat menu dashboard, bukan tab bar. Jika ada permintaan yang bertentangan dengan aturan ini, tanya dulu sebelum mengubah
- Selalu membuat tampilan 2 versi hp dan tablet landscapes
- Jangan migrate otomatis ke supabase, buat file baru aja nanti saya migrate manuals
- Selalu reusable component agar rapi dibaca
- Kalau buat modal buat selalu mode ditengah kecuali ada permintaan
- Kalau buat form pastikan tidak tertutup keyboard (lihat section Form & Keyboard di bawah)

## Horizontal ScrollView (berlaku untuk semua kasus — stats, filter, chip, dll)

Jangan pakai `style` langsung di `<ScrollView horizontal>` untuk mengontrol tinggi — ScrollView horizontal mengikuti konten, bukan style height.

Selalu bungkus dengan `<View>` wrapper yang diberi `height` eksplisit, lalu `<ScrollView horizontal>` di dalamnya. Aturan ini berlaku untuk **semua** `ScrollView horizontal` tanpa kecuali, bukan hanya tab filter:

```tsx
<View style={{ height: 80, justifyContent: 'center' }}>
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{
      paddingHorizontal: 16,
      gap: 10,
      alignItems: 'center',
    }}
  >
    {/* items */}
  </ScrollView>
</View>
```

Jangan taruh `paddingVertical` di `contentContainerStyle` — akan menambah ruang kosong atas bawah. Gunakan `height` di wrapper `<View>` untuk mengatur tinggi.

## Form & Keyboard

Masalah ini selalu berulang di berbagai layar, terutama di tablet orientasi landscape. Ikuti pattern ini setiap kali membuat form dengan input.

### Struktur wajib

```tsx
<KeyboardAvoidingView
  style={{ flex: 1 }}
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={0}
>
  <ScrollView
    ref={scrollRef}
    contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: insets.bottom + 32 }}
    keyboardShouldPersistTaps="handled"
    keyboardDismissMode="interactive"
    showsVerticalScrollIndicator={false}
  >
    {/* form content */}
  </ScrollView>
</KeyboardAvoidingView>
```

### Aturan

1. **Jangan pakai `justifyContent: 'center'` di `contentContainerStyle`** ScrollView yang berisi form — ini menghalangi scroll saat keyboard muncul. Kalau ingin konten di tengah saat kosong, gunakan `flexGrow: 1` dan bungkus konten dengan `View` yang pakai `justifyContent: 'center'`.

2. **`behavior` harus platform-aware** — iOS pakai `'padding'`, Android pakai `'height'`. Jangan pakai `undefined` untuk Android karena keyboard akan menutupi form.

3. **Field multiline / catatan di bagian bawah** — tambahkan `onFocus` dengan `measureLayout` + `scrollTo` agar field tersebut tidak tertutup keyboard, khususnya di tablet landscape:

```tsx
const scrollRef = useRef<ScrollView>(null);
const notesRef = useRef<View>(null);

// Di JSX:
<View ref={notesRef} style={styles.field}>
  <TextInput
    multiline
    onFocus={() => {
      notesRef.current?.measureLayout(
        scrollRef.current as any,
        (_x, y) => {
          scrollRef.current?.scrollTo({ y: y - 16, animated: true });
        },
        () => {}
      );
    }}
  />
</View>
```

4. **Jangan pakai `ScrollView` tanpa `flexGrow: 1`** di `contentContainerStyle` — konten tidak bisa di-scroll kalau tinggi konten pas-pasan.

## Export / Download PDF

Jangan pakai `Sharing.shareAsync` langsung untuk semua platform — bedakan Android dan iOS:

- **Android**: pakai `StorageAccessFramework` untuk download langsung ke folder Downloads pilihan user
- **iOS**: pakai `Sharing.shareAsync` dengan `dialogTitle: 'Simpan PDF'` — ini memunculkan sheet "Save to Files"

Pattern wajib:

```tsx
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

const { uri } = await Print.printToFileAsync({ html, base64: false });
const fileName = `nama_file_${tanggal}.pdf`;

if (Platform.OS === 'android') {
  const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
    'content://com.android.externalstorage.documents/tree/primary%3ADownload'
  );
  if (!permissions.granted) return;
  const content = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
    permissions.directoryUri, fileName, 'application/pdf'
  );
  await FileSystem.writeAsStringAsync(destUri, content, { encoding: 'base64' });
  Alert.alert('Berhasil', `PDF tersimpan:\n${fileName}`);
} else {
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Simpan PDF' });
}
```

Jangan hanya pakai `Sharing.isAvailableAsync()` sebagai kondisi — itu tidak membedakan intent download vs share.
