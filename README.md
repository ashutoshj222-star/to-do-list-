# Tasks: a simple to-do app with reminders

A clean, Apple-style to-do list for planning your day and tomorrow. It runs
fully offline on your phone, sends reminder notifications, and keeps all your
data on your own device. There's no account, no cloud and no server.

- **Today / Tomorrow / Upcoming / Done** lists
- **Reminders** at the date and time you choose, with **Mark done** and **Snooze 10 min** buttons right in the notification
- **Repeat** daily, on weekdays, or weekly
- **Flags** for important tasks, **notes** for details
- **Undo** for complete and delete
- **Ask AI**: one tap sends a task (or your whole day) to ChatGPT, Claude or any AI app on your phone and asks for a step-by-step plan
- **Backup**: export and import a JSON file
- Light and dark mode follow your phone's setting

The design follows [`DESIGN.md`](DESIGN.md), a design system written in the
[awesome-design-md](https://github.com/VoltAgent/awesome-design-md) format.

---

## Put it on your phone

### Android (recommended, reminders work even when the app is closed)

Every push to this repo builds an installable app automatically:

1. Open this repo on GitHub, go to the **Actions** tab, and open the latest **Build Android app** run.
2. Under **Artifacts**, download **tasks-android-apk**. It's a zip file, and `Tasks.apk` is inside it.
3. Copy `Tasks.apk` to your phone and open it. Allow "Install unknown apps" when Android asks.
4. Open **Tasks**. The first time you set a reminder, tap **Allow** for notifications.

> **Updating later:** without your own signing key, each build is signed with a
> different temporary key, so to install a newer version you have to uninstall
> the old one first, and **that deletes your tasks**. Do **Settings → Export
> Backup** before you update, then **Import Backup** afterwards. If you set up a
> signing key once (see [below](#optional-your-own-signing-key)), updates
> install over the old version and your data stays.

### iPhone, or any phone through the browser

The app is also a PWA (an installable web app). It needs to be opened from an
`https://` link once. After that it works offline.

1. Enable GitHub Pages once: **Settings → Pages → Source: GitHub Actions**.
2. Go to **Actions → Publish web app → Run workflow**.
3. Open the link it prints on your phone. Then:
   - iPhone (Safari): **Share → Add to Home Screen**
   - Android (Chrome): **⋮ → Install app**

Only the app's code is published. Your tasks are never uploaded; they stay in each phone's storage.

> **Browser limitation:** web apps can only show reminders while the app is open
> or was used recently. Phones pause closed web apps. For reminders you can rely
> on, use the Android app above.

### Try it on your computer

```bash
npm start            # serves www/ at http://localhost:8080
```

or just `python3 -m http.server 8080 -d www`.

---

## Using AI with your tasks (works today)

- Open a task and tap **Ask AI how to finish this**.
- Or tap **Plan tomorrow with AI** at the bottom of the Tomorrow list.

The app writes a prompt containing your task, notes and deadline, then opens
your phone's share sheet. Pick ChatGPT, Claude or Gemini and you'll get a
step-by-step plan. On a computer, the prompt is copied to your clipboard
instead.

## Connecting AI later (MCP)

The app is ready for this whenever you want it. Nothing is required now.

- **Plain data format.** *Settings → Export Backup* saves everything as JSON:

  ```json
  {
    "app": "tasks",
    "version": 1,
    "tasks": [
      {
        "id": "…", "title": "Call bank", "notes": "",
        "date": "2026-10-03", "time": "15:30",
        "remind": true, "repeat": "none", "flagged": false,
        "done": false, "doneAt": null, "createdAt": 1759390000000, "updatedAt": 1759390000000
      }
    ]
  }
  ```

- **A built-in JavaScript API.** `window.TasksAPI` has `list()`, `add()`,
  `update()`, `complete()`, `remove()`, `export()`, `import()` and `taskPrompt()`.
  An AI agent, a browser extension or a future sync layer can drive the app through it.

- **Next step when you're ready:** a small MCP server (for ChatGPT, Claude and
  others) that exposes `list_tasks`, `add_task`, `complete_task` and
  `plan_my_day` on top of this JSON format. An AI could then read what you wrote
  for tomorrow, break it into steps, and add or update tasks for you.

---

## Optional: your own signing key

This is a one-time setup that lets new versions install over the old one
without losing data. It needs Java (`keytool`) on any computer:

```bash
keytool -genkeypair -v -keystore tasks.jks -alias tasks -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 tasks.jks > tasks.jks.b64      # on macOS: base64 -i tasks.jks -o tasks.jks.b64
```

In GitHub, open **Settings → Secrets and variables → Actions** and add these four secrets:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | contents of `tasks.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | `tasks` |
| `ANDROID_KEY_PASSWORD` | the key password (usually the same) |

Keep `tasks.jks` somewhere safe. If you lose it, you can't update the
installed app without uninstalling it first.

## Build the Android app yourself (optional)

This needs Node 22, JDK 21 and the Android SDK (Android Studio installs it).

```bash
npm install
npm run android:init     # creates android/, adds permissions and icons
npm run android:build    # APK at android/app/build/outputs/apk/debug/app-debug.apk
# or: npm run android:open  (opens Android Studio to run it on a connected phone)
```

After you change anything in `www/`, run `npm run android:sync`.

## Project layout

```
www/                 the app (plain HTML/CSS/JS, no build step)
  index.html         screens and sheets
  styles.css         design tokens and components (see DESIGN.md)
  app.js             tasks, lists, reminders, AI prompts, backup
  sw.js              offline cache and notification buttons
  manifest.webmanifest
  icons/
assets/              source images for the Android icon and splash screen
scripts/             patch-android.mjs (permissions), make-icons.mjs (renders icons)
capacitor.config.json  wraps www/ as a native Android/iOS app
.github/workflows/   android.yml (builds APK), pages.yml (optional web link)
DESIGN.md            the design system
```

## Privacy

Your tasks are stored in the app's local storage on your device. The app
makes no network requests. The only time anything leaves your phone is when
you tap an **Ask AI** button and choose an app to share with.
