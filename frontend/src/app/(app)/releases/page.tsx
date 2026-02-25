"use client";

import { useState } from "react";
import Link from "next/link";
import { useReleases, useCreateRelease } from "@/hooks/use-releases";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/shared/error-banner";

const ReleasesPage = () => {
  const { data: releases = [], isLoading, error } = useReleases();
  const createMutation = useCreateRelease();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [compareIds, setCompareIds] = useState<number[]>([]);

  const handleCreate = () => {
    if (!name.trim()) return;
    createMutation.mutate(
      { name: name.trim(), description: description.trim() || undefined },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setName("");
          setDescription("");
        },
      }
    );
  };

  const toggleCompare = (id: number) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev
    );
  };

  if (error) return <ErrorBanner message={error.message} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--primary)]">Releases</h1>
        <div className="flex items-center gap-2">
          {compareIds.length === 2 && (
            <Button asChild variant="outline">
              <Link href={`/releases/compare?r1=${compareIds[0]}&r2=${compareIds[1]}`}>
                Compare Selected
              </Link>
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)}>Create Release</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Releases</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-[var(--muted-foreground)] text-sm">Loading...</p>
          ) : releases.length === 0 ? (
            <p className="text-[var(--muted-foreground)] text-sm">
              No releases yet. Run a pipeline and create your first release.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Data Sources</TableHead>
                  <TableHead>Total Rows</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={compareIds.includes(r.id)}
                        onChange={() => toggleCompare(r.id)}
                        disabled={!compareIds.includes(r.id) && compareIds.length >= 2}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">v{r.version}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/releases/${r.id}`} className="text-[var(--primary)] hover:underline">
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell>{r.data_source_count}</TableCell>
                    <TableCell>{r.total_rows.toLocaleString()}</TableCell>
                    <TableCell className="text-[var(--muted-foreground)]">
                      {new Date(r.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/releases/${r.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(v) => !v && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Release</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q4 2025 Final"
                className="flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes about this release..."
                rows={3}
                className="flex w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Release"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ReleasesListPage = () => <ReleasesPage />;
export default ReleasesListPage;
