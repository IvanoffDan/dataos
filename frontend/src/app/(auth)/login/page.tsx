"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const features = [
  {
    title: "Ingest from 300+ sources",
    description:
      "Connect ad platforms, CRMs, analytics tools, and more via Fivetran — automated syncs, zero maintenance.",
  },
  {
    title: "MMM-ready datasets",
    description:
      "Define target schemas that match Marketing Mix Model inputs — spend, impressions, clicks, conversions by channel and geo.",
  },
  {
    title: "Standardize & label",
    description:
      "Normalize messy channel names, geographies, and campaign taxonomies with rule-based transformations.",
  },
  {
    title: "QA before you model",
    description:
      "Catch gaps, outliers, and mismatches before data reaches GrowthOS — so your MMM results are reliable from day one.",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      router.push("/");
    } catch {
      setError("Invalid credentials");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left — marketing hero */}
      <div className="hidden lg:flex lg:w-1/2 bg-[var(--sidebar)] text-white flex-col justify-center px-16">
        <div className="max-w-md">
          <h1 className="text-4xl font-bold tracking-tight mb-2">DataOS</h1>
          <p className="text-white/60 text-lg mb-3">
            Data preparation for Marketing Mix Modeling
          </p>
          <p className="text-white/40 text-sm mb-10 leading-relaxed">
            Get clean, structured, model-ready data into GrowthOS.
            Connect every marketing channel, standardize messy taxonomies,
            and QA before you model.
          </p>

          <div className="space-y-6">
            {features.map((f) => (
              <div key={f.title} className="flex gap-4">
                <div className="mt-1 h-2 w-2 rounded-full bg-[var(--accent)] shrink-0" />
                <div>
                  <p className="font-medium text-sm">{f.title}</p>
                  <p className="text-white/50 text-sm mt-0.5">
                    {f.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex flex-1 items-center justify-center bg-[var(--background)] px-6">
        <div className="w-full max-w-sm">
          {/* Brand visible on mobile where left panel is hidden */}
          <div className="lg:hidden mb-8 text-center">
            <h1 className="text-3xl font-bold text-[var(--primary)]">DataOS</h1>
            <p className="text-[var(--muted-foreground)] text-sm mt-1">
              Data preparation for Marketing Mix Modeling
            </p>
          </div>

          <h2 className="text-2xl font-bold text-[var(--primary)] mb-1">
            Sign in
          </h2>
          <p className="text-[var(--muted-foreground)] text-sm mb-6">
            Enter your credentials to continue
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-red-700 text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
