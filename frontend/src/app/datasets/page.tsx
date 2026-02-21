"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Dataset {
  id: number;
  name: string;
  type: string;
  description: string;
  created_at: string;
  updated_at: string;
}

function DatasetList() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);

  useEffect(() => {
    api("/api/datasets/")
      .then((res) => res.json())
      .then(setDatasets);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--primary)]">Datasets</h1>
        <Button asChild>
          <Link href="/datasets/new">Create Dataset</Link>
        </Button>
      </div>
      {datasets.length === 0 ? (
        <p className="text-[var(--muted-foreground)]">
          No datasets created yet.
        </p>
      ) : (
        <div className="rounded-lg border border-[var(--border)] bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link
                      href={`/datasets/${d.id}`}
                      className="text-[var(--primary)] font-medium hover:underline"
                    >
                      {d.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{d.type}</Badge>
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {d.description || "\u2014"}
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {new Date(d.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function DatasetsPage() {
  return (
    <AuthGuard>
      <DatasetList />
    </AuthGuard>
  );
}
