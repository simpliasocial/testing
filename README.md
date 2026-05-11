# SimpliaLeads Dashboard

Operational commercial dashboard for **SimpliaLeads** — a system for lead control, conversion funnel, manual follow-up, scoring, and automatic reporting on top of the Chatwoot + Supabase platform.

---

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Project Architecture (FSD)](#project-architecture-fsd)
  - [Layers and Responsibilities](#layers-and-responsibilities)
  - [Layer Diagram](#layer-diagram)
  - [Dependency Rules](#dependency-rules)
- [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
- [Directory Structure](#directory-structure)
- [Product Features / Modules](#product-features--modules)
- [Applied Design Patterns](#applied-design-patterns)
- [Setup and Startup](#setup-and-startup)
- [Available Scripts](#available-scripts)
- [Environment Variables](#environment-variables)
- [Database (Supabase)](#database-supabase)
- [Tests](#tests)
- [Code Conventions](#code-conventions)

---

## Overview

SimpliaLeads Dashboard is a SPA (Single Page Application) that acts as a **commercial control system** over Chatwoot data. Its purpose is not to be a static BI tool, but an actionable tool for sales and operations teams:

| Layer | Purpose |
|---|---|
| Executive Overview | Immediate executive reading of the system's status |
| Funnel / Conversion | Detect where opportunities are lost in the pipeline |
| Operational Efficiency | Measure speed, SLA, backlog, and operational discipline |
| Lead Action Queue | Show which leads require human action today |
| Source / Campaign / Owner | Compare performance by channel, campaign, and owner |
| Trend Layer | Analyze temporal evolution of the system |
| Reporting / Exports | Download, share, and automate periodic reports |

---

## Technology Stack

### Frontend
| Technology | Version | Role |
|---|---|---|
| **React** | 18.3 | UI Framework |
| **TypeScript** | 5.8 | Static Typing |
| **Vite** + SWC | 5.4 | Build tool and ultra-fast dev server |
| **React Router DOM** | 6.30 | SPA Routing |
| **TanStack Query** | 5.83 | Server-state, cache, and synchronization |
| **Recharts** | 2.15 | Visualizations and charts |
| **shadcn/ui** | latest | Component system (Radix UI + Tailwind) |
| **Radix UI** | latest | Accessible unstyled primitives |
| **Tailwind CSS** | 3.4 | Utility-first CSS |
| **date-fns** | 3.6 | Date manipulation |
| **xlsx** | 0.18 | Export to Excel |
| **Zod** | 3.25 | Schema validation |
| **React Hook Form** | 7.61 | Form handling |
| **Lucide React** | 0.462 | Iconography |

### Backend / Infrastructure
| Technology | Role |
|---|---|
| **Supabase** | BaaS: authentication, PostgreSQL database, storage, Edge Functions |
| **Chatwoot** | Conversational CRM (main source of lead data) |
| **Axios** | HTTP client for the Chatwoot API |
| **IndexedDB** | Local cache for conversation snapshots |

### Development Tools
| Tool | Role |
|---|---|
| **ESLint** + TypeScript ESLint | Linting and code quality |
| **Vitest / Node test runner** | Unit tests per layer |
| **Vercel** | SPA Deployment |

---

## Project Architecture (FSD)

The project follows a **Feature-Sliced Design (FSD)** architecture adapted to the principles of **Clean Architecture / Ports & Adapters**. The goal is to protect the commercial business domain from UI and infrastructure details, keeping each layer cohesive, testable, and with clear responsibilities.

### Layers and Responsibilities

```
src/
├── app/            → Global composition: providers, router, error boundaries
├── features/       → Product slices: dashboard, followup, scoring, reporting...
├── domain/         → Pure types and business rules (no React, no Supabase)
├── application/    → Use case contracts and ports (interfaces)
├── infrastructure/ → Adapters: Chatwoot API, Supabase, IndexedDB, mappers
├── shared/         → Cross-cutting utilities and components without business logic
├── components/     → Layout and application shell components
├── context/        → React contexts and their global state values
├── hooks/          → Reusable custom hooks
├── lib/            → Integration helpers and legacy utilities in migration
├── pages/          → Route-level page components
└── services/       → Data access services (StorageService, ChatwootService...)
```

### Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│                      pages / app                     │  ← Composition and routing
├─────────────────────────────────────────────────────┤
│                      features/                       │  ← Product logic by slice
│  dashboard │ followup │ scoring │ reporting │ ...   │
├──────────────────────┬──────────────────────────────┤
│     application/     │         shared/              │  ← Use cases and generic UI
├──────────────────────┼──────────────────────────────┤
│      domain/         │      infrastructure/         │  ← Pure domain and adapters
│  lead │ conversation │  chatwoot │ supabase │ idb   │
│  dashboard │ report  │  mappers  │ export           │
└─────────────────────────────────────────────────────┘
```

> **Golden Rule**: dependencies only flow downwards. `features` can use `domain`, `application`, and `shared`, but **never the other way around**.

### Dependency Rules

| Layer | Can import from | Cannot import from |
|---|---|---|
| `domain/` | nothing external (only TS types) | features, app, infrastructure, React |
| `application/` | `domain/` | features, infrastructure, React |
| `infrastructure/` | `domain/`, `application/` | features, React components |
| `features/` | `domain/`, `application/`, `infrastructure/`, `shared/` | other features (except via ports) |
| `shared/` | no business logic | domain, features |
| `app/` | everything | — |

---

## Role-Based Access Control (RBAC)

The application implements a 3-tier Role-Based Access Control system to ensure data security and feature gating:

| Role | Access Level | Description |
|---|---|---|
| **Platform Admin** (`platform_admin`) | Full Access | Simplia administrators who can manage multiple companies and configure global settings. |
| **Company Admin** (`company_admin`) | Full Access | Client administrators who have full visibility into their company's dashboard, metrics, and configurations. |
| **Operator** (`operator`) | Restricted Access | End-users (e.g., sales agents) who are restricted to specific operational tabs (e.g., "Seguimiento" and "Rendimiento Humano"). |

### Technical Implementation:
- **Database:** Roles are stored in the `public.user_profiles` table in Supabase, linked to `auth.users`.
- **Domain:** The source of truth for permissions is located at `src/domain/auth/permissions.ts`. This file defines visibility logic, tab access, and default landing pages.
- **UI Gating:** The frontend uses the `isAdmin(role)` helper to conditionally render sensitive configuration panels, export features, and executive tabs. Unauthenticated users or those without a profile default to the `operator` role for security.

---

## Directory Structure

```
testings-dashboard/
├── src/
│   ├── app/                        # Providers, router, lazy boundaries
│   ├── application/                # Ports and use case interfaces
│   ├── components/
│   │   └── DashboardLayout.tsx     # Main app shell
│   ├── context/                    # DashboardDataContext, AuthContext
│   ├── domain/
│   │   ├── auth/                   # Authentication types and RBAC permissions
│   │   ├── common/                 # Cross-cutting types (UnknownRecord, etc.)
│   │   ├── conversation/           # Conversation/lead rules and types
│   │   ├── dashboard/              # Metrics, KPIs, and executive view types
│   │   ├── lead/                   # Lead types, stages, scoring, channels, labels
│   │   │   ├── leadAttributes.ts   # Safe typed attribute resolution
│   │   │   ├── types.ts
│   │   │   ├── stage.ts
│   │   │   ├── score.ts
│   │   │   ├── channel.ts
│   │   │   ├── labels.ts
│   │   │   └── index.ts
│   │   └── report/                 # Report types and configuration
│   ├── features/
│   │   ├── dashboard/              # Executive Overview, Funnel, Efficiency, Trends
│   │   │   ├── components/         # Dashboard business components
│   │   │   ├── hooks/              # useDashboardData, reactive metrics
│   │   │   └── index.ts
│   │   ├── followup/               # Lead Action Queue, manual follow-up
│   │   │   ├── components/         # LeadActionQueue, filters, badges
│   │   │   └── model/              # leadActionQueueModel, leadWorkflowModel
│   │   ├── scoring/                # Lead Scoring Layer, score KPIs
│   │   ├── reporting/              # Scheduled reports, CSV/Excel export
│   │   ├── conversations/          # Chatwoot conversations view
│   │   └── import/                 # Bulk lead import
│   ├── infrastructure/             # External adapters
│   │   ├── chatwoot/               # Chatwoot API client and mappers
│   │   └── supabase/               # Supabase client, RLS helpers
│   ├── lib/                        # Transition helpers (conversationState, etc.)
│   ├── pages/                      # Route pages (DashboardPage, FollowupPage...)
│   ├── services/                   # StorageService (IndexedDB), ChatwootService
│   └── shared/
│       └── ui/
│           └── dashboard/          # Reusable UI components without business logic
│               ├── KPICard.tsx
│               ├── SectionCard.tsx
│               ├── DateRangePicker.tsx
│               ├── ChannelSelector.tsx
│               └── TabExportMenu.tsx
├── supabase/                       # SQL migrations and Edge Functions
├── tests/                          # Unit tests by layer (Node test runner)
├── scripts/                        # Maintenance and sync scripts
├── public/                         # Static assets
├── ARCHITECTURE.md                 # Technical architecture guide
├── CONTRIBUTING.md                 # Developer contribution guidelines
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.app.json
└── package.json
```

---

## Product Features / Modules

### `features/dashboard`
Main executive analysis module. Includes:
- **ExecutiveOverview**: High-level KPIs (incoming leads, contact rate, interest rate, scheduling, SLA).
- **FunnelLayer**: Drop-off visualization by commercial pipeline stage.
- **OperationalEfficiency**: Speed metrics (time to first contact, % within SLA, pipeline aging).
- **TrendLayer / HistoricalTrendLayer**: Temporal evolution of key metrics.
- **PerformanceLayer**: Comparison by channel, campaign, and owner.

### `features/followup`
**Lead Action Queue**: Actionable work queue prioritizing leads requiring immediate human contact. Filters by priority, status, channel, and owner. Urgency and expired SLA badges.

### `features/scoring`
Lead scoring engine with visualization of KPIs by score, score distribution, and risk profiles.

### `features/reporting`
Manual export module (CSV/Excel) and configuration of scheduled reports with email delivery. Sending history and automation management.

### `features/conversations`
View of synchronized conversations from Chatwoot with filtering capabilities and history tracking.

### `features/import`
Bulk lead import from Excel files with column validation and attribute mapping.

---

## Applied Design Patterns

### 1. Feature-Sliced Design (FSD)
Code organization by product slices with clear layer separation (ui → model → lib → api). Each feature is autonomous and cohesive.

### 2. Ports & Adapters (Hexagonal Architecture)
- **Ports** (`application/`): TypeScript interfaces that define the domain's input/output contracts.
- **Adapters** (`infrastructure/`): Concrete implementations of Chatwoot, Supabase, and IndexedDB that translate external responses to domain types.

### 3. Tactical Domain-Driven Design (DDD)
- **Value Objects**: Types like `LeadStage`, `LeadScore`, `ChannelType` are discriminated types without identity.
- **Domain Logic**: Business rules (lead prioritization, attribute resolution, SLA calculation) live in pure `domain/`, with no external dependencies.
- **Ubiquitous Language**: Names of types and functions reflect business vocabulary (`resolveLeadStage`, `normalizeLabels`, `AttributeRecord`).

### 4. React Query as a Synchronization Layer
TanStack Query handles server-state (Supabase, Chatwoot API), caching, revalidation, and loading/error states. Components receive `data`, `isLoading`, `error` without manually managing fetches.

### 5. Context + Hooks as UI Application Layer
`DashboardDataContext` acts as an orchestrator: it aggregates data from multiple sources (IndexedDB snapshot + Supabase) and exposes them to features via hooks (`useDashboardData`).

### 6. Snapshot Pattern with IndexedDB
Chatwoot conversations are synchronized and stored locally in IndexedDB via `StorageService`. Dashboards read from the local snapshot for performance, with periodic background synchronization.

### 7. Type-Safe Attribute Resolution
Chatwoot contact and conversation attributes (which arrive as `unknown`) are safely resolved in `domain/lead/leadAttributes.ts` using `UnknownRecord` (not `any`), with pure and deterministic functions.

---

## Setup and Startup

### Prerequisites
- Node.js `>= 18`
- npm or bun

### Steps

```sh
# 1. Clone the repository
git clone <REPOSITORY_URL>
cd testings-dashboard

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env

# 4. Edit .env with your credentials (see environment variables section)

# 5. Start the development server
npm run dev
```

The application will be available at `http://localhost:5173`.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build in `/dist` |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | TypeScript type checking without emitting |
| `npm run lint` | Linting with ESLint |
| `npm run test:domain` | Domain rules tests |
| `npm run test:application` | Application view models tests |
| `npm run test:infrastructure` | Infrastructure mappers tests |
| `npm run test:features` | Features models tests |
| `npm run test:unit` | All unit tests in sequence |
| `npm run check` | Complete pipeline: typecheck → tests → build |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the following values:

```env
# Supabase
VITE_SUPABASE_URL=https://XXXX.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# Chatwoot
VITE_CHATWOOT_BASE_URL=https://app.chatwoot.com
VITE_CHATWOOT_API_KEY=your_api_key
VITE_CHATWOOT_ACCOUNT_ID=1

# App configuration
VITE_APP_ENV=development
```

> ⚠️ **Never** commit the `.env` file with real credentials. It is included in `.gitignore`.

---

## Database (Supabase)

The project uses Supabase as the backend:
- **Authentication**: Users and sessions managed by Supabase Auth with RLS (Row Level Security).
- **PostgreSQL**: Storage for scheduled reports, user configurations, user profiles, and execution logs.
- **Edge Functions**: Email report sending logic executed on the server.
- **Migrations**: Located in the `/supabase/` folder, applied using the Supabase CLI.

```sh
# Apply migrations (requires Supabase CLI)
supabase db push
```

---

## Tests

The project has unit tests by layer, executable without a browser environment (Native Node.js):

```
tests/
├── domain/
│   ├── leadRules.test.mjs          # Prioritization logic, score, and stages
│   └── conversationRules.test.mjs  # Labels and states rules
├── application/
│   └── dashboardViewModel.test.mjs # Metric view models construction
├── infrastructure/
│   └── conversationMapper.test.mjs # Mapping Chatwoot responses → domain
└── features/
    ├── followupModel.test.mjs      # Lead Action Queue prioritization
    ├── scoringModel.test.mjs       # Score calculations
    └── reportExportModel.test.mjs  # Export datasets construction
```

Run all tests:
```sh
npm run test:unit
```

---

## Code Conventions

- **Code Language**: English (identifiers, technical comments, function and type names).
- **Product Language**: Spanish (user-visible copy, KPI names, UI labels).
- **Imports**: Use the `@/` alias for absolute paths from `src/` (configured in `tsconfig.app.json` and `vite.config.ts`).
- **Types**: Prefer explicit types over `any`. Use `UnknownRecord` for payloads from external sources.
- **Components**: Components in `shared/ui/` are purely presentational and should not contain business logic.
- **Hooks**: State logic and effects live in feature hooks, not in components.
- **Linting**: Existing `any` errors are warnings (migration gate). New code in `domain/` and `infrastructure/` must be fully typed.

---

## Deployment

The project is configured for deployment on **Vercel**. The configuration is in `vercel.json`.

```sh
# Production build
npm run build

# The output directory is /dist
```

Vercel automatically detects the project as Vite and applies the corresponding configuration.
