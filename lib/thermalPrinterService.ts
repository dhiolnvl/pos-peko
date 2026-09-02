import { PermissionsAndroid, Platform, NativeModules, Linking, Alert } from "react-native";
import { Buffer } from 'buffer';
import { BLEPrinter } from "react-native-thermal-receipt-printer";
import { mmkv, StorageKeys } from "@/lib/mmkvStorage";
import { PRINTER_LOGO_BASE64 } from "@/lib/logo-nota-base64";

export interface PrinterDevice {
  device_name: string;
  inner_mac_address: string;
}

interface SavedPrinterConnection {
  device_name: string;
  device_address: string;
  auto_connect: boolean;
}

class ThermalPrinterService {
  private connectedDevice: PrinterDevice | null = null;
  private isInitialized = false;
  private isPrinting = false;
  private autoConnectAttempted = false;

  async initialize(): Promise<void> {
    if (this.autoConnectAttempted) return;
    this.autoConnectAttempted = true;

    try {
      const saved = await mmkv.getObject<SavedPrinterConnection>(
        StorageKeys.PRINTER_CONFIG,
      );
      if (!saved?.auto_connect || !saved?.device_address) return;

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return;

      if (!this.isInitialized) {
        await BLEPrinter.init();
        this.isInitialized = true;
      }

      await this.connect(
        {
          device_name: saved.device_name,
          inner_mac_address: saved.device_address,
        },
        false,
      );
    } catch {
      this.connectedDevice = null;
    }
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== "android") return true;
    try {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        const scanResult = granted["android.permission.BLUETOOTH_SCAN"];
        const connectResult = granted["android.permission.BLUETOOTH_CONNECT"];

        if (
          scanResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
          connectResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
        ) {
          Alert.alert(
            "Izin Bluetooth Diperlukan",
            "Izin Bluetooth diblokir. Buka Pengaturan > Aplikasi > PEKO Petshop > Izin, lalu aktifkan Bluetooth.",
            [
              { text: "Batal", style: "cancel" },
              { text: "Buka Pengaturan", onPress: () => Linking.openSettings() },
            ]
          );
          return false;
        }

        return (
          scanResult === PermissionsAndroid.RESULTS.GRANTED &&
          connectResult === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          Alert.alert(
            "Izin Lokasi Diperlukan",
            "Izin lokasi diblokir. Buka Pengaturan > Aplikasi > PEKO Petshop > Izin, lalu aktifkan Lokasi.",
            [
              { text: "Batal", style: "cancel" },
              { text: "Buka Pengaturan", onPress: () => Linking.openSettings() },
            ]
          );
          return false;
        }
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch {
      return false;
    }
  }

  async scanDevices(): Promise<PrinterDevice[]> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) throw new Error("Izin Bluetooth belum diberikan");

    if (!this.isInitialized) {
      await BLEPrinter.init();
      this.isInitialized = true;
    }

    const paired = await BLEPrinter.getDeviceList();
    if (!paired || !Array.isArray(paired)) return [];
    return paired as PrinterDevice[];
  }

  async connect(device: PrinterDevice, save = true): Promise<void> {
    if (!device.inner_mac_address)
      throw new Error("MAC address perangkat tidak ditemukan");

    const connectPromise = BLEPrinter.connectPrinter(device.inner_mac_address);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Koneksi timeout")), 10000),
    );
    await Promise.race([connectPromise, timeout]);

    this.connectedDevice = device;

    if (save) {
      const current = await mmkv.getObject<SavedPrinterConnection>(
        StorageKeys.PRINTER_CONFIG,
      );
      await mmkv.setObject(StorageKeys.PRINTER_CONFIG, {
        ...current,
        device_name: device.device_name,
        device_address: device.inner_mac_address,
        auto_connect: current?.auto_connect ?? false,
      });
    }
  }

  async disconnect(): Promise<void> {
    await BLEPrinter.closeConn();
    this.connectedDevice = null;
  }

  async setAutoConnect(value: boolean): Promise<void> {
    const current = await mmkv.getObject<SavedPrinterConnection>(
      StorageKeys.PRINTER_CONFIG,
    );
    await mmkv.setObject(StorageKeys.PRINTER_CONFIG, {
      ...current,
      auto_connect: value,
    });
  }

  async getAutoConnect(): Promise<boolean> {
    const saved = await mmkv.getObject<SavedPrinterConnection>(
      StorageKeys.PRINTER_CONFIG,
    );
    return saved?.auto_connect ?? false;
  }

  getConnectionStatus(): {
    isConnected: boolean;
    device: PrinterDevice | null;
  } {
    return {
      isConnected: this.connectedDevice !== null,
      device: this.connectedDevice,
    };
  }

  private async printLogo(): Promise<void> {
    if (Platform.OS !== "android") return;
    try {
      const { RNBLEPrinter } = NativeModules;
      if (!RNBLEPrinter?.printRawData) return;
      RNBLEPrinter.printRawData(PRINTER_LOGO_BASE64, (err: any) => {
        if (err) console.warn("[Printer] printLogo error:", err);
      });
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.warn("[Printer] printLogo error:", e);
    }
  }

  async printLabelWithBarcode(nameLine: string, priceLine: string, barcode: string | null): Promise<void> {
    if (!this.connectedDevice) throw new Error('Printer tidak terhubung');
    if (this.isPrinting) throw new Error('Printer sedang digunakan, coba lagi sebentar');

    this.isPrinting = true;
    try {
      const { RNBLEPrinter } = NativeModules;

      const CENTER   = Buffer.from([0x1b, 0x61, 0x01]); // ESC a 1 — center align
      const BOLD_ON  = Buffer.from([0x1b, 0x45, 0x01]); // ESC E 1 — bold on
      const BOLD_OFF = Buffer.from([0x1b, 0x45, 0x00]); // ESC E 0 — bold off
      const NORMAL   = Buffer.from([0x1b, 0x21, 0x00]); // ESC ! 0 — normal size
      const LF       = Buffer.from([0x0a]);

      let barcodeBytes = Buffer.alloc(0);
      if (barcode && barcode.length > 0 && barcode.length <= 255) {
        const MODULE_W = 2;

        const onlyDigits = /^\d+$/.test(barcode);
        let barcodeCommand: Buffer;
        let dataLen: number;

        if (onlyDigits && barcode.length === 13) {
          // EAN-13
          const d = Buffer.from(barcode, 'ascii');
          barcodeCommand = Buffer.concat([
            Buffer.from([0x1d, 0x6b, 0x43, d.length]),
            d,
          ]);
          dataLen = d.length;
        } else if (onlyDigits && barcode.length === 8) {
          // EAN-8
          const d = Buffer.from(barcode, 'ascii');
          barcodeCommand = Buffer.concat([
            Buffer.from([0x1d, 0x6b, 0x44, d.length]),
            d,
          ]);
          dataLen = d.length;
        } else if (onlyDigits && barcode.length === 12) {
          // UPC-A
          const d = Buffer.from(barcode, 'ascii');
          barcodeCommand = Buffer.concat([
            Buffer.from([0x1d, 0x6b, 0x41, d.length]),
            d,
          ]);
          dataLen = d.length;
        } else {
          // Code128 null-terminated (GS k 0x48) — lebih kompatibel di printer Chinese
          // Format: GS k 0x48 {B <data> NUL
          // {B memilih Code128B subset, NUL sebagai terminator
          const d = Buffer.from(barcode, 'ascii');
          barcodeCommand = Buffer.concat([
            Buffer.from([0x1d, 0x6b, 0x48]),    // GS k m=0x48 CODE128 null-terminated
            Buffer.from([0x7b, 0x42]),           // {B = Code128B subset selector
            d,
            Buffer.from([0x00]),                 // NUL terminator
          ]);
          dataLen = d.length + 2;
        }

        barcodeBytes = Buffer.concat([
          Buffer.from([0x1d, 0x68, 0x50]),      // GS h 80 — barcode height 80 dots
          Buffer.from([0x1d, 0x77, MODULE_W]),  // GS w — module width
          Buffer.from([0x1d, 0x48, 0x02]),      // GS H 2 — HRI below
          barcodeCommand,
          LF,
        ]);
      }

      const buf = Buffer.concat([
        CENTER,
        NORMAL,
        barcodeBytes,
        BOLD_ON,
        Buffer.from(nameLine, 'utf8'), LF,
        BOLD_OFF,
        Buffer.from(priceLine, 'utf8'), LF,
        Buffer.from([0x0a, 0x0a, 0x0a, 0x0a]),
        Buffer.from([0x1b, 0x69]),                              // full cut
      ]);

      RNBLEPrinter.printRawData(buf.toString('base64'), () => {});
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      this.connectedDevice = null;
      throw error;
    } finally {
      this.isPrinting = false;
    }
  }

  async printLabelWithQR(nameLine: string, priceLine: string, qrData: string | null): Promise<void> {
    if (!this.connectedDevice) throw new Error('Printer tidak terhubung');
    if (this.isPrinting) throw new Error('Printer sedang digunakan, coba lagi sebentar');

    this.isPrinting = true;
    try {
      const { RNBLEPrinter } = NativeModules;

      const CENTER   = Buffer.from([0x1b, 0x61, 0x01]);
      const BOLD_ON  = Buffer.from([0x1b, 0x45, 0x01]);
      const BOLD_OFF = Buffer.from([0x1b, 0x45, 0x00]);
      const NORMAL   = Buffer.from([0x1b, 0x21, 0x00]);
      const LF       = Buffer.from([0x0a]);

      let qrBytes = Buffer.alloc(0);
      if (qrData && qrData.length > 0) {
        const data = Buffer.from(qrData, 'utf8');
        const dataLen = data.length + 3; // pL pH cn fn data
        const pL = dataLen & 0xff;
        const pH = (dataLen >> 8) & 0xff;

        qrBytes = Buffer.concat([
          // GS ( k — QR Code: set model (model 2)
          Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
          // GS ( k — QR Code: set size (module size 6)
          Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),
          // GS ( k — QR Code: set error correction level M
          Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),
          // GS ( k — QR Code: store data
          Buffer.from([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]),
          data,
          // GS ( k — QR Code: print
          Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
          LF,
        ]);
      }

      const buf = Buffer.concat([
        CENTER,
        NORMAL,
        qrBytes,
        BOLD_ON,
        Buffer.from(nameLine, 'utf8'), LF,
        BOLD_OFF,
        Buffer.from(priceLine, 'utf8'), LF,
        Buffer.from([0x0a, 0x0a, 0x0a, 0x0a]),
        Buffer.from([0x1b, 0x69]),
      ]);

      RNBLEPrinter.printRawData(buf.toString('base64'), () => {});
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      this.connectedDevice = null;
      throw error;
    } finally {
      this.isPrinting = false;
    }
  }

  async printText(text: string, withLogo = true): Promise<void> {
    if (!this.connectedDevice) throw new Error("Printer tidak terhubung");
    if (this.isPrinting)
      throw new Error("Printer sedang digunakan, coba lagi sebentar");

    this.isPrinting = true;
    try {
      if (withLogo) await this.printLogo();

      const { RNBLEPrinter } = NativeModules;
      const textBytes = Buffer.from(text, 'utf8');
      const buf = Buffer.concat([
        Buffer.from([0x1b, 0x32]),               // ESC 2 default line spacing
        textBytes,
        Buffer.from([0x0a, 0x0a, 0x0a, 0x0a]),  // tailing lines
        Buffer.from([0x1b, 0x69]),               // ESC i full cut
      ]);
      RNBLEPrinter.printRawData(buf.toString('base64'), () => {});
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      this.connectedDevice = null;
      throw error;
    } finally {
      this.isPrinting = false;
    }
  }
}

export const thermalPrinterService = new ThermalPrinterService();
