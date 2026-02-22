"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DatasetType {
  id: string;
  name: string;
  description: string;
}

function CreateDataset() {
  const router = useRouter();
  const [types, setTypes] = useState<DatasetType[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api("/api/datasets/types")
      .then((res) => res.json())
      .then((data: DatasetType[]) => {
        setTypes(data);
        if (data.length > 0) setType(data[0].id);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !type) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await api("/api/datasets", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), type, description }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to create dataset");
      }
      const dataset = await res.json();
      router.push(`/datasets/${dataset.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/datasets"
          className="text-[var(--primary)] hover:underline text-sm"
        >
          &larr; Back to Datasets
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-[var(--primary)] mb-6">
        Create Dataset
      </h1>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg">Dataset Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. AU Sales Data"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                required
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {types.find((t) => t.id === type) && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  {types.find((t) => t.id === type)?.description}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this dataset"
              />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Creating..." : "Create Dataset"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CreateDatasetPage() {
  return <CreateDataset />;
}
