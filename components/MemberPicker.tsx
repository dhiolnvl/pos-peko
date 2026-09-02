import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  Modal,
  ScrollView,
  Keyboard,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/store/authStore";
import {
  searchMembers,
  createMemberInSupabase,
  cacheMembersLocally,
  calcPoints,
  getPointsPerRupiah,
  type Member,
} from "@/lib/memberQueries";

interface Props {
  visible: boolean;
  selected: Member | null;
  total: number;
  onSelect: (member: Member | null) => void;
  onClose: () => void;
}

// ─── Add Member Form ──────────────────────────────────────────────────────────

function AddMemberForm({
  branchId,
  initialName,
  onSaved,
  onCancel,
}: {
  branchId: string;
  initialName: string;
  onSaved: (m: Member) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim()) {
      setError("Nama wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const member = await createMemberInSupabase({ name, phone, address, branch_id: branchId });
      onSaved(member);
    } catch (e: any) {
      console.log("Err : ", e.message);

      setError(e.message ?? "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={addStyles.container}>
      <View style={addStyles.header}>
        <TouchableOpacity onPress={onCancel} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={20} color="#374151" />
        </TouchableOpacity>
        <Text style={addStyles.title}>Daftarkan Member Baru</Text>
      </View>

      {!!error && (
        <View style={addStyles.errorBox}>
          <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
          <Text style={addStyles.errorText}>{error}</Text>
        </View>
      )}

      <View style={addStyles.field}>
        <Text style={addStyles.label}>Nama *</Text>
        <View style={addStyles.inputWrap}>
          <Ionicons
            name="person-outline"
            size={15}
            color="#9CA3AF"
            style={{ marginHorizontal: 10 }}
          />
          <TextInput
            style={addStyles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nama lengkap"
            placeholderTextColor="#9CA3AF"
            autoFocus
          />
        </View>
      </View>

      <View style={addStyles.field}>
        <Text style={addStyles.label}>No. HP</Text>
        <View style={addStyles.inputWrap}>
          <Ionicons
            name="call-outline"
            size={15}
            color="#9CA3AF"
            style={{ marginHorizontal: 10 }}
          />
          <TextInput
            style={addStyles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="08xxxxxxxx"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
          />
        </View>
      </View>

      <View style={addStyles.field}>
        <Text style={addStyles.label}>Alamat</Text>
        <View style={addStyles.inputWrap}>
          <Ionicons
            name="location-outline"
            size={15}
            color="#9CA3AF"
            style={{ marginHorizontal: 10 }}
          />
          <TextInput
            style={[addStyles.input, { paddingVertical: 9 }]}
            value={address}
            onChangeText={setAddress}
            placeholder="opsional"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={2}
          />
        </View>
      </View>

      <TouchableOpacity
        style={addStyles.saveBtn}
        onPress={save}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={addStyles.saveBtnText}>Daftarkan Member</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const addStyles = StyleSheet.create({
  container: { gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 15, fontWeight: "700", color: "#111827" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 10,
  },
  errorText: { color: "#DC2626", fontSize: 12, flex: 1 },
  field: { gap: 5 },
  label: { fontSize: 12, fontWeight: "600", color: "#374151" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  input: {
    flex: 1,
    paddingVertical: 11,
    paddingRight: 12,
    fontSize: 14,
    color: "#111827",
  },
  saveBtn: {
    backgroundColor: "#56B2C1",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});

// ─── Member Picker Modal ──────────────────────────────────────────────────────

export function MemberPicker({
  visible,
  selected,
  total,
  onSelect,
  onClose,
}: Props) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const branchId = useAuthStore((s) => s.currentBranch?.id ?? "");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [pointsPerRupiah, setPointsPerRupiah] = useState(10_000);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardOffset(e.endCoordinates.height / 2);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardOffset(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    getPointsPerRupiah()
      .then(setPointsPerRupiah)
      .catch(() => {});
  }, []);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim() || !branchId) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const data = await searchMembers(branchId, q);
        setResults(data);
      } catch {
      } finally {
        setLoading(false);
      }
    },
    [branchId],
  );

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, doSearch]);

  useEffect(() => {
    if (visible && branchId) {
      // Cache member di background saat picker dibuka dan online
      cacheMembersLocally(branchId).catch(() => {});
    }
    if (!visible) {
      setQuery("");
      setResults([]);
      setShowAdd(false);
    }
  }, [visible, branchId]);

  const pointsPreview = calcPoints(total, pointsPerRupiah);

  const sheetContent = !showAdd ? (
    <>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>Pilih Member</Text>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
          <Ionicons name="close" size={22} color="#374151" />
        </TouchableOpacity>
      </View>

      {total > 0 && (
        <View style={styles.pointsPreview}>
          <Ionicons name="star" size={14} color="#D97706" />
          <Text style={styles.pointsPreviewText}>
            Transaksi ini akan memberikan{" "}
            <Text style={{ fontWeight: "800", color: "#D97706" }}>
              {pointsPreview} poin
            </Text>{" "}
            kepada member
          </Text>
        </View>
      )}

      {selected && (
        <View style={styles.selectedBanner}>
          <View style={styles.selectedAvatar}>
            <Text style={styles.selectedAvatarText}>
              {selected.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.selectedName}>{selected.name}</Text>
            <Text style={styles.selectedInfo}>
              {selected.points} poin
              {selected.phone ? ` · ${selected.phone}` : ""}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => {
              onSelect(null);
              onClose();
            }}
          >
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.searchWrap}>
        <Ionicons
          name="search-outline"
          size={16}
          color="#9CA3AF"
          style={{ marginLeft: 12 }}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari nama atau no. HP..."
          value={query}
          onChangeText={setQuery}
          placeholderTextColor="#9CA3AF"
          autoFocus={!selected}
          returnKeyType="search"
        />
        {loading ? (
          <ActivityIndicator
            size="small"
            color="#9CA3AF"
            style={{ marginRight: 12 }}
          />
        ) : (
          query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery("")}
              style={{ paddingHorizontal: 12 }}
            >
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )
        )}
      </View>

      <FlatList
        data={results}
        keyExtractor={(m) => m.id}
        style={styles.resultList}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: "#F3F4F6" }} />
        )}
        ListEmptyComponent={
          query.trim().length >= 2 && !loading ? (
            <View style={styles.noResult}>
              <Text style={styles.noResultText}>Member tidak ditemukan</Text>
              <TouchableOpacity
                style={styles.addMemberBtn}
                onPress={() => setShowAdd(true)}
              >
                <Ionicons name="person-add-outline" size={16} color="#56B2C1" />
                <Text style={styles.addMemberText}>
                  Daftarkan "{query}" sebagai member baru
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.resultItem,
              selected?.id === item.id && styles.resultItemActive,
            ]}
            onPress={() => {
              onSelect(item);
              onClose();
            }}
          >
            <View
              style={[
                styles.resultAvatar,
                selected?.id === item.id && { backgroundColor: "#347385" },
              ]}
            >
              <Text
                style={[
                  styles.resultAvatarText,
                  selected?.id === item.id && { color: "#fff" },
                ]}
              >
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultName}>{item.name}</Text>
              <Text style={styles.resultSub}>
                {item.phone ?? "Tanpa no. HP"} · {item.points} poin
              </Text>
            </View>
            {selected?.id === item.id && (
              <Ionicons name="checkmark-circle" size={18} color="#347385" />
            )}
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={styles.addNewBtn}
        onPress={() => setShowAdd(true)}
      >
        <Ionicons name="person-add-outline" size={15} color="#347385" />
        <Text style={styles.addNewBtnText}>Daftarkan Member Baru</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skipBtn}
        onPress={() => {
          onSelect(null);
          onClose();
        }}
      >
        <Text style={styles.skipText}>Lanjut tanpa member</Text>
      </TouchableOpacity>
    </>
  ) : (
    <AddMemberForm
      branchId={branchId}
      initialName={query}
      onSaved={(m) => {
        onSelect(m);
        onClose();
      }}
      onCancel={() => setShowAdd(false)}
    />
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.centerBox, { marginBottom: keyboardOffset }]}
          onPress={() => {}}
        >
          {showAdd ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
            >
              {sheetContent}
            </ScrollView>
          ) : (
            sheetContent
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  centerBox: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    gap: 12,
    width: "88%",
    maxWidth: 480,
    maxHeight: "82%",
  },
  resultList: {
    flexGrow: 0,
    maxHeight: 260,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },

  pointsPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  pointsPreviewText: { fontSize: 13, color: "#92400E", flex: 1 },

  selectedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EEF8FA",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#56B2C1",
  },
  selectedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#347385",
    justifyContent: "center",
    alignItems: "center",
  },
  selectedAvatarText: { fontSize: 18, fontWeight: "800", color: "#fff" },
  selectedName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  selectedInfo: { fontSize: 12, color: "#6B7280", marginTop: 1 },
  removeBtn: { padding: 4 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    paddingRight: 4,
    fontSize: 14,
    color: "#111827",
  },

  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  resultItemActive: {
    backgroundColor: "#EEF8FA",
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  resultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  resultAvatarText: { fontSize: 16, fontWeight: "700", color: "#374151" },
  resultName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  resultSub: { fontSize: 12, color: "#6B7280", marginTop: 1 },

  noResult: { alignItems: "center", gap: 8, paddingVertical: 8 },
  noResultText: { fontSize: 13, color: "#9CA3AF" },
  addMemberBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEF8FA",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#A9DFE9",
  },
  addMemberText: { fontSize: 13, fontWeight: "600", color: "#347385" },

  addNewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#A9DFE9",
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: "#EEF8FA",
  },
  addNewBtnText: { fontSize: 13, fontWeight: "600", color: "#347385" },

  skipBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  skipText: { fontSize: 13, color: "#9CA3AF", fontWeight: "600" },
});
