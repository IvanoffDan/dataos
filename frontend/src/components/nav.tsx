"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/auth";

const sections = [
  {
    links: [{ href: "/", label: "Home" }],
  },
  {
    group: "Setup",
    links: [{ href: "/connectors", label: "Connectors" }],
  },
  {
    group: "Classification",
    links: [
      { href: "/datasets", label: "Data Sources" },
      { href: "/labels", label: "Label Rules" },
    ],
  },
  {
    group: "QA",
    links: [
      { href: "/review", label: "Review & QA" },
      { href: "/releases", label: "Releases" },
    ],
  },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <aside className="w-56 min-h-screen bg-[var(--sidebar)] text-[var(--sidebar-foreground)] p-4 flex flex-col">
      <div className="mb-8 px-3 pt-2">
        <h2 className="text-lg font-bold tracking-tight">DataOS</h2>
        <p className="text-xs text-white/50 mt-0.5">Data Ingestion Platform</p>
      </div>
      <nav className="flex-1 space-y-4">
        {sections.map((section, i) => (
          <div key={i}>
            {section.group && (
              <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                {section.group}
              </div>
            )}
            <div className="space-y-0.5">
              {section.links.map((link) => {
                const active =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-[var(--sidebar-accent)] text-white font-medium"
                        : "text-white/70 hover:bg-[var(--sidebar-muted)] hover:text-white"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <button
        onClick={handleLogout}
        className="mt-4 px-3 py-2 text-sm text-white/50 hover:text-white hover:bg-[var(--sidebar-muted)] rounded-md transition-colors text-left"
      >
        Sign out
      </button>
    </aside>
  );
}
