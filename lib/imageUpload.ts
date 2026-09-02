/**
 * Image Upload Helpers
 * Upload images to Supabase Storage
 */

import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';

const BUCKET_NAME = 'product-images';

/**
 * Upload product image to Supabase Storage
 * @param uri - Local file URI
 * @param productId - Product ID for filename
 * @returns Public URL of uploaded image
 */
export const uploadProductImage = async (uri: string, productId: string): Promise<string> => {
  try {
    const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const fileName = `${productId}-${Date.now()}.${ext}`;
    const filePath = `products/${fileName}`;

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, decode(base64), {
        contentType,
        upsert: false,
      });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('Failed to upload image:', error);
    throw new Error('Gagal upload gambar');
  }
};

/**
 * Delete product image from Supabase Storage
 * @param imageUrl - Public URL of image
 */
export const deleteProductImage = async (imageUrl: string): Promise<void> => {
  try {
    // Extract file path from public URL
    const urlParts = imageUrl.split(`/${BUCKET_NAME}/`);
    if (urlParts.length < 2) return;

    const filePath = urlParts[1];

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      console.error('Failed to delete image:', error);
    }
  } catch (error) {
    console.error('Failed to delete image:', error);
  }
};

function decode(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const clean = base64.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let out = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    bytes[out++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) bytes[out++] = ((b & 0xf) << 4) | (c >> 2);
    if (i + 3 < clean.length) bytes[out++] = ((c & 0x3) << 6) | d;
  }
  return bytes.slice(0, out);
}

/**
 * Validate image file size (max 5MB)
 */
export const validateImageSize = async (uri: string): Promise<boolean> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists || !fileInfo.size) return false;

    const maxSize = 5 * 1024 * 1024; // 5MB
    return fileInfo.size <= maxSize;
  } catch {
    return false;
  }
};
