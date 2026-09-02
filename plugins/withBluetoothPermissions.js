const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBluetoothPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainApplication = manifest.manifest;

    if (!mainApplication['uses-permission']) {
      mainApplication['uses-permission'] = [];
    }

    const existing = mainApplication['uses-permission'].map(
      (p) => p.$?.['android:name']
    );

    const toAdd = [
      // Android 12+ (API 31+)
      {
        $: {
          'android:name': 'android.permission.BLUETOOTH_SCAN',
          'android:usesPermissionFlags': 'neverForLocation',
        },
      },
      {
        $: {
          'android:name': 'android.permission.BLUETOOTH_CONNECT',
        },
      },
      // Android < 12
      {
        $: { 'android:name': 'android.permission.BLUETOOTH' },
      },
      {
        $: { 'android:name': 'android.permission.BLUETOOTH_ADMIN' },
      },
      {
        $: { 'android:name': 'android.permission.ACCESS_FINE_LOCATION' },
      },
    ];

    for (const perm of toAdd) {
      const name = perm.$['android:name'];
      if (!existing.includes(name)) {
        mainApplication['uses-permission'].push(perm);
      } else {
        // update entry yang sudah ada (tambah flag kalau belum ada)
        const idx = mainApplication['uses-permission'].findIndex(
          (p) => p.$?.['android:name'] === name
        );
        if (idx !== -1 && perm.$['android:usesPermissionFlags']) {
          mainApplication['uses-permission'][idx].$['android:usesPermissionFlags'] =
            perm.$['android:usesPermissionFlags'];
        }
      }
    }

    return config;
  });
};
