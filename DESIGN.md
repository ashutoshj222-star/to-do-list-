# DESIGN.md — Tasks

A design system for a calm, Apple‑inspired personal to‑do app. Written in the
[awesome-design-md](https://github.com/VoltAgent/awesome-design-md) format so any
AI coding agent can read it and keep new screens consistent.

## 1. Visual Theme & Atmosphere

- **Mood:** quiet, focused, native. The app should feel like a built‑in phone app,
  not a website.
- **Density:** comfortable. One idea per row, generous tap targets (≥ 44 px).
- **Philosophy:** content first. Chrome (headers, buttons) recedes; the task list is
  the hero. No decoration that doesn't help you finish a task.
- **Light and dark** follow the system setting automatically.

## 2. Color Palette & Roles

| Token          | Light                    | Dark                     | Role                                   |
| -------------- | ------------------------ | ------------------------ | -------------------------------------- |
| `--bg`         | `#F2F2F7`                | `#000000`                | App background (grouped)               |
| `--group`      | `#FFFFFF`                | `#1C1C1E`                | Cards / grouped list rows              |
| `--sheet-bg`   | `#F2F2F7`                | `#1C1C1E`                | Bottom‑sheet background                |
| `--sheet-group`| `#FFFFFF`                | `#2C2C2E`                | Rows inside a sheet                    |
| `--text`       | `#000000`                | `#FFFFFF`                | Primary text                           |
| `--text-2`     | `rgba(60,60,67,.60)`     | `rgba(235,235,245,.60)`  | Secondary text, metadata               |
| `--text-3`     | `rgba(60,60,67,.30)`     | `rgba(235,235,245,.30)`  | Placeholders, empty checkbox ring      |
| `--sep`        | `rgba(60,60,67,.18)`     | `rgba(84,84,88,.55)`     | Hairline separators                    |
| `--fill`       | `rgba(118,118,128,.12)`  | `rgba(118,118,128,.24)`  | Segmented control track, chips         |
| `--accent`     | `#007AFF`                | `#0A84FF`                | Primary actions, checked state, links  |
| `--red`        | `#FF3B30`                | `#FF453A`                | Overdue, destructive                   |
| `--orange`     | `#FF9500`                | `#FF9F0A`                | Flag                                   |
| `--green`      | `#34C759`                | `#30D158`                | Switch "on"                            |

Rules: one accent color only. Red is reserved for *overdue* and *delete*. Never use
color alone to convey state — pair it with text or an icon.

## 3. Typography Rules

- **Family:** system stack — `-apple-system, BlinkMacSystemFont, "SF Pro Text",
  "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. No web fonts (the app
  must work fully offline).
- **Scale:**
  - Large title — 34 px / 700 / letter‑spacing −0.02em
  - Section title — 20 px / 700
  - Body (task title) — 17 px / 400
  - Callout (notes, metadata) — 15 px / 400
  - Footnote (eyebrow date, hints) — 13 px / 500
- Numbers that line up (times) use `font-variant-numeric: tabular-nums`.

## 4. Component Stylings

- **Segmented control:** `--fill` track, 9 px radius, 2 px inset; selected segment is
  a raised pill (`--group` light / `#636366` dark) with a soft shadow.
- **Task row:** 22 px circular checkbox (1.5 px `--text-3` ring) · title · one line
  of metadata in `--text-2`. Overdue time turns `--red`. Completed: filled
  `--accent` circle with a white check, title fades to `--text-2`.
- **Grouped list:** rows inside a `--group` card, 12 px radius, hairline separators
  inset to align with the title (not the checkbox).
- **Quick add bar:** floating pill at the bottom (`--group`, level‑2 shadow) with
  an AI button (✦, `--indigo` on `--fill`), a borderless text field ("Add a task"),
  and a round `--accent` add button. Enter adds a task; tapping + with no text
  opens the full editor.
- **Steps:** a checklist inside a task. 20 px circular checks, strike‑through when
  done, and an "Add a step" row with an accent "+".
- **Assistant chat:** tall sheet. User bubbles are `--accent` with white text and
  right‑aligned; AI bubbles use `--sheet-group` and are left‑aligned. Actions the AI
  took show as small `--fill` pills with a green check ("Added "Call the bank"").
  The input is a rounded field with a round send button.
- **Bottom sheet:** slides up, 14 px top radius, iOS‑style header
  (`Cancel` · title · `Save`), content in grouped rows.
- **Switch:** 51 × 31 iOS toggle, `--green` when on.
- **Toast:** dark translucent pill above the New Task button, optional `Undo` action
  in `--accent`.

## 5. Layout Principles

- Single column, `max-width: 640px`, centered. 16 px side gutters.
- Spacing scale: 4 · 8 · 12 · 16 · 20 · 28 · 36.
- Respect safe areas (`env(safe-area-inset-*)`) for notch and home indicator.
- Sticky header with a translucent blurred background.

## 6. Depth & Elevation

- Level 0: background. Level 1: grouped cards (no shadow — separation by color).
- Level 2: floating button and toast — `0 8px 24px rgba(0,0,0,.18)`.
- Level 3: sheets — backdrop `rgba(0,0,0,.35)`.

## 7. Motion

- 200–320 ms, `cubic-bezier(.32,.72,0,1)` (iOS sheet curve).
- Completing a task: checkbox fills, row fades, then collapses.
- Honor `prefers-reduced-motion: reduce` — disable transitions.

## 8. Do's and Don'ts

- ✅ Do keep one primary action per screen (on the list screen, adding a task).
- ✅ Do show every change the AI makes, in plain words.
- ✅ Do use plain language: "Tomorrow, 9:00 AM", not ISO dates.
- ✅ Do offer Undo instead of confirmation dialogs.
- ❌ Don't add gradients, heavy borders or more than one accent.
- ❌ Don't hide important actions behind long‑press only.

## 9. Responsive Behavior

- Phone first (360–430 px). On tablets/desktop the column stays 640 px wide and the
  sheet becomes a centered card.
- Minimum tap target 44 × 44 px.

## 10. Agent Prompt Guide

> "Build this screen using DESIGN.md: system font, grouped inset lists on `--bg`,
> one `--accent` color, 34 px large title, iOS bottom sheet for editing, support
> light and dark via the tokens above, and keep it usable offline."
