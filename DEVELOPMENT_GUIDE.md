# 🚀 SimpliaLeads Dashboard - Feature Development Guide

Welcome! This document serves as the **absolute source of truth** for adding new features, fixing bugs, and maintaining the SimpliaLeads Dashboard. 

Whether you are a human developer or an AI Assistant, **you must strictly adhere to this guide**. The goal is to ensure maximum software quality, maintain our architectural integrity, and prevent regressions when scaling the project.

---

## 🔄 The "New Feature" Lifecycle (End-to-End)

Whenever you are tasked with adding a new feature, you must go through this exact lifecycle to ensure nothing breaks:

### 1. 🔍 Context & Research Phase
- **Read the Docs:** Always review the `README.md` and this guide.
- **Check the Database:** If you are an AI, use the **Supabase MCP** (`list_tables`, `get_schema`, etc.) to inspect the actual database structure (e.g., `user_profiles`, `auth.users`) before making assumptions about data.
- **Impact Analysis:** Use global search (e.g., `grep_search`) to find where existing functions or components are used before modifying them. **Do not break existing implementations.**

### 2. 🧠 Domain First (Business Logic)
- Define your TypeScript interfaces, types, and pure business logic in `src/domain/`.
- **Rule:** This layer cannot import from React, Supabase, or any external library. It is 100% pure TypeScript.

### 3. 🔌 Infrastructure & Application
- **Infrastructure (`src/infrastructure/`):** Write the Supabase queries, API calls (e.g., Chatwoot), and data mappers here.
- **Application (`src/application/`):** Write your custom React Hooks (e.g., `useQuery`, `useMutation`) here to bridge the Infrastructure with the UI.

### 4. 🎨 Feature UI Construction
- Build your UI components inside an isolated folder in `src/features/<feature-name>/`.
- Do not import components from other features. If a component needs to be shared, move it to `src/shared/`.

### 5. 🔐 Integration & Security (RBAC)
- Wire your feature into the main app (e.g., `DashboardLayout.tsx`).
- **Critical:** Apply Role-Based Access Control (RBAC). Never hardcode checks like `role === 'admin'`. Always use the centralized helpers from `src/domain/auth/permissions.ts` (like `isAdmin(role)`).

### 6. 🧪 Quality Assurance & Testing
- Before considering the feature "done", you must verify:
  - **Type Checking:** Run `npm run typecheck` to ensure no TypeScript errors were introduced.
  - **Linting:** Run `npm run lint`.
  - **Unit Tests:** Run `npm run test:unit`. Write new tests for any new logic added to the `domain/` layer.

---

## 🏗 Architecture Standards: Feature-Sliced Design (FSD)

This project strictly adheres to **Feature-Sliced Design (FSD)** and **Clean Architecture**.

### The Golden Rule of Dependencies
**Dependencies only flow downwards.**
1. `app/` (Top level) - Depends on everything.
2. `features/` - Depend on `domain/`, `application/`, `infrastructure/`, and `shared/`.
3. `infrastructure/` - Depends on `domain/` and `application/`.
4. `application/` - Depends on `domain/`.
5. `domain/` & `shared/` (Bottom level) - **Cannot** depend on any upper layers. They must remain pure.

---

## 🧩 Design Patterns & Best Practices

- **Single Source of Truth:** Business rules and permissions must live in one place. For example, all role logic lives in `src/domain/auth/permissions.ts`.
- **Separation of Concerns:** UI components should *never* contain `supabase.from(...)` calls. UI components call custom hooks (`application/`), which in turn call API services (`infrastructure/`).
- **No `any` Types:** The use of `any` is strictly prohibited for new code. If dealing with unknown data from an external API, use `unknown` or a utility type like `UnknownRecord`, and validate the data explicitly before using it.
- **Language Convention:** 
  - Code identifiers, technical comments, function names, and variable names must be in **English**.
  - User-facing text, labels, and product copy must be in **Spanish**.

---

## 🛠 Available Tools & Context (For AI Assistants)

If you are an AI working on this project, use your tools wisely so you don't lose the thread of the project:
- **Supabase MCP:** You have direct access to Supabase tools. Use them to query the database, check tables, and verify RLS policies before writing SQL or modifying infrastructure code.
- **Grep Search:** Always search the codebase before creating a "new" utility. We might already have a formatter or a shared UI component that does exactly what you need.
- **Artifacts:** If a major architectural change is requested, create an `implementation_plan` artifact first to get user approval before writing code.

---

**By following this guide, you ensure that the SimpliaLeads Dashboard remains scalable, bug-free, and easy to maintain for everyone on the team.**
