import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TransactionInput } from './transactionProcessor';

const KEY = 'offline.order_queue';

export interface OfflineOrder {
  localId: string;
  transactionId: string;
  input: TransactionInput;
  queuedAt: string;
  retries: number;
}

const generateUUID = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const readQueue = async (): Promise<OfflineOrder[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineOrder[];
  } catch {
    return [];
  }
};

const writeQueue = async (queue: OfflineOrder[]): Promise<void> => {
  await AsyncStorage.setItem(KEY, JSON.stringify(queue));
};

export const offlineQueue = {
  enqueue: async (input: TransactionInput): Promise<{ localId: string; transactionId: string }> => {
    const queue = await readQueue();
    const localId = 'offline_' + generateUUID();
    const transactionId = generateUUID();
    queue.push({ localId, transactionId, input, queuedAt: new Date().toISOString(), retries: 0 });
    await writeQueue(queue);
    return { localId, transactionId };
  },

  getAll: async (): Promise<OfflineOrder[]> => {
    return readQueue();
  },

  remove: async (localId: string): Promise<void> => {
    const queue = await readQueue();
    await writeQueue(queue.filter((o) => o.localId !== localId));
  },

  incrementRetry: async (localId: string): Promise<void> => {
    const queue = await readQueue();
    await writeQueue(queue.map((o) => (o.localId === localId ? { ...o, retries: o.retries + 1 } : o)));
  },

  count: async (): Promise<number> => {
    const queue = await readQueue();
    return queue.length;
  },

  clear: async (): Promise<void> => {
    await AsyncStorage.removeItem(KEY);
  },
};
