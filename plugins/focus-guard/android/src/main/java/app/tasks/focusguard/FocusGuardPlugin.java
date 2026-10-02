package app.tasks.focusguard;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.text.TextUtils;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JavaScript bridge: Capacitor.Plugins.FocusGuard */
@CapacitorPlugin(name = "FocusGuard")
public class FocusGuardPlugin extends Plugin {

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void setBlockShorts(PluginCall call) {
        FocusPrefs.setBlockShorts(getContext(), Boolean.TRUE.equals(call.getBoolean("enabled", false)));
        call.resolve(status());
    }

    /** Block Shorts until the given time (epoch ms), even if the always-on switch is off. */
    @PluginMethod
    public void startFocus(PluginCall call) {
        Double until = call.getDouble("until", 0.0);
        FocusPrefs.setFocusUntil(getContext(), until == null ? 0L : until.longValue());
        call.resolve(status());
    }

    @PluginMethod
    public void stopFocus(PluginCall call) {
        FocusPrefs.setFocusUntil(getContext(), 0L);
        call.resolve(status());
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        startSettings(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        call.resolve();
    }

    /** App info screen, where Android 13+ hides "Allow restricted settings" for sideloaded apps. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        startSettings(intent);
        call.resolve();
    }

    private void startSettings(Intent intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private JSObject status() {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("serviceEnabled", isServiceEnabled(context));
        result.put("blockShorts", FocusPrefs.blockShorts(context));
        result.put("blockedToday", FocusPrefs.blockedToday(context));
        result.put("focusUntil", FocusPrefs.focusUntil(context));
        return result;
    }

    private static boolean isServiceEnabled(Context context) {
        String enabled = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(enabled)) return false;
        ComponentName mine = new ComponentName(context, ShortsBlockerService.class);
        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(enabled);
        for (String entry : splitter) {
            ComponentName other = ComponentName.unflattenFromString(entry);
            if (mine.equals(other)) return true;
        }
        return false;
    }
}
