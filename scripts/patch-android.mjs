// Adds the Android permissions reminders need, after `npx cap add android`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const file = 'android/app/src/main/AndroidManifest.xml';
let xml = readFileSync(file, 'utf8');
const permissions = [
  'android.permission.POST_NOTIFICATIONS', // Android 13+: show notifications
  'android.permission.USE_EXACT_ALARM', // fire reminders at the exact minute
  'android.permission.RECEIVE_BOOT_COMPLETED', // keep reminders after a restart
  'android.permission.WAKE_LOCK',
];
const missing = permissions.filter((p) => !xml.includes(`"${p}"`));
if (missing.length) {
  const lines = missing.map((p) => `    <uses-permission android:name="${p}" />`).join('\n');
  xml = xml.replace(/<\/manifest>\s*$/, `${lines}\n</manifest>\n`);
  writeFileSync(file, xml);
}
console.log(missing.length ? `Added: ${missing.join(', ')}` : 'Permissions already present');

// Monochrome status-bar icon for reminders (referenced as "smallIcon" in capacitor.config.json).
mkdirSync('android/app/src/main/res/drawable', { recursive: true });
writeFileSync('android/app/src/main/res/drawable/ic_stat_notify.xml', `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd"
        android:pathData="M12,2A10,10 0 1,0 12,22A10,10 0 1,0 12,2Z M10.2,16.2L6.3,12.3L7.7,10.9L10.2,13.4L16.3,7.3L17.7,8.7Z" />
</vector>
`);
