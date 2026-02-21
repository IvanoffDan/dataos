# Frontend — Next.js

## Structure

```
src/
  app/                    # App Router pages
    connectors/           # Connector list, detail, creation (new/)
    datasets/             # Dataset list, detail
    labels/               # Label rules
    login/                # Auth page
    layout.tsx            # Root layout with Nav
    page.tsx              # Home/dashboard
  components/
    ui/                   # Reusable UI primitives (Button, Badge, Card, Dialog, Input, Label, Table, DropdownMenu)
    auth-guard.tsx        # Redirects to /login if not authenticated
    confirm-dialog.tsx    # Reusable confirmation dialog
    edit-dialog.tsx       # Reusable edit/rename dialog
    nav.tsx               # Navigation sidebar/header
  lib/
    api.ts               # Fetch wrapper (credentials: "include", JSON headers)
    auth.ts              # Auth helpers
    utils.ts             # Utility functions (cn, etc.)
```

## Conventions

- All pages are `"use client"` and wrapped in `<AuthGuard>`
- API calls go through `api()` from `@/lib/api` which handles credentials and JSON headers
- All API paths start with `/api/` — Next.js rewrites these to the backend on :8000
- UI components use CSS variables for theming: `var(--primary)`, `var(--border)`, `var(--muted-foreground)`, etc.
- Reusable UI primitives live in `components/ui/`. Page-level components are inline in page files.
- External services (Fivetran Connect Card) open in popup windows, not iframes

## Running

```bash
# From repo root:
make frontend-dev    # pnpm dev on :3000
```
