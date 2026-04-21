import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type SessionUser = {
  id: string;
  email: string | null;
  role: "user" | "admin" | "support";
};

/** Get the current authenticated user from the Supabase session cookie, if any. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const supa = await createSupabaseServer();
    const { data } = await supa.auth.getUser();
    if (!data.user) return null;
    const email = data.user.email?.toLowerCase() ?? null;
    const adminList = env().ADMIN_EMAILS;
    const isAdmin = email && adminList.includes(email);
    return { id: data.user.id, email, role: isAdmin ? "admin" : "user" };
  } catch {
    return null;
  }
}

/** Throws if no user. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new Response("Unauthorized", { status: 401 });
  return u;
}

/** Throws if not admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw new Response("Forbidden", { status: 403 });
  return u;
}

/**
 * Ensure the public.profiles + wallets rows exist for the authenticated Supabase user.
 * Safe to call on first login.
 */
export async function ensureProfileAndWallet(userId: string, email: string) {
  const admin = createSupabaseAdmin();
  await admin.from("profiles").upsert(
    { id: userId, email },
    { onConflict: "id", ignoreDuplicates: false },
  );
  await admin.from("wallets").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
}
