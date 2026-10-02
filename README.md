# Tasks: a simple to-do app with an AI assistant

A clean, Apple-style to-do list for planning your day and tomorrow. It runs
offline on your phone and keeps your data on your own device. There's no
account and no server. Connect any AI model with an API key and the built-in
assistant can add, organise and complete tasks for you, and explain how to get
them done.

- **Quick add bar**: type a task, press enter, done
- **Today / Tomorrow / Later / Done** lists, with "1 of 4 done" progress and a "Done today" section
- **Steps**: a checklist inside every task (write them yourself, or let AI suggest them)
- **AI assistant** (✦ button): works with Claude, ChatGPT, Gemini, OpenRouter, Groq, or a free local model on your computer (Ollama / LM Studio)
- Optional **reminders** with **Mark done** and **Snooze 10 min** buttons in the notification
- **Repeat** daily, on weekdays, or weekly; mark tasks **Important**
- **Undo** for complete and delete; **backup** to a JSON file
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

## Connect an AI model

1. Open **Settings** (the **⋯** button) and go to **AI model**.
2. Pick a **Provider** and paste your **API key**:

   | Provider | Where to get a key | Notes |
   | --- | --- | --- |
   | Claude (Anthropic) | console.anthropic.com → API keys | Default model `claude-opus-5-5` |
   | ChatGPT (OpenAI) | platform.openai.com → API keys | |
   | Gemini (Google) | aistudio.google.com → Get API key | Has a free tier |
   | OpenRouter | openrouter.ai → Keys | One key for hundreds of models |
   | Groq | console.groq.com → API keys | Very fast |
   | Ollama / LM Studio | No key needed | Free, runs on your own computer |
   | Other | Any OpenAI-compatible API | Enter its URL |

3. Tap **Load models** and pick one (or type a model name), then tap **Test connection**.
4. Tap **✦** next to the add bar and talk to it.

Things you can say:

- "Tomorrow: call the bank at 3pm, buy groceries, gym at 7am." It adds the tasks, with reminders for the ones that have a time.
- "Plan my day." It looks at your tasks and suggests an order and timing.
- "How do I finish the tax return?" You get practical steps, which it can save into the task as a checklist.
- "I finished the report." It ticks the task off.

Inside a task, **Suggest steps with AI** writes a checklist for it, and
**Ask AI how to get this done** opens the assistant about that task.

**Privacy and cost.** Your API key is saved only on this phone and is only
sent to the provider you picked. Backups never include it. When you use the
assistant, your tasks are sent to that provider so it can help, and usage is
billed by them. With Ollama or LM Studio, everything stays on your own
computer and Wi-Fi.

**Running a model on your computer (free).** Install
[Ollama](https://ollama.com), download a model (for example `ollama pull llama3.2`),
and start it so your phone can reach it: `OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve`.
In the app, pick **Ollama**, set the Server URL to your computer's Wi-Fi address
(for example `http://192.168.1.10:11434/v1`), then load models. Small local models
can chat, but some can't use tools, so they may not be able to change your tasks.

Without an AI key, the assistant offers to **share** your task or day plan to
the ChatGPT or Claude app on your phone instead.

## Focus timer

Tap the **timer** button at the top. Pick **15 min, 25 min, 45 min, 1 hour, 2 hours**
or **Custom** (any hours and minutes), optionally choose the task you're working
on, and tap **Start**. The countdown shows at the top of the app. You can add 5
minutes or end early. When time is up you get a notification, and if you picked a
task the app asks whether to mark it done. In the Android app, **YouTube Shorts
are blocked while the timer runs** (after the one-time setup below), even if the
always-on switch is off.

## Focus: block YouTube Shorts (Android app)

Turn on **Settings → Focus → Block YouTube Shorts** and Shorts close the moment
they open, whether you tap the Shorts tab, a Short in your feed, or a Shorts
link. Normal YouTube videos aren't affected.

One-time setup (the app shows the same two steps):

1. **Only if Android says the setting is "restricted"** (Android 13+, apps
   installed from a file): tap **Step 1**, then in App info tap **⋮** at the top
   right → **Allow restricted settings**.
2. Tap **Step 2**, open **Installed apps** (or *Downloaded apps*) →
   **Tasks · Block YouTube Shorts** → turn it on.

How it works: an Android Accessibility service that is limited to the YouTube
app. It only checks whether the Shorts player is on screen, and if it is, it
presses Back. It doesn't read, store or send anything else. If a YouTube update
ever renames the Shorts player, add the new name to `SHORTS_VIEW_IDS` in
`plugins/focus-guard/android/src/main/java/app/tasks/focusguard/ShortsBlockerService.java`.
It doesn't block Shorts on youtube.com in a browser.

## Connecting other AI apps (MCP, later)

You can also let outside AI apps such as Claude Desktop or ChatGPT control your
tasks. Nothing is required for this now.

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
        "steps": [{ "id": "…", "text": "Find account number", "done": false }],
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
  app.js             tasks, lists, steps, reminders, assistant UI, backup
  ai.js              AI connector: Claude + OpenAI-compatible APIs, tool calling
  sw.js              offline cache and notification buttons
  manifest.webmanifest
  icons/
assets/              source images for the Android icon and splash screen
plugins/focus-guard/ native Android plugin: YouTube Shorts blocker (accessibility service)
scripts/             patch-android.mjs (permissions), make-icons.mjs (renders icons)
capacitor.config.json  wraps www/ as a native Android/iOS app
.github/workflows/   android.yml (builds APK), pages.yml (optional web link)
DESIGN.md            the design system
```

## Privacy

Your tasks are stored in the app's local storage on your device. The app
makes no network requests of its own. Data only leaves your phone when you
use the AI assistant, and then it goes only to the provider you configured,
or when you share a task to another app.
