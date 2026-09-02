# PekoPetshop - POS Petshop Multi-Cabang

Aplikasi kasir untuk petshop multi-cabang dengan fitur offline-first menggunakan React Native Expo.

## 🚀 Tech Stack

* **Framework**: Expo SDK 54 + React Native
* **Routing**: Expo Router v3 (file-based routing)
* **Language**: TypeScript (strict mode)
* **State Management**: Zustand
* **Local Database**: expo-sqlite (SQLite) untuk offline-first
* **Cloud Sync**: Supabase
* **Storage**: react-native-mmkv untuk persistent storage
* **Styling**: NativeWind v4 (Tailwind CSS)

## 📁 Struktur Folder

```text
qasio-peko/

├── app/                      # Expo Router file-based routing
│   ├── (auth)/              # Auth screens (login, pilih cabang)
│   ├── (owner)/             # Owner tabs
│   ├── (backoffice)/        # Back Office tabs
│   ├── (staff-pusat)/       # Staff Pusat tabs
│   ├── (cashier)/           # Kasir tabs
│   ├── _layout.tsx          # Root layout
│   └── index.tsx            # Entry point
├── components/              # Reusable UI components
├── store/                   # Zustand stores
├── lib/                     # Core libraries
│   ├── supabase.ts          # Supabase client
│   ├── database.ts          # SQLite setup
│   ├── syncEngine.ts        # Sync logic
│   └── permissions.ts       # Permission system
├── hooks/                   # Custom hooks
│   ├── useAuth.ts
│   ├── usePermission.ts
│   └── useNetworkStatus.ts
├── types/                   # TypeScript interfaces
├── constants/               # App constants
│   ├── colors.ts
│   └── config.ts
└── assets/                  # Images, fonts, etc.
```

## 🔐 Permission System

### Roles

* **Owner**: Full access ke semua fitur semua cabang
* **Staff Pusat**: Mengelola produk, stok gudang pusat, purchase order, dan distribusi stok ke cabang
* **Back Office**: Kelola produk, stok, dan laporan untuk cabang tertentu
* **Cashier**: Hanya akses kasir untuk transaksi penjualan

## 🛠️ Setup

### Prerequisites

* Node.js 18+
* npm atau yarn
* Expo CLI
* Supabase account

### Installation

1. Clone repository

```bash
cd qasio-peko
```

2. Install dependencies

```bash
npm install
```

3. Setup environment variables

```bash
cp .env.example .env
```

Edit `.env` dan isi dengan Supabase credentials:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

4. Run development server

```bash
npm start
```

## 🗄️ Database

### Local Database (SQLite)

SQLite digunakan untuk offline-first storage. Semua data transaksi dan produk disimpan secara lokal.

**Tables**:

* branches
* users
* categories
* products
* transactions
* transaction_items
* stock_movements
* purchase_orders
* purchase_order_items
* sync_queue

### Cloud Database (Supabase)

Supabase digunakan untuk cloud sync dan backup data. Sync dilakukan otomatis menggunakan sync engine.

## 🔄 Sync Strategy

* **Offline-first**: Semua operasi dilakukan di SQLite lokal terlebih dahulu
* **Background sync**: Data di-sync ke Supabase di background
* **Conflict resolution**: Last-write-wins strategy
* **Sync queue**: Perubahan yang belum ter-sync disimpan di `sync_queue` table

## 📱 Screens by Role

### Owner

* Dashboard (konsolidasi semua cabang)
* Reports (laporan konsolidasi)
* Branches (kelola cabang)
* Settings (pengaturan global)

### Staff Pusat

* Dashboard (overview gudang pusat)
* Products (kelola produk)
* Stock (kelola stok gudang pusat)
* Purchase Order
* Stock Transfer / Distribusi ke cabang
* Reports

### Back Office

* Dashboard (overview cabang)
* Products (kelola produk)
* Stock (kelola stok & PO)
* Reports (laporan cabang)

### Cashier

* Kasir/POS (transaksi penjualan)
* History (riwayat transaksi)

## 🎨 Styling

Menggunakan NativeWind v4 (Tailwind CSS for React Native).

**Primary Color**: Pink (#FF6B9D) - sesuai tema petshop

**Secondary Color**: Gray (#4A5568)

## 📝 License

MIT

## 👨‍💻 Author

PekoPetshop Team
