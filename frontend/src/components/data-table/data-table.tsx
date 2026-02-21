"use client";

import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  OnChangeFn,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface DataTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  loading?: boolean;
}

export function DataTable({
  columns,
  rows,
  totalCount,
  page,
  pageSize,
  onPageChange,
  sorting,
  onSortingChange,
  loading,
}: DataTableProps) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const activeSorting = sorting ?? internalSorting;
  const activeOnSortingChange = onSortingChange ?? setInternalSorting;

  const columnDefs: ColumnDef<Record<string, unknown>>[] = columns.map(
    (col) => ({
      accessorKey: col,
      header: col,
      cell: (info) => {
        const val = info.getValue();
        if (val === null || val === undefined) return "—";
        return String(val);
      },
    })
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    state: { sorting: activeSorting },
    onSortingChange: activeOnSortingChange,
  });

  const totalPages = Math.ceil(totalCount / pageSize);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-10 bg-[var(--muted)] rounded animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0 && totalCount === 0) {
    return (
      <p className="text-[var(--muted-foreground)] text-sm py-8 text-center">
        No data available.
      </p>
    );
  }

  return (
    <div>
      <div className="rounded-md border border-[var(--border)] overflow-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {header.column.getIsSorted() === "asc"
                      ? " \u2191"
                      : header.column.getIsSorted() === "desc"
                        ? " \u2193"
                        : ""}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className="whitespace-nowrap font-mono text-xs"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-[var(--muted-foreground)]">
          {totalCount.toLocaleString()} row{totalCount !== 1 ? "s" : ""} total
          {totalPages > 1 &&
            ` \u00b7 Page ${page + 1} of ${totalPages}`}
        </p>
        {totalPages > 1 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
