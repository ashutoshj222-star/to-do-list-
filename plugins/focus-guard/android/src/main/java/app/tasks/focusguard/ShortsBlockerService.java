package app.tasks.focusguard;

import android.accessibilityservice.AccessibilityService;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Toast;
import java.util.ArrayDeque;
import java.util.List;

/**
 * Backs out of YouTube Shorts as soon as the Shorts player appears.
 *
 * The service is limited to the YouTube app in res/xml/focus_guard_service.xml.
 * It only looks for the Shorts player's view ids; it doesn't read text or keep anything.
 */
public class ShortsBlockerService extends AccessibilityService {

    private static final String YOUTUBE = "com.google.android.youtube";

    // View ids YouTube uses for the Shorts player (they have been stable for years,
    // but YouTube can rename them in an update; add new ones here if that happens).
    private static final String[] SHORTS_VIEW_IDS = {
        "reel_recycler",
        "reel_player_page_container",
        "reel_watch_player",
        "reel_watch_fragment_root",
        "shorts_player_container",
    };

    private static final long MIN_INTERVAL_MS = 700;
    private static final int MAX_NODES_SCANNED = 400;

    private long lastBlockAt = 0;
    private long lastToastAt = 0;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        if (!YOUTUBE.contentEquals(event.getPackageName())) return;
        if (!FocusPrefs.blockShorts(this)) return;

        long now = SystemClock.elapsedRealtime();
        if (now - lastBlockAt < MIN_INTERVAL_MS) return;

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null || !YOUTUBE.contentEquals(root.getPackageName())) return;

        if (isShortsOnScreen(root)) {
            lastBlockAt = now;
            performGlobalAction(GLOBAL_ACTION_BACK);
            FocusPrefs.recordBlock(this);
            if (now - lastToastAt > 4000) {
                lastToastAt = now;
                Toast.makeText(this, "Shorts blocked · stay focused", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private boolean isShortsOnScreen(AccessibilityNodeInfo root) {
        // Fast path: look the ids up directly.
        for (String id : SHORTS_VIEW_IDS) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(YOUTUBE + ":id/" + id);
            if (nodes == null) continue;
            for (AccessibilityNodeInfo node : nodes) {
                if (node != null && node.isVisibleToUser()) return true;
            }
        }
        // Fallback: a short breadth-first scan for any visible "reel_" container
        // that fills most of the screen (catches renamed ids).
        ArrayDeque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
        queue.add(root);
        int scanned = 0;
        android.graphics.Rect rootBounds = new android.graphics.Rect();
        root.getBoundsInScreen(rootBounds);
        android.graphics.Rect bounds = new android.graphics.Rect();
        while (!queue.isEmpty() && scanned++ < MAX_NODES_SCANNED) {
            AccessibilityNodeInfo node = queue.poll();
            if (node == null) continue;
            String id = node.getViewIdResourceName();
            if (id != null && id.startsWith(YOUTUBE + ":id/reel_") && node.isVisibleToUser()) {
                node.getBoundsInScreen(bounds);
                if (bounds.height() > rootBounds.height() * 0.6 && bounds.width() > rootBounds.width() * 0.8) return true;
            }
            for (int i = 0; i < node.getChildCount(); i++) queue.add(node.getChild(i));
        }
        return false;
    }

    @Override
    public void onInterrupt() {}
}
