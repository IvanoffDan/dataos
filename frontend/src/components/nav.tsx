"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/connectors", label: "Connectors" },
  { href: "/datasets", label: "Datasets" },
  { href: "/labels", label: "Label Rules" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <aside className="w-56 min-h-screen bg-[var(--sidebar)] text-[var(--sidebar-foreground)] p-4 flex flex-col">
      <div className="mb-8 px-3 pt-2">
        <h2 className="text-lg font-bold tracking-tight">Izakaya</h2>
        <p className="text-xs text-white/50 mt-0.5">Data Platform</p>
      </div>
      <nav className="space-y-1 flex-1">
        {links.map((link) => {
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
      </nav>
    </aside>
  );
}
