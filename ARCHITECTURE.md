# SimpliaLeads Dashboard Architecture

## Target Style

The app now moves toward a feature-sliced clean architecture with ports and adapters. The goal is to protect the commercial domain from UI and infrastructure details while keeping the current product behavior stable.

## Layers

- `src/app`: app providers, router, route-level loading boundaries, and global composition.
- `src/features`: business-facing slices such as dashboard, follow-up, scoring, reporting, and conversations.
- `src/domain`: pure types and business rules for leads, stages, scoring, channels, reports, and dashboard metrics.
- `src/application`: use-case contracts and ports consumed by the app layer.
- `src/infrastructure`: adapters for Chatwoot, Supabase, IndexedDB, mapping, and export mechanisms.
- `src/shared`: cross-cutting helpers with no business ownership.

## Rules

- UI components should render view models and dispatch intents; they should not own integration details.
- Domain modules must stay pure and testable: no React, no Supabase client, no browser APIs.
- Infrastructure adapters translate external payloads into domain/application contracts.
- New technical comments and code identifiers should use English. User-visible copy can remain Spanish.
- Refactors should be incremental and behavior-preserving unless a product change is explicitly requested.

## Current Baseline

- Production build compiles.
- Type checking now has a dedicated script and should be kept green before deeper strictness is enabled.
- Lint is configured as a migration gate: existing `any` usage is warning-level while new domain code should prefer explicit types.

## Next Refactor Targets

- Move dashboard metric calculation from `useDashboardData` into application/domain modules.
- Split `LeadActionQueue`, `LeadScoringLayer`, `reportExport`, and `leadImport` into feature-local components, hooks, and builders.
- Replace direct service imports from UI with application ports and infrastructure adapters.
- Consolidate duplicated channel, score, label, and report logic between frontend and Supabase Edge Functions.
