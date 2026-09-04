# Talbot Hotel HR App

A production PWA for hotel staff operations: rotas, clock in/out, room management, fire-safety checks, holiday requests, task assignment, and activity logging. Built as a zero-build installable web app (iOS/Android) backed by Supabase.

**[Live demo →](https://dancing-buttercream-0a7386.netlify.app)** • **Tech stack:** plain HTML/CSS/JS, Supabase (PostgreSQL + auth + storage)

## Features

### All Staff
- **Dashboard** — quick view of upcoming shifts, assigned tasks, notifications
- **Rota** — weekly shift schedule (read-only)
- **Clock in/out** — timer, daily history
- **Settings** — light/dark theme, notification preferences
- **Realtime notifications** — in-app alerts for task assignments, approvals, etc.

### Night Department
- **Fire Walk** — hourly checklist (7 nightly slots 12am–6am), locked per slot with 5 yes/no questions + activity notes; flagged as done/due-now/upcoming/missed

### Housekeeping Department  
- **My Rooms** — assigned rooms with status (vacant/departure/stayover/council/maintenance/ready)
- **Room Checklists** — departure (4 Q), council (4 Q), stayover (3 Q), ready check (2 Q)
- **My Tasks** — ad-hoc tasks assigned by reception/night staff, mark done with realtime notification

### Maintenance Department
- **Maintenance Tab** — view, update, close maintenance requests from any department

### Reception / All Managers
- **Rooms** — full 56-room inventory (family/twin/double/triple/accessible, PAX), drag-assign housekeepers per room
- **Tasks** — create ad-hoc tasks, assign to housekeepers, track completion
- **Cleaning Requests** — departure/council/stayover/ready checklists per room
- **Maintenance Requests** — report, reassign, track in-progress/completed
- **My Tasks** — team task dashboard with completion status

### Managers Only
- **Admin → Staff** — assign roles (staff/manager) and departments to anyone
- **Admin → Rotas** — upload/edit weekly rotas (CSV or manual)
- **Admin → Logs** — browse day/week/month activity (clock, fire walk, room cleaning, maintenance) with filtering
- **Holiday Requests** — view pending staff requests, approve/reject with calendar view

## Tech & Design

**Stack:**
- **Frontend:** plain HTML5, CSS3 (Apple-inspired: SF system fonts, translucent UI, spring animations, dark mode)
- **Backend:** Supabase PostgreSQL with row-level security (staff see only their own data; managers see all)
- **Auth:** email/password signup (email confirmation off for quick testing)
- **Storage:** private per-user bucket for photos (signed URLs, never public)
- **Deployment:** Netlify (no build step, instant drag-drop updates)

**Security:**
- XSS protection: all user input (names, notes, descriptions) escaped before rendering
- Role-based access control: enforced at database layer (RLS), not just UI
- Private storage: photos isolated per user
- No hardcoded API secrets in client code

## Setup & Deployment

### Local development

No build tools required:

```bash
cd hr-app
python3 -m http.server 8000
```

Then open `http://localhost:8000`. For phone testing on same Wi-Fi, use your computer's LAN IP.

### Supabase backend setup

1. Create a free [Supabase](https://supabase.com) project
2. SQL Editor → paste [`supabase/schema.sql`](supabase/schema.sql) and run
3. Project Settings → API → copy **Project URL** and **anon public key**
4. Paste into [`js/config.js`](js/config.js):
   ```js
   export const SUPABASE_URL = "https://xxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJ...";
   ```

### Deploy to production

Any static host (Netlify, Vercel, GitHub Pages):

```bash
# Create zip for drag-drop upload
cd hr-app && zip -r -X ~/Desktop/talbot-hotel-hr.zip . -x ".*"
```

Then drag onto your hosting platform's deploy interface. Once live on `https://`:

- **iPhone:** Safari → Share → Add to Home Screen
- **Android:** Chrome menu → Add to home screen / Install app

Opens full-screen like a native app with home screen icon.

## First manager setup

1. Sign up in the app with your email/password
2. In Supabase Table Editor → `profiles`, find your row and set `role` to `manager`
3. Sign back in — Admin page now appears in the top bar
4. Use Admin → Staff to assign roles/departments to other users as they sign up

## Project structure

```
hr-app/
├── index.html                  # dashboard + auth
├── admin.html                  # manager controls
├── rooms.html                  # room management & checklists
├── holidays.html               # holiday requests & calendar
├── settings.html               # theme, notifications
├── js/
│   ├── config.js               # Supabase URL + keys
│   ├── supabaseClient.js       # auth + realtime client
│   ├── ui.js                   # shared UI functions (escape XSS, formatting)
│   ├── dashboard.js            # dashboard page logic
│   ├── admin.js                # manager logs + staff assignment
│   ├── rooms.js                # room status, checklists, task assignment
│   ├── firewalk.js             # fire-walk checklist (night only)
│   ├── holidays.js             # holiday request calendar
│   └── ...
├── css/
│   └── styles.css              # Apple-inspired UI system (dark mode, animations)
├── icons/                      # SVG icons
├── manifest.json               # PWA install metadata
├── sw.js                       # service worker (offline cache)
└── supabase/
    ├── schema.sql              # tables, RLS, storage bucket
    └── upgrade-*.sql           # migrations (v2, v3, v4)
```

## What I learned building this

- **Row-level security as a security primitive:** RLS in PostgreSQL pushed security enforcement down to the database, eliminating the risk of a UI bug exposing data
- **Zero-build web apps:** ditching webpack/npm for plain ES modules loaded via CDN meant instant iteration, easier debugging, and simpler deployment
- **Realtime UX:** Supabase Realtime (postgres_changes) synced task assignments, approvals, and notifications across devices/browser tabs in real-time
- **PWA for internal tools:** no app store, no update friction, one-click install on any device — ideal for hospitality staff
- **XSS hardening:** stored XSS through user-controlled HTML taught me the value of escaping at the boundary, not in the template

## What's next

- Server-side push notifications (web-push API) for fire-walk alerts even when app is closed
- CSV export of timesheets and activity logs
- Invite codes / restricted signup
- Mobile app version (React Native) if team grows beyond phone browser
