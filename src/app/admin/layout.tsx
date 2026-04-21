import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="font-display text-3xl font-bold">403 — Admin only</h1>
        <p className="text-white/60 mt-2">Add your email to <code>ADMIN_EMAILS</code> in .env.local.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-6 md:py-10">
      <div className="grid md:grid-cols-[220px_1fr] gap-6">
        <aside>
          <div className="glass rounded-2xl p-4 sticky top-20">
            <div className="font-display font-bold text-lg mb-3 px-2">Admin</div>
            <nav className="flex flex-col gap-0.5 text-sm">
              <NavLink href="/admin" label="Overview" icon="📊" />
              <NavLink href="/admin/analytics" label="Analytics" icon="📈" />
              <NavLink href="/admin/economics" label="Economics" icon="🎯" />
              <NavLink href="/admin/users" label="Users" icon="👥" />
              <NavLink href="/admin/openings" label="Openings log" icon="🎴" />
              <NavLink href="/admin/packs" label="Packs" icon="📦" />
              <NavLink href="/admin/inventory" label="Inventory" icon="🗄️" />
              <NavLink href="/admin/shipments" label="Shipments" icon="📮" />
              <NavLink href="/admin/payouts" label="Payouts" icon="💸" />
            </nav>
            <div className="mt-4 pt-4 border-t border-white/5 text-xs text-white/40 px-2">
              <div>Signed in as</div>
              <div className="text-white/70 truncate">{user.email}</div>
            </div>
          </div>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-white/70 hover:text-white hover:bg-white/5 transition"
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
