# RFC-001: Multi-Tenancy for Izakaya (DataOS)

## Context

Izakaya is currently a single-tenant PoC. All users share the same connectors, data sources, pipeline runs, and BigQuery data. As we move toward production, we need to support multiple organisations and teams with proper data isolation, access control, and user management.

Authentication and organisation management in production will be handled by **Auth0** and the internal **Customer Management Service (CMS)**. CMS manages organisations, users, and Auth0 integration (org creation, invitation flows, SSO). It does not manage teams or DataOS-specific roles — those are internal to Izakaya.

This RFC describes the multi-tenancy model across all layers: PostgreSQL, BigQuery, Fivetran, the Dagster pipeline, authentication, and local development.

## Goals

- Isolate data between organisations so tenants cannot see each other's resources
- Support teams within an organisation as an access-control mechanism on connectors and data sources
- Allow users to create new organisations and switch between existing ones from within the Izakaya UI
- Maintain a simple local development experience with no dependency on CMS or Auth0
- Keep DataOS roles internal, separate from CMS/GrowthOS roles

## Non-Goals

- Schema-per-tenant or database-per-tenant in PostgreSQL (row-level isolation is sufficient)
- Fine-grained field-level permissions
- Cross-organisation data sharing
- Replacing CMS — we integrate with it, not duplicate it

---

## 1. Tenancy Model

### Row-Level Isolation with `organization_id`

Every tenant-scoped table gets an `organization_id UUID NOT NULL` column. All queries filter by organisation. No PostgreSQL Row-Level Security (RLS) initially — explicit filtering in the repository layer, enforced via the auth middleware injecting `organization_id` into the request context.

### Hierarchy

```
Organisation (synced from CMS / Auth0)
├── Team A
│   ├── Connector: Shopify           (team_id = Team A)
│   ├── Data Source: sales           (team_id = Team A)
│   └── Members: alice (admin), bob (editor)
├── Team B
│   ├── Connector: Meta Ads          (team_id = Team B)
│   ├── Data Source: paid_media      (team_id = Team B)
│   └── Members: carol (admin), bob (viewer)
└── Org-wide resources
    ├── Connector: Google Analytics  (team_id = NULL)
    └── Data Source: web_analytics   (team_id = NULL)
```

`team_id = NULL` means the resource is visible to **all members** of the organisation.

---

## 2. Database Schema Changes

### New Tables

```sql
-- Cached from CMS. Synced on first access or via Pub/Sub events.
CREATE TABLE organizations (
    id              UUID PRIMARY KEY,          -- matches CMS org ID
    name            TEXT NOT NULL,
    display_name    TEXT,
    bq_dataset      TEXT NOT NULL UNIQUE,      -- e.g. "izakaya_acme_corp"
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, name)
);

-- Izakaya-internal membership and roles. Not synced to CMS.
CREATE TABLE organization_memberships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    user_id         TEXT NOT NULL,              -- Auth0 "sub" claim
    role            TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'admin', 'member')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

CREATE TABLE team_memberships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL,              -- Auth0 "sub" claim
    role            TEXT NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('admin', 'editor', 'viewer')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(team_id, user_id)
);
```

### Modified Tables

Add `organization_id` and optional `team_id` to tenant-scoped tables:

| Table | New Columns | Notes |
|---|---|---|
| `connectors` | `+ organization_id NOT NULL`, `+ team_id NULL` | `team_id = NULL` = org-wide |
| `data_sources` | `+ organization_id NOT NULL`, `+ team_id NULL` | `team_id = NULL` = org-wide |
| `label_rules` | `+ organization_id NOT NULL` | Org-scoped (shared across teams within org) |
| `pipeline_runs` | `+ organization_id NOT NULL` | For query filtering |
| `releases` | `+ organization_id NOT NULL` | Org-scoped |

Tables that inherit scope via FK and do **not** need new columns:
- `mappings` (scoped via `data_source_id`)
- `release_entries` (scoped via `release_id`)
- `validation_errors` (scoped via `pipeline_run_id`)

### Dropped Tables

- `users` — replaced by Auth0 identity. `created_by` fields become `TEXT` (Auth0 sub), not a FK.

---

## 3. Access Control

### Roles

**Organisation-level** (on `organization_memberships.role`):

| Role | Capabilities |
|---|---|
| `owner` | Full org control: settings, billing, invite/remove users, create/delete teams, see all resources |
| `admin` | Invite users, create teams, manage all teams, see all resources |
| `member` | Access org-wide resources + resources belonging to their team(s) |

**Team-level** (on `team_memberships.role`):

| Role | Capabilities |
|---|---|
| `admin` | Manage team members, create/delete connectors and data sources, create releases |
| `editor` | Configure mappings, label rules, trigger pipeline runs |
| `viewer` | View dashboards, explore data, view releases (read-only) |

**Mutinex internal users** (identified by Auth0 claim or email domain) have super-admin access across all organisations.

### Resource Visibility Logic

```python
def can_access(user: AuthContext, resource: HasTeamScope) -> bool:
    # Super-admin: Mutinex internal users
    if user.is_mutinex_internal:
        return True
    # Org admin/owner: see everything in their org
    if user.org_role in ("owner", "admin"):
        return True
    # Org-wide resource: any org member can see it
    if resource.team_id is None:
        return True
    # Team-scoped resource: only team members
    return resource.team_id in user.team_ids
```

For write operations, additionally check the team-level role (admin/editor vs viewer).

---

## 4. Authentication

### Production: Auth0 JWT

Replace the current cookie-based session auth with Auth0 JWT validation.

```
Request flow:
  Browser → Auth0 login (with org selection) → JWT with org_id claim
  Browser → Izakaya API (Authorization: Bearer <JWT>)
  API middleware → validate JWT signature (Auth0 JWKS) → extract org_id, user_id, roles
  API middleware → build AuthContext → inject into request state
  Repository → filter by AuthContext.organization_id
```

**AuthContext** (available on every request):

```python
@dataclass
class AuthContext:
    user_id: str              # Auth0 "sub" claim
    organization_id: UUID     # Auth0 "org_id" claim
    org_role: str             # from organization_memberships table
    team_memberships: dict[UUID, str]  # {team_id: role}
    is_mutinex_internal: bool # derived from email domain or custom claim
```

### Local Development: Bypass

No Auth0 or CMS dependency locally. The auth middleware checks `settings.environment`:

```python
if settings.environment == "local":
    return AuthContext(
        user_id="dev-user",
        organization_id=settings.dev_organization_id,  # from .env
        org_role="owner",
        team_memberships={DEV_TEAM_ID: "admin"},
        is_mutinex_internal=True,
    )
```

Seed migration creates the dev org, dev team, and dev membership. To test multi-tenancy locally, add a second org/team in seed data and override via `X-Organization-Id` header (dev mode only).

---

## 5. Organisation & User Provisioning

### Creating an Organisation (from Izakaya UI)

```
User clicks "Create Organisation"
  │
  ▼
Frontend → POST /api/organizations { name, display_name }
  │
  ▼
Izakaya Backend:
  1. Call CMS gRPC: CreateOrganizationV1({ name, displayName })
     → CMS creates Auth0 org + CMS DB record
     → Returns { id, providerId }
  2. Create `organizations` row (id = CMS org ID, bq_dataset = derived slug)
  3. Provision BigQuery dataset: CREATE SCHEMA `izakaya_{org_slug}`
  4. Create `organization_memberships` row: current user = owner
  5. Optionally create a default team
  6. Return new org to frontend
  │
  ▼
Frontend redirects into the new org context
```

### Inviting Users

- Izakaya calls CMS gRPC `InviteOrganizationMemberV1` (handles Auth0 invitation, email, ticket)
- CMS manages the Auth0 invitation lifecycle (creation, acceptance, account linking)
- On first API request from a newly-accepted user, Izakaya lazily provisions the `organization_memberships` row:

```python
def get_or_create_membership(db, org_id, user_id) -> OrgMembership:
    existing = repo.get_by_org_and_user(db, org_id, user_id)
    if existing:
        return existing
    # User was invited via CMS/Auth0 but hasn't hit Izakaya before
    return repo.create(db, org_id, user_id, role="member")
```

Team assignment happens separately — an org admin adds the user to specific teams after they join.

### Switching Organisations

Auth0 Organisations supports issuing tokens scoped to a specific org. The flow:

```
1. User logs in → JWT scoped to their default/last-used org
2. Frontend calls GET /api/organizations/mine → returns orgs the user belongs to
3. User picks a different org in the UI switcher
4. Frontend calls Auth0 /authorize?organization={auth0_org_id} (silent re-auth)
5. Auth0 issues a new JWT with the selected org_id
6. All subsequent API calls use the new JWT
7. Backend trusts org_id from the cryptographically-signed JWT
```

No client-supplied headers for org selection — the org is always in the verified token.

### Syncing Org Metadata

The `organizations` table in Izakaya is a local cache. Two sync strategies:

- **Pub/Sub listener** (preferred): CMS publishes `organization_created`, `organization_updated`, `organization_archived` events to a Pub/Sub topic. Izakaya subscribes and keeps its cache in sync.
- **Lazy fetch** (fallback): On first request for an unknown org, call CMS gRPC `GetOrganizationV2` and cache the result.

---

## 6. BigQuery — Org-Scoped Datasets

Each organisation gets its own BigQuery dataset: `izakaya_{org_slug}`.

| Current (single-tenant) | Multi-tenant |
|---|---|
| `bq_dataset.paid_media_mapped` | `izakaya_acme.paid_media_mapped` |
| `bq_dataset.paid_media_labelled` | `izakaya_acme.paid_media_labelled` |
| `bq_dataset.paid_media` | `izakaya_acme.paid_media` |
| `bq_dataset.paid_media_history` | `izakaya_acme.paid_media_history` |

Benefits:
- BigQuery IAM can be scoped per-dataset (future: org admins query their own data)
- Deleting an org's data = drop the dataset
- No risk of cross-tenant data leakage from a missing WHERE clause in SQL
- Cost attribution via dataset-level labels

The org's BQ dataset name is stored in `organizations.bq_dataset` and derived at provisioning time.

---

## 7. Fivetran — Org-Scoped Connectors

Connectors are already per-connector with UUID-suffixed schema names, so there's no collision risk.

**Approach**: Shared Fivetran destination group. Connectors are scoped to `organization_id` (and optionally `team_id`) in the Izakaya database. The connector's schema data lands in BigQuery under a unique schema name as today — the ETL pipeline reads from there and writes to the org's BQ dataset.

No changes to Fivetran configuration needed. Isolation is enforced in the Izakaya DB layer and the pipeline.

---

## 8. Pipeline (Dagster) — Tenant-Aware Assets

### Multi-Dimensional Partitions

Current: assets partitioned by `dataset_type`.
New: partitioned by `(organization_id, dataset_type)`.

```python
from dagster import MultiPartitionsDefinition, DynamicPartitionsDefinition

org_partition = DynamicPartitionsDefinition(name="organization")
dataset_partition = DynamicPartitionsDefinition(name="dataset_type")

etl_partitions = MultiPartitionsDefinition({
    "organization": org_partition,
    "dataset_type": dataset_partition,
})
```

### Asset Changes

Each asset receives the org context from the partition key and resolves the target BQ dataset dynamically:

- `mapped_dataset` — reads from Fivetran-ingested BQ tables (connector's schema), writes to `{org_bq_dataset}.{dataset_type}_mapped`
- `labelled_dataset` — reads label rules filtered by `organization_id`, writes to `{org_bq_dataset}.{dataset_type}_labelled`
- `datamart` — writes to `{org_bq_dataset}.{dataset_type}` and `{org_bq_dataset}.{dataset_type}_history`

### Sensor Changes

- `pending_run_sensor` — reads `PipelineRun` records (already have `organization_id`), passes org through partition key
- `fivetran_sync_sensor` — looks up connector's `organization_id`, creates org-scoped pending run
- `config_change_sensor` — same pattern

### BigQuery Resource

The BQ resource resolves the dataset per-run instead of using a global config:

```python
class BigQueryResource:
    def get_dataset_for_org(self, org_id: UUID) -> str:
        # Look up from organizations table
        return org.bq_dataset
```

---

## 9. Migration Path

Incremental rollout in phases:

### Phase 1: Schema & Auth Foundation
- Add `organizations`, `teams`, `organization_memberships`, `team_memberships` tables
- Add `organization_id` (nullable) and `team_id` (nullable) to existing tables
- Create seed migration with dev org/team
- Backfill existing data with dev org ID
- Make `organization_id` NOT NULL after backfill

### Phase 2: Auth Middleware
- Replace cookie-based auth with JWT validation (prod) / dev bypass (local)
- Build `AuthContext` from JWT claims + DB lookups
- Update all repository methods to require `organization_id`
- Add access-control checks for team-scoped resources

### Phase 3: API & Frontend
- Add org CRUD endpoints (create, list mine, switch)
- Add team CRUD endpoints (create, list, manage members)
- Wire CMS gRPC calls for org creation and user invitation
- Add org switcher and team management UI in frontend

### Phase 4: Pipeline & BigQuery
- Add org dimension to Dagster partitions and sensors
- Make BQ resource resolve dataset per-org
- Create org-scoped BQ datasets on org provisioning
- Migrate existing BQ data to dev org dataset

### Phase 5: CMS Integration
- Subscribe to CMS Pub/Sub events for org lifecycle
- Wire up user invitation flow through CMS
- Handle org archival / deletion (pause connectors, optionally drop BQ dataset)

---

## 10. Local Development

| Concern | Approach |
|---|---|
| Auth | Bypass middleware returns hardcoded dev `AuthContext` |
| CMS | Not required. Dev org created by seed migration |
| Auth0 | Not required. No JWT validation locally |
| BigQuery | Single dataset (= dev org's dataset) as today |
| Multi-tenant testing | Second seed org + `X-Organization-Id` header override (dev only) |
| Fivetran | Connectors scoped to dev org in DB, no Fivetran-side changes |

---

## 11. Open Questions

1. **Label rules scoping**: Currently org-scoped. Should teams be able to define their own label rules, or are labels always shared across the org?
2. **Releases**: Are releases org-scoped (an org-level snapshot) or team-scoped (a team publishes their own datasets)?
3. **Fivetran group per org**: Shared group is simpler, but separate groups give stricter isolation and per-org billing. Worth the management overhead?
4. **CMS Pub/Sub vs lazy sync**: Pub/Sub is more robust but adds infrastructure. Lazy sync is simpler for the PoC. Which to start with?
5. **Org deletion**: Soft-delete only (archive) or hard-delete with BQ dataset cleanup?
