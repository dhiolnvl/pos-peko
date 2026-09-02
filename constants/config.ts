/**
 * App configuration
 */

// Supabase Configuration
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// App Configuration
export const APP_NAME = 'PekoPetshop';
export const APP_VERSION = '1.0.0';
export const APP_ENV = (process.env.EXPO_PUBLIC_ENVIRONMENT ?? 'development') as 'development' | 'staging' | 'production';

// Database Configuration
export const DB_NAME = 'pekopetshop.db';
export const DB_VERSION = 1;

// Sync Configuration
export const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
export const SYNC_ON_APP_START = true;
export const SYNC_ON_NETWORK_RECONNECT = true;

// Invoice Configuration
export const INVOICE_PREFIX = 'INV';
export const INVOICE_NUMBER_LENGTH = 8;

// Stock Configuration
export const DEFAULT_MIN_STOCK = 5;
export const LOW_STOCK_THRESHOLD = 10;

// Transaction Configuration
export const DEFAULT_TAX_PERCENTAGE = 0; // 0% (bisa diubah sesuai kebutuhan)
export const MAX_DISCOUNT_PERCENTAGE = 100;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Cache Configuration
export const CACHE_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours

// Network Configuration
export const REQUEST_TIMEOUT = 30000; // 30 seconds
export const MAX_RETRY_ATTEMPTS = 3;

// Image Upload Configuration
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

// Date Format
export const DATE_FORMAT = 'DD/MM/YYYY';
export const DATETIME_FORMAT = 'DD/MM/YYYY HH:mm';
export const TIME_FORMAT = 'HH:mm';

// Currency
export const CURRENCY_SYMBOL = 'Rp';
export const CURRENCY_LOCALE = 'id-ID';

/**
 * Format currency
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

/**
 * Format number
 */
export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat(CURRENCY_LOCALE).format(num);
};

/**
 * Generate invoice number
 */
export const generateInvoiceNumber = (branchCode: string = '001'): string => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  return `${INVOICE_PREFIX}-${branchCode}-${year}${month}${day}-${random}`;
};
