import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useProductStore } from "@/store/productStore";
import { useAuth } from "@/hooks/useAuth";
import { ProductBarcodeScanner } from "@/components/ProductBarcodeScanner";
import { OFFProductPreview } from "@/components/OFFProductPreview";
import { NumpadInput } from "@/components/NumpadInput";
import { uploadOFFImageToStorage, type OFFProduct } from "@/lib/openFoodFacts";
import { uploadProductImage } from "@/lib/imageUpload";

type Step = 1 | 2 | 3;

interface UnitRow {
  label: string;
  price: string;
  multiplier: string;
  is_default: boolean;
}

export default function ProductFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { currentBranch } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 768;

  const {
    products,
    allProducts,
    categories,
    addProduct,
    updateProduct,
    loadCategories,
    loadProducts,
    fetchProductUnits,
    saveProductUnits,
  } = useProductStore();

  const isEdit = !!id;
  const existingProduct = isEdit ? (allProducts.find((p) => p.id === id) ?? products.find((p) => p.id === id)) : null;

  const fmt = (raw: string) => {
    const digits = raw.replace(/\./g, "").replace(/[^0-9]/g, "");
    if (!digits) return "";
    return parseInt(digits, 10).toLocaleString("id-ID");
  };

  // Form state
  const [name, setName] = useState(existingProduct?.name || "");
  const [categoryId, setCategoryId] = useState(
    existingProduct?.category_id || "",
  );
  const [price, setPrice] = useState(
    existingProduct?.price ? String(existingProduct.price) : "0",
  );
  const [costPrice, setCostPrice] = useState(
    existingProduct?.cost_price ? String(existingProduct.cost_price) : "0",
  );
  const [stock, setStock] = useState(
    existingProduct?.stock !== undefined ? String(existingProduct.stock) : "0",
  );
  const [minStock, setMinStock] = useState(
    existingProduct?.min_stock !== undefined
      ? String(existingProduct.min_stock)
      : "5",
  );
  const [unit, setUnit] = useState(existingProduct?.unit || "pcs");
  const [barcode, setBarcode] = useState(existingProduct?.barcode || "");
  const [imageUrl, setImageUrl] = useState(existingProduct?.image_url || "");
  const [unitRows, setUnitRows] = useState<UnitRow[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  const [step, setStep] = useState<Step>(isEdit ? 3 : 1);
  const [isLoading, setIsLoading] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [showScanner, setShowScanner] = useState(false);
  const [offProduct, setOffProduct] = useState<OFFProduct | null>(null);
  const [showOFFPreview, setShowOFFPreview] = useState(false);
  const [isUploadingOFFImage, setIsUploadingOFFImage] = useState(false);
  const [duplicateProduct, setDuplicateProduct] = useState<{ id: string; name: string; barcode: string } | null>(null);

  useEffect(() => {
    loadCategories();
    if (allProducts.length === 0) loadProducts({ reset: true });
    if (!isEdit) {
      setTimeout(() => setShowScanner(true), 300);
    } else if (id) {
      loadExistingUnits(id);
    }
  }, []);

  // Isi ulang form setelah data produk tersedia (load async)
  const [formPopulated, setFormPopulated] = useState(false);
  useEffect(() => {
    if (!isEdit || formPopulated || !existingProduct) return;
    setName(existingProduct.name || '');
    setCategoryId(existingProduct.category_id || '');
    setPrice(existingProduct.price ? String(existingProduct.price) : '0');
    setCostPrice(existingProduct.cost_price ? String(existingProduct.cost_price) : '0');
    setStock(existingProduct.stock !== undefined ? String(existingProduct.stock) : '0');
    setMinStock(existingProduct.min_stock !== undefined ? String(existingProduct.min_stock) : '5');
    setUnit(existingProduct.unit || 'pcs');
    setBarcode(existingProduct.barcode || '');
    setImageUrl(existingProduct.image_url || '');
    setFormPopulated(true);
  }, [existingProduct]);

  const loadExistingUnits = async (productId: string) => {
    setLoadingUnits(true);
    try {
      const data = await fetchProductUnits(productId);
      setUnitRows(
        data.map((u) => ({
          label: u.label,
          price: String(u.price),
          multiplier: String(u.multiplier),
          is_default: u.is_default,
        })),
      );
    } finally {
      setLoadingUnits(false);
    }
  };

  const pickImage = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Izin Ditolak",
          "Aplikasi memerlukan akses galeri untuk memilih foto produk.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "Images" as any,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0])
        setImageUrl(result.assets[0].uri);
    } catch {
      Alert.alert("Error", "Gagal memilih gambar");
    }
  };

  const handleOFFFound = (product: OFFProduct) => {
    setShowScanner(false);
    setOffProduct(product);
    setShowOFFPreview(true);
  };

  const handleOFFNotFound = (scannedBarcode: string) => {
    setShowScanner(false);
    setBarcode(scannedBarcode);
    setStep(1);
  };

  const handleExistingFound = (scannedBarcode: string): boolean => {
    const found = allProducts.find(
      (p) => p.barcode?.toLowerCase() === scannedBarcode.toLowerCase()
    );
    if (!found) return false;
    setShowScanner(false);
    setDuplicateProduct({ id: found.id, name: found.name, barcode: scannedBarcode });
    return true;
  };

  const handleOFFConfirm = async (chosenName: string) => {
    if (!offProduct) return;
    setIsUploadingOFFImage(true);
    try {
      let finalImageUrl = imageUrl;
      if (offProduct.image_url && !imageUrl) {
        const uploaded = await uploadOFFImageToStorage(
          offProduct.image_url,
          offProduct.barcode,
        );
        finalImageUrl = uploaded ?? offProduct.image_url;
      }
      setName(chosenName || offProduct.name || name);
      setBarcode(offProduct.barcode);
      if (finalImageUrl) setImageUrl(finalImageUrl);
    } finally {
      setIsUploadingOFFImage(false);
      setShowOFFPreview(false);
      setOffProduct(null);
      setStep(1);
    }
  };

  const addUnitRow = () => {
    setUnitRows((prev) => [
      ...prev,
      { label: "", price: "0", multiplier: "1", is_default: prev.length === 0 },
    ]);
  };

  const removeUnitRow = (i: number) => {
    setUnitRows((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      if (prev[i].is_default && next.length > 0)
        next[0] = { ...next[0], is_default: true };
      return next;
    });
  };

  const updateUnitRow = (
    i: number,
    field: keyof UnitRow,
    value: string | boolean,
  ) => {
    setUnitRows((prev) => {
      const next = [...prev];
      if (field === "is_default")
        return next.map((r, idx) => ({ ...r, is_default: idx === i }));
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Nama produk harus diisi";
    if (unitRows.length === 0 && parseInt(price) <= 0)
      e.price = "Harga jual harus lebih dari 0";
    unitRows.forEach((r, i) => {
      if (!r.label.trim()) e[`ulabel_${i}`] = "Nama satuan harus diisi";
      if (parseInt(r.price) <= 0) e[`uprice_${i}`] = "Harga harus lebih dari 0";
      if (parseInt(r.multiplier) <= 0)
        e[`umult_${i}`] = "Isi harus lebih dari 0";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!currentBranch) {
      Alert.alert("Error", "Cabang tidak ditemukan");
      return;
    }

    try {
      setIsLoading(true);

      let finalImageUrl = imageUrl;
      if (imageUrl && imageUrl.startsWith("file://")) {
        const tempId = `tmp_${Date.now()}`;
        const uploaded = await uploadProductImage(imageUrl, tempId);
        if (uploaded) finalImageUrl = uploaded;
      }

      const effectivePrice =
        unitRows.length > 0
          ? parseInt(
              unitRows.find((u) => u.is_default)?.price ?? unitRows[0].price,
            )
          : parseInt(price);

      const productData = {
        name: name.trim(),
        category_id: categoryId || null,
        price: effectivePrice || 0,
        cost_price: parseInt(costPrice) > 0 ? parseInt(costPrice) : null,
        stock: parseInt(stock) || 0,
        min_stock: parseInt(minStock) || 5,
        unit: unit.trim() || "pcs",
        barcode: barcode.trim() || null,
        image_url: finalImageUrl || null,
      };

      if (isEdit && id) {
        await updateProduct(id, productData);
        if (unitRows.length > 0) {
          await saveProductUnits(
            id,
            unitRows.map((u) => ({
              label: u.label.trim(),
              price: parseInt(u.price) || 0,
              multiplier: parseInt(u.multiplier) || 1,
              is_default: u.is_default,
            })),
          );
        } else {
          await saveProductUnits(id, []);
        }
        Alert.alert("Berhasil", "Produk berhasil diperbarui", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        await addProduct(productData);
        // Ambil ID produk yang baru saja dibuat dari store
        const newProduct = useProductStore
          .getState()
          .products.find(
            (p) =>
              p.barcode === (barcode.trim() || null) && p.name === name.trim(),
          );
        if (newProduct && unitRows.length > 0) {
          await saveProductUnits(
            newProduct.id,
            unitRows.map((u) => ({
              label: u.label.trim(),
              price: parseInt(u.price) || 0,
              multiplier: parseInt(u.multiplier) || 1,
              is_default: u.is_default,
            })),
          );
        }
        Alert.alert("Berhasil", "Produk berhasil ditambahkan", [
          { text: "Tambah Lagi", onPress: resetForm },
          { text: "Selesai", onPress: () => router.back() },
        ]);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Gagal menyimpan produk");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setBarcode("");
    setPrice("0");
    setCostPrice("0");
    setStock("0");
    setImageUrl("");
    setCategoryId("");
    setUnitRows([]);
    setErrors({});
    setStep(1);
    setTimeout(() => setShowScanner(true), 200);
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const STEPS = [
    { n: 1, label: "Harga" },
    { n: 2, label: "Stok" },
    { n: 3, label: "Detail" },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBack}
        >
          <Ionicons name="arrow-back" size={22} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEdit ? "Edit Produk" : "Tambah Produk"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Step indicator */}
      {!isEdit && (
        <View style={styles.stepBar}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s.n}>
              <TouchableOpacity
                style={styles.stepItem}
                onPress={() => (step > s.n ? setStep(s.n as Step) : undefined)}
              >
                <View
                  style={[
                    styles.stepCircle,
                    step === s.n && styles.stepCircleActive,
                    step > s.n && styles.stepCircleDone,
                  ]}
                >
                  {step > s.n ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : (
                    <Text
                      style={[
                        styles.stepNum,
                        step === s.n && styles.stepNumActive,
                      ]}
                    >
                      {s.n}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    step === s.n && styles.stepLabelActive,
                  ]}
                >
                  {s.label}
                </Text>
              </TouchableOpacity>
              {i < STEPS.length - 1 && (
                <View
                  style={[styles.stepLine, step > s.n && styles.stepLineDone]}
                />
              )}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Produk info strip */}
      {(name || barcode || imageUrl) && (
        <View style={styles.productStrip}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.stripImage} />
          ) : (
            <View style={styles.stripImagePlaceholder}>
              <Ionicons name="cube-outline" size={20} color="#A0AEC0" />
            </View>
          )}
          <View style={styles.stripInfo}>
            <Text style={styles.stripName} numberOfLines={1}>
              {name || "Nama belum diisi"}
            </Text>
            {barcode ? (
              <Text style={styles.stripBarcode}>{barcode}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => setShowScanner(true)}
            style={styles.stripScan}
          >
            <Ionicons name="scan-outline" size={18} color="#347385" />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 80 },
          isTablet && { maxWidth: 500, alignSelf: "center", width: "100%" },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* STEP 1 — Harga */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Harga Jual</Text>
            {errors.price ? (
              <Text style={styles.errorText}>{errors.price}</Text>
            ) : null}
            <NumpadInput value={price} onChange={setPrice} prefix="Rp" />
            <TouchableOpacity
              style={[
                styles.nextBtn,
                parseInt(price) <= 0 && styles.nextBtnDisabled,
              ]}
              onPress={() => {
                if (parseInt(price) <= 0) {
                  setErrors({ price: "Harga jual harus lebih dari 0" });
                  return;
                }
                setErrors({});
                setStep(2);
              }}
            >
              <Text style={styles.nextBtnText}>Lanjut ke Stok</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 2 — Stok */}
        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Stok Awal</Text>
            <NumpadInput value={stock} onChange={setStock} prefix="Qty" />
            <View style={styles.rowBtns}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => setStep(1)}
              >
                <Ionicons name="arrow-back" size={18} color="#347385" />
                <Text style={styles.backBtnText}>Kembali</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nextBtn}
                onPress={() => setStep(3)}
              >
                <Text style={styles.nextBtnText}>Lanjut ke Detail</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 3 — Detail */}
        {step === 3 && (
          <View style={styles.stepContent}>
            {/* Gambar + nama + barcode */}
            <View style={styles.topCard}>
              <TouchableOpacity style={styles.imageBtn} onPress={pickImage}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.image} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="camera-outline" size={24} color="#A0AEC0" />
                    <Text style={styles.imageHint}>Foto</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.topFields}>
                <TextInput
                  style={[styles.nameInput, errors.name && styles.inputError]}
                  placeholder="Nama produk"
                  placeholderTextColor="#A0AEC0"
                  value={name}
                  onChangeText={setName}
                  editable={!isLoading}
                />
                {errors.name ? (
                  <Text style={styles.errorText}>{errors.name}</Text>
                ) : null}
                <TouchableOpacity
                  style={styles.barcodeRow}
                  onPress={() => setShowScanner(true)}
                  disabled={isLoading}
                >
                  <Ionicons name="scan-outline" size={15} color="#347385" />
                  <Text
                    style={[
                      styles.barcodeText,
                      !barcode && { color: "#A0AEC0" },
                    ]}
                    numberOfLines={1}
                  >
                    {barcode || "Scan barcode"}
                  </Text>
                  {barcode ? (
                    <TouchableOpacity
                      onPress={() => setBarcode("")}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={15} color="#CBD5E0" />
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
              </View>
            </View>

            {/* Ringkasan harga & stok */}
            {!isEdit && (
              <View style={styles.summaryRow}>
                <TouchableOpacity
                  style={styles.summaryItem}
                  onPress={() => setStep(1)}
                >
                  <Text style={styles.summaryLabel}>Harga Jual</Text>
                  <Text style={styles.summaryValue}>
                    Rp {parseInt(price).toLocaleString("id-ID")}
                  </Text>
                  <Text style={styles.summaryEdit}>Ubah</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.summaryItem}
                  onPress={() => setStep(2)}
                >
                  <Text style={styles.summaryLabel}>Stok Awal</Text>
                  <Text style={styles.summaryValue}>
                    {stock} {unit}
                  </Text>
                  <Text style={styles.summaryEdit}>Ubah</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Multi-satuan */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Satuan & Harga</Text>
                <TouchableOpacity
                  style={styles.addUnitBtn}
                  onPress={addUnitRow}
                  disabled={isLoading}
                >
                  <Ionicons name="add" size={15} color="#56B2C1" />
                  <Text style={styles.addUnitText}>Tambah Satuan</Text>
                </TouchableOpacity>
              </View>

              {unitRows.length === 0 ? (
                <Text style={styles.unitHint}>
                  Opsional — tambah satuan kalau produk punya beberapa ukuran
                  (pcs, dus, karton...). Harga jual diambil dari Step 1.
                </Text>
              ) : loadingUnits ? (
                <ActivityIndicator
                  color="#347385"
                  style={{ marginVertical: 12 }}
                />
              ) : (
                unitRows.map((row, i) => (
                  <View key={i} style={styles.unitCard}>
                    <View style={styles.unitCardHeader}>
                      <TouchableOpacity
                        style={[
                          styles.defaultBadge,
                          row.is_default && styles.defaultBadgeActive,
                        ]}
                        onPress={() => updateUnitRow(i, "is_default", true)}
                      >
                        <Ionicons
                          name={
                            row.is_default
                              ? "radio-button-on"
                              : "radio-button-off"
                          }
                          size={13}
                          color={row.is_default ? "#56B2C1" : "#A0AEC0"}
                        />
                        <Text
                          style={[
                            styles.defaultBadgeText,
                            row.is_default && styles.defaultBadgeTextActive,
                          ]}
                        >
                          Default
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => removeUnitRow(i)}
                        style={{ padding: 4 }}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color="#E53E3E"
                        />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.unitRow}>
                      <View style={[styles.field, { flex: 2 }]}>
                        <Text style={styles.label}>Nama Satuan</Text>
                        <TextInput
                          style={[
                            styles.input,
                            errors[`ulabel_${i}`] && styles.inputError,
                          ]}
                          placeholder="Pcs / Dus / Karton"
                          placeholderTextColor="#CBD5E0"
                          value={row.label}
                          onChangeText={(v) => updateUnitRow(i, "label", v)}
                          editable={!isLoading}
                        />
                        {errors[`ulabel_${i}`] ? (
                          <Text style={styles.errorText}>
                            {errors[`ulabel_${i}`]}
                          </Text>
                        ) : null}
                      </View>
                      <View style={[styles.field, { flex: 1 }]}>
                        <Text style={styles.label}>Isi</Text>
                        <TextInput
                          style={[
                            styles.input,
                            errors[`umult_${i}`] && styles.inputError,
                          ]}
                          placeholder="1"
                          placeholderTextColor="#CBD5E0"
                          value={row.multiplier}
                          onChangeText={(v) =>
                            updateUnitRow(
                              i,
                              "multiplier",
                              v.replace(/[^0-9]/g, ""),
                            )
                          }
                          keyboardType="numeric"
                          editable={!isLoading}
                          onFocus={() => {
                            if (row.multiplier === "1")
                              updateUnitRow(i, "multiplier", "");
                          }}
                          onBlur={() => {
                            if (!row.multiplier)
                              updateUnitRow(i, "multiplier", "1");
                          }}
                        />
                        {errors[`umult_${i}`] ? (
                          <Text style={styles.errorText}>
                            {errors[`umult_${i}`]}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.label}>Harga Jual</Text>
                      <View
                        style={[
                          styles.priceBox,
                          errors[`uprice_${i}`] && styles.inputError,
                        ]}
                      >
                        <Text style={styles.currency}>Rp</Text>
                        <TextInput
                          style={styles.priceInput}
                          placeholder="0"
                          placeholderTextColor="#CBD5E0"
                          value={parseInt(row.price) > 0 ? fmt(row.price) : ""}
                          onChangeText={(v) =>
                            updateUnitRow(
                              i,
                              "price",
                              v
                                ? String(parseInt(v.replace(/\./g, "")) || 0)
                                : "0",
                            )
                          }
                          onFocus={() => {
                            if (row.price === "0")
                              updateUnitRow(i, "price", "");
                          }}
                          onBlur={() => {
                            if (!row.price) updateUnitRow(i, "price", "0");
                          }}
                          keyboardType="numeric"
                          editable={!isLoading}
                        />
                      </View>
                      {errors[`uprice_${i}`] ? (
                        <Text style={styles.errorText}>
                          {errors[`uprice_${i}`]}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Field tambahan */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Informasi Tambahan</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Harga Beli</Text>
                <View style={styles.priceBox}>
                  <Text style={styles.currency}>Rp</Text>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="0"
                    placeholderTextColor="#CBD5E0"
                    value={parseInt(costPrice) > 0 ? fmt(costPrice) : ""}
                    onChangeText={(v) =>
                      setCostPrice(
                        v ? String(parseInt(v.replace(/\./g, "")) || 0) : "0",
                      )
                    }
                    onFocus={() => {
                      if (costPrice === "0") setCostPrice("");
                    }}
                    onBlur={() => {
                      if (!costPrice) setCostPrice("0");
                    }}
                    keyboardType="numeric"
                    editable={!isLoading}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Satuan Terkecil</Text>
                <TextInput
                  style={styles.input}
                  placeholder="pcs"
                  placeholderTextColor="#CBD5E0"
                  value={unit}
                  onChangeText={setUnit}
                  editable={!isLoading}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Min. Stok Alert</Text>
                <TextInput
                  style={styles.input}
                  placeholder="5"
                  placeholderTextColor="#CBD5E0"
                  value={minStock}
                  onChangeText={(v) => setMinStock(v.replace(/[^0-9]/g, ""))}
                  onFocus={() => {
                    if (minStock === "5") setMinStock("");
                  }}
                  onBlur={() => {
                    if (!minStock) setMinStock("5");
                  }}
                  keyboardType="numeric"
                  editable={!isLoading}
                />
              </View>

              <View style={[styles.field, { marginBottom: 0 }]}>
                <Text style={styles.label}>Kategori</Text>
                <TouchableOpacity
                  style={styles.picker}
                  onPress={() => setShowCategoryPicker((v) => !v)}
                  disabled={isLoading}
                >
                  <Text
                    style={[
                      styles.pickerText,
                      !selectedCategory && { color: "#A0AEC0" },
                    ]}
                  >
                    {selectedCategory?.name || "Pilih kategori"}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#A0AEC0" />
                </TouchableOpacity>
                {showCategoryPicker && (
                  <View style={styles.pickerOptions}>
                    <TouchableOpacity
                      style={styles.pickerOption}
                      onPress={() => {
                        setCategoryId("");
                        setShowCategoryPicker(false);
                      }}
                    >
                      <Text style={styles.pickerOptionText}>
                        Tanpa Kategori
                      </Text>
                    </TouchableOpacity>
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={styles.pickerOption}
                        onPress={() => {
                          setCategoryId(cat.id);
                          setShowCategoryPicker(false);
                        }}
                      >
                        <Text style={styles.pickerOptionText}>{cat.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer tombol step 3 */}
      {step === 3 && (
        <View style={[styles.footer, { paddingBottom: 12 }]}>
          {!isEdit && (
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
              <Ionicons name="arrow-back" size={18} color="#347385" />
              <Text style={styles.backBtnText}>Kembali</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.saveBtn, isLoading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color="#fff"
                />
                <Text style={styles.saveBtnText}>Simpan Produk</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Barcode Scanner */}
      <ProductBarcodeScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onFound={handleOFFFound}
        onNotFound={handleOFFNotFound}
        onExistingFound={handleExistingFound}
      />

      {/* Modal produk sudah ada */}
      <Modal
        visible={!!duplicateProduct}
        transparent
        animationType="fade"
        onRequestClose={() => setDuplicateProduct(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.duplicateModal}>
            <View style={styles.duplicateIcon}>
              <Ionicons name="information-circle" size={32} color="#347385" />
            </View>
            <Text style={styles.duplicateTitle}>Produk Sudah Ada</Text>
            <Text style={styles.duplicateName} numberOfLines={2}>{duplicateProduct?.name}</Text>
            <Text style={styles.duplicateBarcode}>{duplicateProduct?.barcode}</Text>
            <Text style={styles.duplicateSub}>Produk dengan barcode ini sudah terdaftar. Mau edit produk yang ada?</Text>
            <TouchableOpacity
              style={styles.duplicateBtnPrimary}
              onPress={() => {
                const dupId = duplicateProduct!.id;
                setDuplicateProduct(null);
                router.back();
                setTimeout(() => router.push(`/(backoffice)/products/form?id=${dupId}`), 50);
              }}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.duplicateBtnPrimaryText}>Edit Produk Ini</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.duplicateBtnSecondary}
              onPress={() => { setDuplicateProduct(null); setShowScanner(true); }}
            >
              <Ionicons name="scan-outline" size={18} color="#347385" />
              <Text style={styles.duplicateBtnSecondaryText}>Scan Produk Lain</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* OFF Product Preview */}
      <Modal
        visible={showOFFPreview}
        animationType="slide"
        onRequestClose={() => {
          setShowOFFPreview(false);
          setOffProduct(null);
        }}
      >
        <View style={{ flex: 1 }}>
          <View style={[styles.offHeader, { paddingTop: insets.top + 16 }]}>
            <Text style={styles.offHeaderTitle}>Data dari Master Produk</Text>
            <TouchableOpacity
              onPress={() => {
                setShowOFFPreview(false);
                setOffProduct(null);
              }}
            >
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>
          {offProduct && (
            <OFFProductPreview
              product={offProduct}
              isUploading={isUploadingOFFImage}
              onConfirm={handleOFFConfirm}
              onEdit={() => {
                if (offProduct) setBarcode(offProduct.barcode);
                setShowOFFPreview(false);
                setOffProduct(null);
                setStep(1);
              }}
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7FAFC" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerBack: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#1A202C" },

  stepBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  stepItem: { alignItems: "center", gap: 4 },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: { backgroundColor: "#347385" },
  stepCircleDone: { backgroundColor: "#56B2C1" },
  stepNum: { fontSize: 13, fontWeight: "700", color: "#A0AEC0" },
  stepNumActive: { color: "#fff" },
  stepLabel: { fontSize: 11, fontWeight: "600", color: "#A0AEC0" },
  stepLabelActive: { color: "#347385" },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 8,
    marginBottom: 14,
  },
  stepLineDone: { backgroundColor: "#56B2C1" },

  productStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#EEF8FA",
    borderBottomWidth: 1,
    borderBottomColor: "#B2E0EA",
  },
  stripImage: { width: 36, height: 36, borderRadius: 8 },
  stripImagePlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  stripInfo: { flex: 1 },
  stripName: { fontSize: 13, fontWeight: "700", color: "#1A202C" },
  stripBarcode: { fontSize: 11, color: "#718096" },
  stripScan: { padding: 6 },

  scroll: { padding: 16, gap: 14 },
  stepContent: { gap: 14 },
  stepTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A202C",
    textAlign: "center",
    marginBottom: 4,
  },

  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#347385",
    borderRadius: 14,
    paddingVertical: 16,
    flex: 1,
  },
  nextBtnDisabled: { backgroundColor: "#A0AEC0" },
  nextBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#347385",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  backBtnText: { color: "#347385", fontSize: 14, fontWeight: "600" },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#347385",
    borderRadius: 14,
    paddingVertical: 16,
    flex: 1,
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  rowBtns: { flexDirection: "row", gap: 10 },

  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },

  summaryRow: { flexDirection: "row", gap: 10 },
  summaryItem: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  summaryLabel: {
    fontSize: 11,
    color: "#718096",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  summaryValue: { fontSize: 16, fontWeight: "800", color: "#1A202C" },
  summaryEdit: { fontSize: 11, color: "#347385", fontWeight: "600" },

  topCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  imageBtn: { width: 72, height: 72, borderRadius: 10, overflow: "hidden" },
  image: { width: 72, height: 72 },
  imagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: "#F0F4F8",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
    gap: 2,
  },
  imageHint: { fontSize: 10, color: "#A0AEC0" },
  topFields: { flex: 1, gap: 8, justifyContent: "center" },
  nameInput: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A202C",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "#FAFAFA",
  },
  barcodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FAFAFA",
  },
  barcodeText: { flex: 1, fontSize: 12, color: "#1A202C" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4A5568",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  addUnitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#56B2C1",
  },
  addUnitText: { fontSize: 12, fontWeight: "600", color: "#56B2C1" },
  unitHint: { fontSize: 12, color: "#A0AEC0", lineHeight: 18 },

  unitCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#FAFAFA",
  },
  unitCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  unitRow: { flexDirection: "row", gap: 10 },
  defaultBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E0",
  },
  defaultBadgeActive: { borderColor: "#56B2C1", backgroundColor: "#EBF8FF" },
  defaultBadgeText: { fontSize: 11, fontWeight: "600", color: "#A0AEC0" },
  defaultBadgeTextActive: { color: "#56B2C1" },

  field: { marginBottom: 12 },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: "#718096",
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  input: {
    height: 44,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#1A202C",
    backgroundColor: "#fff",
  },
  inputError: { borderColor: "#E53E3E" },
  errorText: {
    fontSize: 11,
    color: "#E53E3E",
    marginTop: 3,
    textAlign: "center",
  },

  priceBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  currency: {
    fontSize: 13,
    fontWeight: "700",
    color: "#718096",
    marginRight: 4,
  },
  priceInput: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1A202C" },

  picker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 44,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  pickerText: { fontSize: 14, color: "#1A202C" },
  pickerOptions: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  pickerOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F4F8",
  },
  pickerOptionText: { fontSize: 14, color: "#1A202C" },

  offHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  offHeaderTitle: { fontSize: 16, fontWeight: "700", color: "#1A202C" },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  duplicateModal: {
    backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 360,
    padding: 24, alignItems: 'center', gap: 8,
  },
  duplicateIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#EEF8FA', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  duplicateTitle: { fontSize: 18, fontWeight: '800', color: '#1A202C' },
  duplicateName: { fontSize: 15, fontWeight: '600', color: '#347385', textAlign: 'center' },
  duplicateBarcode: { fontSize: 12, color: '#A0AEC0', fontFamily: 'monospace' },
  duplicateSub: { fontSize: 13, color: '#718096', textAlign: 'center', lineHeight: 19, marginTop: 4 },
  duplicateBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#347385', borderRadius: 12, paddingVertical: 13,
    width: '100%', marginTop: 8,
  },
  duplicateBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  duplicateBtnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#347385', borderRadius: 12, paddingVertical: 11,
    width: '100%',
  },
  duplicateBtnSecondaryText: { color: '#347385', fontWeight: '600', fontSize: 14 },
});
