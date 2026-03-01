

# Plan: Implement User Management (Based on LeadSeekr Pattern)

## What LeadSeekr Has

LeadSeekr implements a full admin user management system with these components:

- **`user_roles` table** — Separate table with `user_id` + `role` (admin/user), with RLS
- **`useAdmin` hook** — Checks admin status via `user_roles` table, fetches all users and analytics via edge functions
- **Admin edge functions** — `admin-get-users`, `admin-set-role`, `admin-reset-password`, `admin-disable-user`, `admin-delete-user` — all verify the caller is admin server-side before executing
- **Admin page** — Tabbed dashboard with user list, search/filter, credit adjustments, role toggling, disable/delete, CSV export
- **`AdminMFAGuard`** — MFA verification wrapper for admin pages
- **`FeatureGate`** — Subscription-based feature gating

## What We Will Implement (Adapted for LeadScope)

A simplified version focused on what's relevant: user listing, role management, disable/delete users, and password resets. We skip credits, subscriptions, and MFA (not part of this project).

### 1. Database Migration — Create `user_roles` table
```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles without recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- RLS: users can read their own role; admins can read all
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Seed your user as admin (will need your user_id)
```

### 2. Edge Functions (3 new functions)

- **`admin-get-users`** — Verifies caller is admin, uses `auth.admin.listUsers()` to get all users, joins with `profiles`, `companies`, `emails`, `people` counts. Returns user list.
- **`admin-set-role`** — Verifies admin, promotes/demotes target user. Prevents self-demotion.
- **`admin-delete-user`** — Verifies admin, deletes user via `auth.admin.deleteUser()`, cascade removes their data.

### 3. Frontend Hook — `useAdmin.ts`
- Checks admin status by querying `user_roles` table
- Fetches users and analytics via edge functions using `@tanstack/react-query`
- Provides `setUserRole` and `deleteUser` mutation wrappers

### 4. Admin Page — `src/pages/AdminPage.tsx`
- Protected route, only accessible to admins
- User list table with: email, role badge, signup date, company/email/people counts
- Actions per user: toggle admin role, delete user (with confirmation dialog)
- Search/filter users by email
- Overview stats cards (total users, total companies, total emails, total people)

### 5. Routing & Navigation Updates
- Add `/admin` route in `App.tsx` with admin-only guard
- Add "Admin" nav item in `AppLayout.tsx` sidebar (only visible to admins)
- `useAdmin` hook's `isAdmin` flag controls visibility

### Files Created
- `supabase/functions/admin-get-users/index.ts`
- `supabase/functions/admin-set-role/index.ts`
- `supabase/functions/admin-delete-user/index.ts`
- `src/hooks/useAdmin.ts`
- `src/pages/AdminPage.tsx`

### Files Modified
- `src/App.tsx` — add admin route
- `src/components/AppLayout.tsx` — add conditional admin nav link

