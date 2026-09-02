import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import {
  supabase,
  getUserProfile,
  getBranchById,
  type User,
  type Branch,
} from "@/lib/supabase";
import { mmkv, StorageKeys } from "@/lib/mmkvStorage";
import { offlineCache } from "@/lib/offlineCache";

// Key yang Supabase gunakan untuk menyimpan session di AsyncStorage
const SUPABASE_SESSION_KEY = "sb-sxfegaptlzbdsjrtwxjb-auth-token";

// Baca raw session dari AsyncStorage tanpa triggering network refresh.
// Supabase v2 menyimpan session object langsung via JSON.stringify.
const getRawStoredSession = async (): Promise<Session | null> => {
  try {
    const raw = await AsyncStorage.getItem(SUPABASE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    // Validasi minimal: harus punya access_token
    if (!parsed.access_token) return null;
    return parsed as Session;
  } catch {
    return null;
  }
};

// Lazy import untuk hindari circular dependency — dipanggil saat logout saja
const resetSessionStores = () => {
  const { usePosStore } = require("./posStore");
  const { useProductStore } = require("./productStore");
  usePosStore.getState().clearCart();
  useProductStore.getState().setSearchQuery("");
  useProductStore.getState().setSelectedCategory(null);
};

interface AuthState {
  user: User | null;
  session: Session | null;
  currentBranch: Branch | null;
  isLoading: boolean;
  isInitialized: boolean;
  isOfflineMode: boolean;
  lastSyncAt: number;
  error: string | null;

  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchBranch: (branch: Branch) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

const trackedSet = (outerSet: any) => (partial: any) => {
  const before = useAuthStore.getState();
  outerSet(partial);
  const after = useAuthStore.getState();
  const changed: string[] = [];
  for (const key of [
    "user",
    "session",
    "isOfflineMode",
    "isInitialized",
    "isAuthenticated",
  ] as const) {
    if (key === "isAuthenticated") continue;
    if ((before as any)[key] !== (after as any)[key]) {
      changed.push(
        `${key}: ${JSON.stringify((before as any)[key])?.slice(0, 30)} → ${JSON.stringify((after as any)[key])?.slice(0, 30)}`,
      );
    }
  }
  if (changed.length) console.log("[AUTH STATE]", changed.join(" | "));
};

export const useAuthStore = create<AuthState>((rawSet, get) => {
  const set = trackedSet(rawSet);
  return {
    user: null,
    session: null,
    currentBranch: null,
    isLoading: false,
    isInitialized: false,
    isOfflineMode: false,
    lastSyncAt: 0,
    error: null,

    initialize: async () => {
      const fallbackToCache = async (session: Session | null) => {
        const cachedUser = await offlineCache.getUser();
        const cachedBranch = await offlineCache.getBranch();
        if (cachedUser && cachedBranch) {
          // Gunakan session yang sudah ada di store jika ada (bisa di-set oleh listener SIGNED_IN)
          // agar isAuthenticated = (!!session || isOfflineMode) && !!user tetap true
          const existingSession = useAuthStore.getState().session;
          useAuthStore.setState({
            user: cachedUser,
            session: session ?? existingSession ?? null,
            currentBranch: cachedBranch,
            isOfflineMode: true,
            isInitialized: true,
            isLoading: false,
          });
          const check = useAuthStore.getState();
          console.log(
            "[AUTH] setelah fallbackToCache setState — user:",
            check.user?.email,
            "| isOfflineMode:",
            check.isOfflineMode,
            "| session:",
            check.session ? "ada" : "null",
            "| isInitialized:",
            check.isInitialized,
          );
          return true;
        }
        return false;
      };

      set({ isLoading: true, error: null });

      // Langkah 1: baca raw session dari AsyncStorage tanpa network call.
      const rawSession = await getRawStoredSession();
      console.log(
        "[AUTH] rawSession dari AsyncStorage:",
        rawSession ? `ada (expires_at: ${rawSession.expires_at})` : "null",
      );

      const cachedUser = await offlineCache.getUser();
      const cachedBranch = await offlineCache.getBranch();
      console.log(
        "[AUTH] offlineCache user:",
        cachedUser?.email ?? "null",
        "| branch:",
        cachedBranch?.name ?? "null",
      );

      if (!rawSession) {
        console.log(
          "[AUTH] tidak ada rawSession, fallback ke cache atau login",
        );
        const fell = await fallbackToCache(null);
        if (!fell) set({ isInitialized: true, isLoading: false });
        return;
      }

      // Langkah 2: ada raw session. Coba fetch profile dari server dengan timeout ketat.
      try {
        const networkTimeout = <T>(ms: number): Promise<T> =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("network_timeout")), ms),
          );

        console.log(
          "[AUTH] memanggil supabase.auth.getSession() dengan timeout 5s...",
        );
        const {
          data: { session },
        } = await Promise.race([
          supabase.auth.getSession(),
          networkTimeout<Awaited<ReturnType<typeof supabase.auth.getSession>>>(
            5000,
          ),
        ]);
        console.log(
          "[AUTH] getSession selesai, session:",
          session ? "ada" : "null",
        );

        if (!session) {
          console.log(
            "[AUTH] session null setelah getSession, fallback ke cache",
          );
          const fell = await fallbackToCache(null);
          if (!fell) set({ isInitialized: true, isLoading: false });
          return;
        }

        console.log("[AUTH] memanggil getUserProfile() dengan timeout 5s...");
        const userProfile = await Promise.race([
          getUserProfile(session.user.id),
          networkTimeout<Awaited<ReturnType<typeof getUserProfile>>>(5000),
        ]);
        console.log(
          "[AUTH] getUserProfile selesai:",
          userProfile?.email ?? "null",
        );

        if (!userProfile.is_active) {
          await supabase.auth.signOut();
          set({
            user: null,
            session: null,
            currentBranch: null,
            isInitialized: true,
            isLoading: false,
            error: "Akun tidak aktif, hubungi pemilik toko",
          });
          return;
        }

        let currentBranch: Branch | null = null;

        if (userProfile.role === "owner") {
          const savedBranchId = await mmkv.getString(
            StorageKeys.CURRENT_BRANCH,
          );
          if (savedBranchId) {
            try {
              currentBranch = await getBranchById(savedBranchId);
            } catch {
              await mmkv.delete(StorageKeys.CURRENT_BRANCH);
            }
          }
        } else {
          if (userProfile.branch) {
            currentBranch = userProfile.branch;
          }
        }

        set({
          user: userProfile,
          session,
          currentBranch,
          isOfflineMode: false,
          isInitialized: true,
          isLoading: false,
        });

        await mmkv.setObject(StorageKeys.CURRENT_USER, userProfile);

        if (currentBranch) {
          await offlineCache.saveSession(userProfile, currentBranch);
        }
      } catch (err: any) {
        // Network error, timeout, atau getSession hang — langsung fallback ke cache
        console.log("[AUTH] catch di initialize:", err?.message ?? err);
        const fell = await fallbackToCache(null);
        console.log("[AUTH] fallbackToCache result:", fell);
        if (!fell) set({ isInitialized: true, isLoading: false });
      }
    },

    login: async (email: string, password: string) => {
      try {
        set({ isLoading: true, error: null });

        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });

        if (signInError) throw signInError;
        if (!data.session) throw new Error("No session returned");

        const userProfile = await getUserProfile(data.session.user.id);
        console.log("[login] userProfile:", JSON.stringify(userProfile));

        if (!userProfile.is_active) {
          await supabase.auth.signOut();
          throw new Error("Akun tidak aktif, hubungi pemilik toko");
        }

        let currentBranch: Branch | null = null;
        if (userProfile.role !== "owner") {
          currentBranch = userProfile.branch || null;
        }
        console.log("[login] currentBranch:", JSON.stringify(currentBranch));

        await mmkv.setObject(StorageKeys.CURRENT_USER, userProfile);
        if (currentBranch) {
          await mmkv.setString(StorageKeys.CURRENT_BRANCH, currentBranch.id);
          await offlineCache.saveSession(userProfile, currentBranch);
          console.log(
            "[AUTH] login: offlineCache.saveSession dipanggil untuk",
            userProfile.email,
          );
        } else {
          console.log(
            "[AUTH] login: currentBranch null, saveSession TIDAK dipanggil untuk",
            userProfile.email,
            "role:",
            userProfile.role,
          );
        }

        set({
          user: userProfile,
          session: data.session,
          currentBranch,
          isOfflineMode: false,
          isLoading: false,
        });
      } catch (error: any) {
        let errorMessage = "Gagal masuk";
        if (error.message?.includes("Invalid login credentials")) {
          errorMessage = "Email atau password salah";
        } else if (error.message?.includes("Email not confirmed")) {
          errorMessage = "Email belum dikonfirmasi";
        } else if (error.message?.includes("network")) {
          errorMessage = "Tidak ada koneksi internet";
        } else if (error.message) {
          errorMessage = error.message;
        }
        set({ error: errorMessage, isLoading: false });
        throw new Error(errorMessage);
      }
    },

    logout: async () => {
      try {
        set({ isLoading: true, error: null });
        resetSessionStores();
        await supabase.auth.signOut();
        await mmkv.delete(StorageKeys.CURRENT_USER);
        await mmkv.delete(StorageKeys.CURRENT_BRANCH);
        await offlineCache.clearSession();
        set({
          user: null,
          session: null,
          currentBranch: null,
          isOfflineMode: false,
          isLoading: false,
        });
      } catch (error: any) {
        set({ error: error.message || "Gagal keluar", isLoading: false });
        set({
          user: null,
          session: null,
          currentBranch: null,
          isOfflineMode: false,
        });
      }
    },

    switchBranch: async (branch: Branch) => {
      const { user } = get();
      if (user?.role !== "owner") return;
      await mmkv.setString(StorageKeys.CURRENT_BRANCH, branch.id);
      set({ currentBranch: branch });
    },

    changePassword: async (newPassword: string) => {
      try {
        set({ isLoading: true, error: null });
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (error) throw error;
        set({ isLoading: false });
      } catch (error: any) {
        set({
          error: error.message || "Gagal mengubah password",
          isLoading: false,
        });
        throw error;
      }
    },

    refreshUser: async () => {
      try {
        const { user } = get();
        if (!user) return;

        const userProfile = await getUserProfile(user.id);
        if (!userProfile.is_active) {
          await get().logout();
          return;
        }

        let currentBranch = get().currentBranch;
        if (userProfile.role !== "owner" && userProfile.branch) {
          currentBranch = userProfile.branch;
        }

        await mmkv.setObject(StorageKeys.CURRENT_USER, userProfile);
        set({ user: userProfile, currentBranch });
      } catch (error: any) {
        set({ error: error.message || "Gagal memperbarui data pengguna" });
      }
    },

    clearError: () => set({ error: null }),
  };
});

// Supabase kadang emit SIGNED_OUT lalu langsung SIGNED_IN saat token rotation.
// Tunda clear state 500ms — kalau SIGNED_IN datang sebelum timer, batalkan.
let signedOutTimer: ReturnType<typeof setTimeout> | null = null;

supabase.auth.onAuthStateChange(async (event, session) => {
  const state = useAuthStore.getState();
  console.log(
    "[AUTH] onAuthStateChange:",
    event,
    "| isOfflineMode:",
    state.isOfflineMode,
    "| isInitialized:",
    state.isInitialized,
  );

  if (
    event === "SIGNED_IN" ||
    event === "TOKEN_REFRESHED" ||
    event === "INITIAL_SESSION"
  ) {
    // Batalkan pending SIGNED_OUT kalau ada — ini token rotation bukan logout
    if (signedOutTimer) {
      clearTimeout(signedOutTimer);
      signedOutTimer = null;
      console.log("[AUTH] pending SIGNED_OUT dibatalkan karena ada", event);
    }
    if (session) {
      useAuthStore.setState({ session });
    }
    return;
  }

  if (event === "SIGNED_OUT") {
    if (state.isOfflineMode) {
      console.log("[AUTH] SIGNED_OUT diabaikan (offline mode)");
      return;
    }
    if (!state.isInitialized) {
      console.log("[AUTH] SIGNED_OUT diabaikan (belum init)");
      return;
    }

    // Tunda 500ms — kalau token rotation, SIGNED_IN akan datang dan batalkan ini
    console.log("[AUTH] SIGNED_OUT: menunggu 500ms sebelum clear state...");
    signedOutTimer = setTimeout(async () => {
      signedOutTimer = null;
      console.log(
        "[AUTH] SIGNED_OUT: clear state (tidak ada SIGNED_IN berikutnya)",
      );
      useAuthStore.setState({
        user: null,
        session: null,
        currentBranch: null,
        isOfflineMode: false,
      });
      await mmkv.delete(StorageKeys.CURRENT_USER);
      await mmkv.delete(StorageKeys.CURRENT_BRANCH);
      await offlineCache.clearSession();
    }, 500);
  }
});

export default useAuthStore;
