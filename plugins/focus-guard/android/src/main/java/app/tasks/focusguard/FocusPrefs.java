package app.tasks.focusguard;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Settings shared between the plugin (app UI) and the accessibility service. */
final class FocusPrefs {

    private static final String FILE = "focus_guard";
    private static final String KEY_BLOCK_SHORTS = "block_shorts";
    private static final String KEY_COUNT_DAY = "count_day";
    private static final String KEY_COUNT = "count";

    private FocusPrefs() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    private static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static boolean blockShorts(Context context) {
        return prefs(context).getBoolean(KEY_BLOCK_SHORTS, false);
    }

    static void setBlockShorts(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_BLOCK_SHORTS, enabled).apply();
    }

    static int blockedToday(Context context) {
        SharedPreferences p = prefs(context);
        return today().equals(p.getString(KEY_COUNT_DAY, "")) ? p.getInt(KEY_COUNT, 0) : 0;
    }

    static void recordBlock(Context context) {
        int count = blockedToday(context) + 1;
        prefs(context).edit().putString(KEY_COUNT_DAY, today()).putInt(KEY_COUNT, count).apply();
    }
}
