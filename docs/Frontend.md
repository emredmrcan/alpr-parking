# Frontend Specification — ALPR Parking Admin Panel

## Overview

A browser-based admin panel for managing a Turkish licence-plate parking system.
The operator uploads car images, reviews the detected plate, confirms or corrects it,
then tracks sessions from entry through to payment.

The UI runs locally (same machine as the API) at `http://localhost:8000`.  
Backend: FastAPI at `/api/*`.

---

## Design Principles

- **No gradients.** Buttons, cards, and backgrounds are flat.
- **Monochromatic base** — white `#FFFFFF`, surface `#F8F9FA`, border `#E2E8F0`, text `#0F172A`.
- **One accent colour** — `#2563EB` (blue-600). Used only for primary actions and active states.
- **Destructive colour** — `#DC2626` (red-600). Used only for delete and error states.
- **Success colour** — `#16A34A` (green-600). Used only for PAID badges and success states.
- **Typography** — Inter (Google Fonts). Sizes: 12 / 14 / 16 / 20 / 24 px. Line height 1.5.
- **Border radius** — `6px` everywhere (inputs, buttons, cards, badges). No pill shapes.
- **Shadows** — `0 1px 3px rgba(0,0,0,0.08)` for cards only. No drop shadows on buttons.
- **Spacing grid** — 4 px base unit. Use multiples: 8, 12, 16, 20, 24, 32, 48 px.
- **Icons** — Lucide React (stroke icons). 18 px inside buttons, 16 px inline.
- **Button styles**:
  - Primary: `background #2563EB, color white, no shadow`
  - Secondary: `background white, border 1px solid #E2E8F0, color #0F172A`
  - Destructive: `background #DC2626, color white`
  - All buttons: `height 36px, padding 0 16px, font-weight 500, border-radius 6px`
  - Hover: darken background by one shade (`#1D4ED8` for primary)
  - Disabled: `opacity 0.5, cursor not-allowed`

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | React 18 + Vite | Fast HMR, simple setup |
| Language | TypeScript | Type safety across API calls |
| Styling | Tailwind CSS v4 | Utility-first, easy to constrain design |
| State | Zustand | Minimal, no boilerplate |
| Data fetching | TanStack Query v5 | Cache, loading states, refetch |
| Routing | React Router v6 | SPA navigation |
| Tables | TanStack Table v8 | Headless, full control |
| Forms | React Hook Form + Zod | Validation |
| Toast/notifications | Sonner | Non-blocking, minimal |
| Date formatting | date-fns | Lightweight |
| HTTP client | Axios | Interceptors for error handling |

---

## Application Shell

```
┌──────────────────────────────────────────────────────────────────┐
│  ALPR Parking     [nav items]                          [clock]   │  ← top nav, h=56px
├────────────┬─────────────────────────────────────────────────────┤
│            │                                                       │
│  Sidebar   │  Page content area                                   │
│  (240px)   │                                                       │
│            │                                                       │
└────────────┴─────────────────────────────────────────────────────┘
```

### Top Navigation Bar
- Height: 56 px, background: `#FFFFFF`, bottom border: `1px solid #E2E8F0`
- Left: logo + "ALPR Parking" in 16px semibold
- Right: live clock updating every second (`HH:mm:ss`, Turkish locale)

### Sidebar
- Width: 240 px, background: `#F8F9FA`, right border: `1px solid #E2E8F0`
- Items:
  - Dashboard (icon: `LayoutDashboard`)
  - New Session (icon: `PlusCircle`) — primary workflow
  - Active Sessions (icon: `Car`)
  - All Sessions (icon: `ClipboardList`)
  - Pricing (icon: `CircleDollarSign`)
- Active item: `background #EFF6FF, color #2563EB, font-weight 600`
- Inactive: `color #64748B`

---

## Pages

---

### 1. Dashboard `/`

**Purpose:** Quick operational overview.

**Layout:** 4 stat cards on top row, then 2-column grid (active sessions table + recent activity).

#### Stat Cards
```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Active Now       │  │  Total Today      │  │  Revenue Today    │  │  Avg Duration     │
│  ──────           │  │  ──────           │  │  ──────           │  │  ──────           │
│  12               │  │  47               │  │  ₺1,240           │  │  1h 23m           │
└──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘
```
- Card: `border 1px solid #E2E8F0, border-radius 6px, padding 20px, background white`
- Label: 12px, `color #64748B`, uppercase, letter-spacing 0.05em
- Value: 28px, `font-weight 700, color #0F172A`
- Auto-refreshes every 30 seconds

#### Active Sessions Table (bottom-left, ~65% width)
Columns: Plate | Entrance | Duration | Fee (live) | Actions  
- Duration and fee calculate in real time (client-side ticker, no polling)
- Row actions: "Process Exit" button → opens the Exit modal directly

#### Recent Completed Sessions (bottom-right, ~35%)
Last 10 PAID sessions. Read-only list. Plate | Duration | Paid.

---

### 2. New Session `/new-session`

**Purpose:** The primary admin workflow. Upload image → review plate → confirm entry.

```
┌──────────────────────────────────────────────────────────────┐
│  New Session                                                   │
│  ────────────────────────────────────────────────────────     │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  STEP 1: Upload Image                                    │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │                                                     │ │  │
│  │  │          Drag & drop or click to upload             │ │  │
│  │  │          Supports JPEG, PNG, WebP · Max 20 MB       │ │  │
│  │  │                                                     │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  │                                                          │  │
│  │  [After upload — preview + recognition result appears]  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  STEP 2: Review & Confirm                                │  │
│  │                                                          │  │
│  │  Detected Plate                                          │  │
│  │  ┌──────────────────────────┐  ✓ Valid Turkish plate    │  │
│  │  │  34 ABC 1234             │                           │  │
│  │  └──────────────────────────┘                           │  │
│  │  (edit if OCR was wrong)                                │  │
│  │                                                          │  │
│  │  [ Manual entry? ]  (toggle — hides upload step)        │  │
│  │                                                          │  │
│  │              [ CONFIRM ENTRY ]                           │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

#### Step 1: Image Upload Zone
- Drop zone: dashed border `2px dashed #CBD5E1`, border-radius 6px, height 180px
- On hover: border-color `#2563EB`, background `#EFF6FF`
- On file selected: show image preview (max-height 200px, object-fit contain) in the zone
- While recognising: overlay spinner on the preview + "Recognising plate…" text
- On success: show result panel (Step 2 animates in)
- On error (no plate found): show amber inline banner "No plate detected — enter manually below"

#### Step 2: Review Panel
- Plate input field: 
  - `height 48px, font-size 22px, font-weight 600, font-family monospace`
  - `letter-spacing 0.1em, text-transform uppercase`
  - Auto-populated from OCR result; always editable
- Validation badge (right of field):
  - `✓ Valid Turkish plate` — green text + green check icon
  - `⚠ Format not recognised` — amber text + warning icon
  - Updates live as user types
- Confidence chip (below field, small): `OCR confidence: 87%` — shown only when OCR ran
- "Manual entry" toggle: clicking it skips upload, sets `entered_manually = true`
- **CONFIRM ENTRY** button:
  - Full-width, primary style, height 44px, font-size 16px
  - Disabled until plate field has ≥5 characters
  - On click: `POST /api/sessions`
  - On success: show full-page success flash ("Session created — car entered"), reset form
  - On 409 conflict: show error banner "An active session already exists for this plate"

#### Duplicate plate guard
If `GET /api/sessions/plate/{plate}` returns a session while user is typing (debounced 500ms):
- Show amber banner under the input: "⚠ This plate has an active session since HH:mm. Processing exit instead?"
- Show "Go to exit" link button → opens Exit modal pre-filled with that plate

---

### 3. Active Sessions `/active`

**Purpose:** See all currently parked cars. Process exits from here.

```
┌──────────────────────────────────────────────────────────────┐
│  Active Sessions        [Search by plate…]       2 cars       │
│  ─────────────────────────────────────────────────────────── │
│  Plate        Entrance       Duration      Fee (live)  Action │
│  ─────────────────────────────────────────────────────────── │
│  34 ABC 1234  09:14          2h 07m        ₺35.00     [Exit]  │
│  06 XY 567    11:32          0h 45m        ₺20.00     [Exit]  │
└──────────────────────────────────────────────────────────────┘
```

- Duration and fee columns update every 60 seconds without a network call (client-side)
- Fee recalculates against the pricing rules loaded once at mount
- **[Exit]** button → opens the **Exit Modal** for that session

#### Exit Modal
```
┌────────────────────────────────────────┐
│  Process Exit                     [×]  │
│  ─────────────────────────────────     │
│  Plate:      34 ABC 1234               │
│  Entered:    09:14 — 2h 07m ago        │
│  Amount due: ₺35.00                    │
│                                        │
│  Amount collected  ┌──────────────┐    │
│  (₺)               │ 35.00        │    │
│                    └──────────────┘    │
│  (change if driver paid different)     │
│                                        │
│  Upload exit image (optional)          │
│  ┌───────────────────────────────────┐ │
│  │  [ Choose file ]  No file chosen  │ │
│  └───────────────────────────────────┘ │
│                                        │
│  Notes (optional) ┌───────────────┐   │
│                   │               │   │
│                   └───────────────┘   │
│                                        │
│      [ Cancel ]  [ CONFIRM EXIT ]      │
└────────────────────────────────────────┘
```

- Amount collected field: pre-filled with `amount_due`, editable
  - If user changes the value: show small note "Difference: ₺-5.00"
- On CONFIRM EXIT: `POST /api/sessions/{id}/exit`
- On success: close modal, remove row from table, show toast "Session closed — ₺35.00 collected"

---

### 4. All Sessions `/sessions`

**Purpose:** Full history — searchable, filterable, read-only.

#### Filters Bar
```
[ Search plate… ]   [ Status ▼ ]   [ Date range … ]   [ Clear ]
```

#### Table Columns
| # | Plate | Entrance | Exit | Duration | Due | Paid | Diff | Status | Manual | Actions |
|---|-------|----------|------|----------|-----|------|------|--------|--------|---------|

- **Diff** column: if `amount_paid ≠ amount_due`, show the delta in amber. Empty otherwise.
- **Status** badge:
  - `ACTIVE` — blue background `#DBEAFE`, blue text `#1D4ED8`
  - `PAID` — green background `#DCFCE7`, green text `#15803D`
- **Manual** — small lock icon if `entered_manually === true`
- **Actions**: "View" icon button → opens a read-only detail drawer
- Pagination: 50 rows per page, page controls at bottom

#### Session Detail Drawer (slide-in from right, 400px)
Shows all fields including images (entrance + exit). Read-only.

---

### 5. Pricing `/pricing`

**Purpose:** Configure the fee table.

```
┌──────────────────────────────────────────────────────────────┐
│  Pricing Rules                               [ + Add Rule ]  │
│  ─────────────────────────────────────────────────────────── │
│  From (min)   To (min)      Price (₺)   Label         Action │
│  ─────────────────────────────────────────────────────────── │
│  0            30            0.00        First 30 min   [✏] [🗑]│
│  30           60            20.00       30–60 min      [✏] [🗑]│
│  60           120           35.00       1–2 hours      [✏] [🗑]│
│  120          —             50.00       Over 2 hours   [✏] [🗑]│
└──────────────────────────────────────────────────────────────┘
```

- "To (min)" shows `—` when `duration_to_min` is null (open-ended)
- **[✏] Edit** → inline row editing (fields replace text in place)
- **[🗑] Delete** → confirmation popover "Delete this rule?" before `DELETE /api/pricing/{id}`
- **Add Rule** → opens a small modal form with the same fields

#### Add / Edit Rule Form
```
Duration from (min)  [ 120     ]
Duration to (min)    [ ——      ]  (leave empty for open-ended)
Price (₺)            [ 50.00   ]
Label                [ Over 2 hours ]

                     [ Cancel ]  [ Save ]
```

- Validation: `from` must be ≥ 0, `to` must be > `from` if set, price ≥ 0

---

## Component Inventory

| Component | Location | Notes |
|-----------|----------|-------|
| `<StatCard>` | Dashboard | label + value + optional trend |
| `<PlateInput>` | New Session | monospace, uppercase, live validation badge |
| `<ImageDropzone>` | New Session, Exit Modal | drag-and-drop + preview |
| `<ActiveSessionsTable>` | Active page + Dashboard | live duration/fee ticker |
| `<SessionsTable>` | All Sessions page | paginated, filterable |
| `<ExitModal>` | Active page, Dashboard | amount input + optional image |
| `<SessionDetailDrawer>` | All Sessions page | read-only, shows images |
| `<PricingTable>` | Pricing page | inline edit |
| `<PriceRuleModal>` | Pricing page | add/edit form |
| `<StatusBadge>` | Tables | ACTIVE / PAID |
| `<Toast>` | Global | Sonner instance, top-right |
| `<ConfirmPopover>` | Delete actions | "Are you sure?" inline |
| `<Spinner>` | Async states | 20px stroke spinner |

---

## API Integration Map

| UI Action | HTTP Call | Notes |
|-----------|-----------|-------|
| Upload image | `POST /api/recognize` | `multipart/form-data` |
| Confirm entry | `POST /api/sessions` | Returns new session |
| Check active plate | `GET /api/sessions/plate/{plate}` | Debounced on input |
| List active | `GET /api/sessions?status=ACTIVE` | Refetched every 60s |
| List all | `GET /api/sessions` | With filters |
| Process exit | `POST /api/sessions/{id}/exit` | Body: amount_paid, optional image |
| List pricing | `GET /api/pricing` | Loaded once at app start |
| Add rule | `POST /api/pricing` | |
| Update rule | `PUT /api/pricing/{id}` | |
| Delete rule | `DELETE /api/pricing/{id}` | |
| Serve images | `GET /uploads/{filename}` | Static from FastAPI |

---

## Error Handling

- All API errors caught in Axios response interceptor
- `4xx` errors: show inline error message near the triggering element
- `5xx` errors: show full-page error toast "Server error — try again"
- Network failures: show "Unable to reach server" banner at top of page (sticky)
- `409 Conflict` on session create: handled specially (see New Session page)

---

## State Management (Zustand stores)

```ts
// src/stores/sessionStore.ts
interface SessionStore {
  activeSessions: Session[]
  fetchActive: () => Promise<void>
  lastFetchedAt: Date | null
}

// src/stores/pricingStore.ts
interface PricingStore {
  rules: PriceRule[]
  fetchRules: () => Promise<void>
  computeFee: (durationMinutes: number) => number
}
```

`computeFee` runs entirely client-side against the cached rules — no API call per row.

---

## File Structure (Frontend)

```
frontend/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── api/
    │   ├── client.ts          # Axios instance + interceptors
    │   ├── recognize.ts
    │   ├── sessions.ts
    │   └── pricing.ts
    ├── components/
    │   ├── ui/                # Base components: Button, Input, Badge, Modal, Drawer, Spinner
    │   ├── StatCard.tsx
    │   ├── PlateInput.tsx
    │   ├── ImageDropzone.tsx
    │   ├── ActiveSessionsTable.tsx
    │   ├── SessionsTable.tsx
    │   ├── ExitModal.tsx
    │   ├── SessionDetailDrawer.tsx
    │   ├── PricingTable.tsx
    │   ├── PriceRuleModal.tsx
    │   ├── StatusBadge.tsx
    │   └── ConfirmPopover.tsx
    ├── pages/
    │   ├── Dashboard.tsx
    │   ├── NewSession.tsx
    │   ├── ActiveSessions.tsx
    │   ├── AllSessions.tsx
    │   └── Pricing.tsx
    ├── stores/
    │   ├── sessionStore.ts
    │   └── pricingStore.ts
    └── types/
        └── api.ts             # TypeScript interfaces mirroring backend schemas
```

---

## TypeScript API Types

```ts
// src/types/api.ts

export interface PlateCandidate {
  plate: string
  raw_ocr: string
  confidence: number
  is_valid: boolean
  bbox: number[]
}

export interface RecognitionResult {
  success: boolean
  best: PlateCandidate | null
  candidates: PlateCandidate[]
  image_path: string | null
  error: string | null
}

export interface Session {
  id: number
  plate_number: string
  raw_ocr_text: string | null
  entrance_time: string  // ISO 8601
  exit_time: string | null
  duration_minutes: number | null
  amount_due: string | null  // Decimal as string from Python
  amount_paid: string | null
  status: 'ACTIVE' | 'PAID'
  entered_manually: boolean
  image_path: string | null
  exit_image_path: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PriceSummary {
  session_id: number
  plate_number: string
  entrance_time: string
  duration_minutes: number
  amount_due: string
}

export interface PriceRule {
  id: number
  duration_from_min: number
  duration_to_min: number | null
  price: string
  label: string | null
  created_at: string
}
```

---

## Accessibility

- All interactive elements have accessible labels (`aria-label` or visible text)
- Modal: focus trap, `Escape` to close, `aria-modal="true"`
- Colour is never the only indicator of state (badge also shows text)
- Minimum contrast ratio 4.5:1 for all text

---

## Responsive Behaviour

The admin panel is designed for a **1280×800 minimum** desktop screen (gate kiosk or office monitor).
No mobile breakpoints in v1. The layout does not collapse.

---

## Build & Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxied to localhost:8000)
npm run build      # dist/ → can be served by FastAPI's StaticFiles
```

`vite.config.ts` proxy:
```ts
server: {
  proxy: {
    '/api': 'http://localhost:8000',
    '/uploads': 'http://localhost:8000',
  }
}
```

---

## Internationalisation (i18n)

### Overview

The application defaults to **Turkish** (`tr`). English (`en`) is available as a secondary language.
All UI strings are stored as JSON files on the backend and fetched at app startup — no rebuild needed
to change a label.

### Translation API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/translations` | List available languages |
| `GET` | `/api/translations/{lang}` | Full translation bundle for `lang` |
| `GET` | `/api/translations/{lang}/{namespace}` | Single namespace (e.g. `common`, `nav`) |

**Available languages:** `tr` (Turkish, default), `en` (English)

**Namespace structure:**

```
meta          – language code and display name
app           – app title and tagline
nav           – sidebar navigation labels
dashboard     – dashboard page
newSession    – new session page (upload + confirm entry)
activeSessions – active vehicles page
allSessions   – all sessions page + filters
exitModal     – exit confirmation modal
sessionDetail – session detail drawer
pricing       – pricing management page
status        – ACTIVE / PAID labels
duration      – formatted duration strings
common        – shared labels (buttons, loading, errors)
```

### Frontend Setup

**Package:** `react-i18next` + `i18next`

```bash
npm install react-i18next i18next
```

**`src/i18n.ts`**

```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import axios from 'axios'

const DEFAULT_LANG = 'tr'

export async function initI18n(): Promise<void> {
  const { data: bundle } = await axios.get(`/api/translations/${DEFAULT_LANG}`)

  await i18n.use(initReactI18next).init({
    lng: DEFAULT_LANG,
    fallbackLng: 'en',
    resources: {
      [DEFAULT_LANG]: { translation: bundle },
    },
    interpolation: { escapeValue: false },
  })
}

export async function loadLanguage(lang: string): Promise<void> {
  if (i18n.hasResourceBundle(lang, 'translation')) {
    await i18n.changeLanguage(lang)
    return
  }
  const { data: bundle } = await axios.get(`/api/translations/${lang}`)
  i18n.addResourceBundle(lang, 'translation', bundle)
  await i18n.changeLanguage(lang)
  localStorage.setItem('alpr_lang', lang)
}
```

**`src/main.tsx`** — await `initI18n()` before mounting React:

```tsx
import { initI18n } from './i18n'

initI18n().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
})
```

### Usage in Components

```tsx
import { useTranslation } from 'react-i18next'

function NewSessionPage() {
  const { t } = useTranslation()

  return (
    <button>{t('newSession.confirmButton')}</button>
  )
}
```

Interpolation for dynamic values:
```tsx
t('newSession.ocrConfidence', { value: 87 })
// → "OCR güveni: 87%"  (tr)
// → "OCR confidence: 87%"  (en)

t('exitModal.success', { amount: '35.00' })
// → "Seans kapatıldı — ₺35.00 tahsil edildi"  (tr)
```

### Language Switcher

Located in the top navigation bar, right of the clock:

```
[ 🌐 TR ▾ ]   ← dropdown with TR / EN options
```

- On switch: calls `loadLanguage(lang)`, persists selection in `localStorage`
- On app load: reads `localStorage.getItem('alpr_lang')` before calling the API, defaults to `tr`
- Language change is instant — no page reload required

### Adding a New Language

1. Create `translations/{lang}.json` following the same key structure as `tr.json`
2. Add the lang code to `SUPPORTED_LANGS` in `api/routes/translations.py`
3. No code changes required on the frontend — the language picker auto-discovers from
   `GET /api/translations`
