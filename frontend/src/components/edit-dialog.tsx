"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EditDialogProps {
  open: boolean;
  onSave: (value: string) => void;
  onCancel: () => void;
  title: string;
  label: string;
  defaultValue: string;
  loading?: boolean;
}

function EditForm({
  onSave,
  onCancel,
  label,
  defaultValue,
  loading = false,
}: Omit<EditDialogProps, "open" | "title">) {
  const [value, setValue] = useState(defaultValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSave(value.trim());
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-2 py-4">
        <Label htmlFor="edit-field">{label}</Label>
        <Input
          id="edit-field"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading || !value.trim()}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditDialog({
  open,
  onSave,
  onCancel,
  title,
  label,
  defaultValue,
  loading = false,
}: EditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {open && (
          <EditForm
            onSave={onSave}
            onCancel={onCancel}
            label={label}
            defaultValue={defaultValue}
            loading={loading}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
