# Sistem Autentikasi PekoPetshop

Dokumentasi lengkap untuk sistem autentikasi dengan role-based navigation.

## ✅ Yang Sudah Dibuat

### 1. **Supabase Migration** ✅
- `supabase/migrations/002_auth_trigger.sql`
- Trigger otomatis membuat user di `public.users` saat auth.users dibuat
- Sync email changes
- Soft delete handling

### 2. **MMKV Storage Adapter** ✅
- `lib/mmkvStorage.ts`
- Custom storage adapter untuk Supabase auth
- Persistent session storage dengan MMKV
- Helper functions untuk storage operations

### 3. **Permissions System** ✅
- `lib/permissions.ts`
- Permission matrix untuk 3 roles (owner, back_office, cashier)
- Helper functions: `canAccess()`, `isOwner()`, `isBackOffice()`, `isCashier()`
- Role validation dan display names

### 4. **Supabase Client** ✅
- `lib/supabase.ts`
- Configured dengan MMKV storage
- Helper functions: `signIn()`, `signOut()`, `getUserProfile()`, `getActiveBranches()`
- Type definitions untuk Branch, User, UserWithBranch

### 5. **Auth Store (Zustand)** ✅
- `store/authStore.ts`
- State management dengan persist ke MMKV
- Actions: `initialize()`, `login()`, `logout()`, `switchBranch()`, `changePassword()`
- Auto refresh session handling

### 6. **useAuth Hook** ✅
- `hooks/useAuth.ts`
- Convenient hook untuk akses auth state
- Computed properties: `isAuthenticated`, `isOwner`, `isBackOffice`, `isCashier`
- Helper: `canAccess(feature)`

### 7. **RoleGuard Component** ✅
- `components/auth/RoleGuard.tsx`
- Protect content based on permissions
- Props: `feature`, `children`, `fallback`, `hideOnDenied`

### 8. **Login Screen** ✅
- `app/(auth)/login.tsx`
- Email + Password dengan validation
- Error handling yang spesifik
- Loading states
- Auto redirect setelah login

---

## 🔨 Yang Perlu Dibuat

### 1. **Screen: Select Branch** (Owner Only)
File: `app/(auth)/select-branch.tsx`

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { getActiveBranches, type Branch } from '@/lib/supabase';

export default function SelectBranchScreen() {
  const { user, switchBranch } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      const data = await getActiveBranches();
      setBranches(data);
    } catch (error) {
      console.error('Failed to load branches:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectBranch = (branch: Branch) => {
    switchBranch(branch);
    router.replace('/(owner)/dashboard');
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
        Pilih Cabang
      </Text>
      <FlatList
        data={branches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{
              backgroundColor: '#fff',
              padding: 16,
              borderRadius: 8,
              marginBottom: 12,
            }}
            onPress={() => handleSelectBranch(item)}
          >
            <Text style={{ fontSize: 18, fontWeight: '600' }}>{item.name}</Text>
            <Text style={{ color: '#666', marginTop: 4 }}>{item.address}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
```

### 2. **Root Layout** dengan Redirect Logic
File: `app/_layout.tsx`

```tsx
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

export default function RootLayout() {
  const { initialize, isInitialized, isAuthenticated, user, currentBranch } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Initialize auth on app start
  useEffect(() => {
    initialize();
  }, []);

  // Handle redirects
  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated) {
      // Redirect to login if not authenticated
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (user) {
      // User is authenticated
      if (user.role === 'owner' && !currentBranch) {
        // Owner needs to select branch
        router.replace('/(auth)/select-branch');
      } else if (inAuthGroup) {
        // Already authenticated, redirect to appropriate dashboard
        if (user.role === 'owner') {
          router.replace('/(owner)/dashboard');
        } else if (user.role === 'back_office') {
          router.replace('/(backoffice)/dashboard');
        } else if (user.role === 'cashier') {
          router.replace('/(cashier)/pos');
        }
      }
    }
  }, [isInitialized, isAuthenticated, user, currentBranch, segments]);

  if (!isInitialized) {
    // Show splash screen
    return null; // atau <SplashScreen />
  }

  return <Slot />;
}
```

### 3. **Auth Layout**
File: `app/(auth)/_layout.tsx`

```tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="select-branch" />
    </Stack>
  );
}
```

### 4. **Owner Dashboard** (Placeholder)
File: `app/(owner)/dashboard.tsx`

```tsx
import { View, Text } from 'react-native';
import { useAuth } from '@/hooks/useAuth';

export default function OwnerDashboard() {
  const { user, currentBranch } = useAuth();

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>
        Owner Dashboard
      </Text>
      <Text style={{ marginTop: 10 }}>
        Cabang: {currentBranch?.name || 'Semua Cabang'}
      </Text>
    </View>
  );
}
```

### 5. **Owner Tab Layout**
File: `app/(owner)/_layout.tsx`

```tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function OwnerLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Laporan',
          tabBarIcon: ({ color }) => <Ionicons name="stats-chart" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="manage"
        options={{
          title: 'Kelola',
          tabBarIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

### 6. **Back Office Dashboard** (Placeholder)
File: `app/(backoffice)/dashboard.tsx`

```tsx
import { View, Text } from 'react-native';
import { useAuth } from '@/hooks/useAuth';

export default function BackOfficeDashboard() {
  const { user, currentBranch } = useAuth();

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>
        Back Office Dashboard
      </Text>
      <Text style={{ marginTop: 10 }}>
        Cabang: {currentBranch?.name}
      </Text>
    </View>
  );
}
```

### 7. **Back Office Tab Layout**
File: `app/(backoffice)/_layout.tsx`

```tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function BackOfficeLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Produk',
          tabBarIcon: ({ color }) => <Ionicons name="cube" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Stok',
          tabBarIcon: ({ color}} => <Ionicons name="layers" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Laporan',
          tabBarIcon: ({ color }) => <Ionicons name="stats-chart" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

### 8. **Cashier POS** (Placeholder)
File: `app/(cashier)/pos.tsx`

```tsx
import { View, Text } from 'react-native';
import { useAuth } from '@/hooks/useAuth';

export default function CashierPOS() {
  const { user, currentBranch } = useAuth();

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>
        Kasir POS
      </Text>
      <Text style={{ marginTop: 10 }}>
        Cabang: {currentBranch?.name}
      </Text>
    </View>
  );
}
```

### 9. **Cashier Tab Layout**
File: `app/(cashier)/_layout.tsx`

```tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function CashierLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="pos"
        options={{
          title: 'Kasir',
          tabBarIcon: ({ color }) => <Ionicons name="calculator" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Riwayat',
          tabBarIcon: ({ color }) => <Ionicons name="time" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

### 10. **Supabase Edge Function** - Create User
File: `supabase/functions/create-user/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from request (to verify they're owner)
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is owner
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userProfile?.role !== 'owner') {
      throw new Error('Only owner can create users');
    }

    // Get request body
    const { email, password, name, role, branch_id } = await req.json();

    // Validate input
    if (!email || !password || !name || !role || !branch_id) {
      throw new Error('Missing required fields');
    }

    // Create user in auth.users
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        name,
        role,
        branch_id,
      },
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        user_id: data.user.id,
        email: data.user.email,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
```

---

## 📋 Checklist Implementasi

- [x] Supabase migration dengan auth trigger
- [x] MMKV storage adapter
- [x] Permissions system
- [x] Supabase client dengan custom storage
- [x] Auth Store (Zustand)
- [x] useAuth hook
- [x] RoleGuard component
- [x] Login screen
- [ ] Select Branch screen
- [ ] Root layout dengan redirect logic
- [ ] Auth layout
- [ ] Owner dashboard + tab layout
- [ ] Back Office dashboard + tab layout
- [ ] Cashier POS + tab layout
- [ ] Supabase Edge Function untuk create user

---

## 🚀 Cara Testing

### 1. Setup Supabase
```bash
# Jalankan migration di Supabase Dashboard
1. Buka SQL Editor
2. Paste isi file supabase/migrations/001_initial_schema.sql
3. Run
4. Paste isi file supabase/migrations/002_auth_trigger.sql
5. Run
```

### 2. Buat User Owner Manual
```sql
-- Di Supabase Dashboard > Authentication > Users
-- Add manual user dengan email & password

-- Lalu tambahkan ke public.users via SQL Editor:
INSERT INTO public.users (id, email, name, role, is_active)
VALUES (
  'USER-ID-DARI-AUTH-USERS',
  'owner@pekopetshop.com',
  'Owner',
  'owner',
  true
);
```

### 3. Buat Cabang
```sql
INSERT INTO branches (name, address, phone, is_active)
VALUES ('Cabang Pusat', 'Jl. Contoh No. 123', '081234567890', true);
```

### 4. Test Login
- Buka app
- Login dengan email & password owner
- Pilih cabang
- Masuk ke owner dashboard

---

## 🔒 Security Checklist

- [x] Session disimpan dengan enkripsi (MMKV)
- [x] Password tidak pernah disimpan di local storage
- [x] RLS policies active di semua tabel
- [x] Role validation di client dan server
- [x] No public registration - owner only create accounts
- [ ] Supabase Service Role Key tidak exposed di client
- [ ] Edge function untuk create user menggunakan service role

---

## 📝 Notes

1. **Offline Session**: Session bisa bertahan offline selama token belum expired (default 1 jam, refresh token lebih lama)

2. **Branch Selection**: Owner harus pilih cabang setiap kali login. Pilihan disimpan di MMKV tapi tidak persist di database.

3. **Account Creation**: Hanya Owner yang bisa buat akun baru via Edge Function (akan diimplementasikan di fase manajemen user)

4. **Password Reset**: Tidak ada fitur "Lupa Password" di login screen. Owner yang reset password user lain.

5. **Email Confirmation**: Di-disable karena akun dibuat owner, bukan self-register.
