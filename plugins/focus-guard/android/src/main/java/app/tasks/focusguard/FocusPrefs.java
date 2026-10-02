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
    private static final String KEY_FOCUS_UNTIL = "focus_until";

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

    /** End of the current focus session (epoch ms), or 0. Shorts are blocked until then. */
    static long focusUntil(Context context) {
        return prefs(context).getLong(KEY_FOCUS_UNTIL, 0L);
    }

    static void setFocusUntil(Context context, long until) {
        prefs(context).edit().putLong(KEY_FOCUS_UNTIL, until).apply();
    }

    static boolean inFocus(Context context) {
        return System.currentTimeMillis() < focusUntil(context);
    }

    /** Block Shorts if the always-on switch is on, or during a focus session. */
    static boolean shouldBlockShorts(Context context) {
        return blockShorts(context) || inFocus(context);
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
