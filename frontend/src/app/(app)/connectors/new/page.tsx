"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useConnectorTypes } from "@/hooks/use-connectors";
import { createConnector, finalizeConnector } from "@/lib/api/connectors";
import type { ConnectorType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ServiceAutocomplete = ({
  value,
  onChange,
  types,
}: {
  value: string;
  onChange: (id: string) => void;
  types: ConnectorType[];
}) => {
  const [userQuery, setUserQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const displayText = useMemo(() => {
    if (isTyping) return userQuery;
    if (value) {
      const match = types.find((t) => t.id === value);
      return match ? match.name : value;
    }
    return "";
  }, [isTyping, userQuery, value, types]);

  const query = isTyping ? userQuery : displayText;

  const filtered = useMemo(() => {
    if (!query) return types;
    const q = query.toLowerCase();
    return types.filter(
      (t) => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
    );
  }, [query, types]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        type="text"
        value={displayText}
        onChange={(e) => {
          setUserQuery(e.target.value);
          setIsTyping(true);
          onChange("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search connector types..."
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-[var(--border)] rounded-md shadow-lg max-h-60 overflow-auto text-sm">
          {filtered.slice(0, 50).map((t) => (
            <li
              key={t.id}
              onClick={() => {
                onChange(t.id);
                setIsTyping(false);
                setOpen(false);
              }}
              className="px-3 py-2 hover:bg-[var(--accent-light)] cursor-pointer flex justify-between"
            >
              <span>{t.name}</span>
              <span className="text-[var(--muted-foreground)] text-xs">{t.id}</span>
            </li>
          ))}
          {filtered.length > 50 && (
            <li className="px-3 py-2 text-[var(--muted-foreground)] text-xs">
              {filtered.length - 50} more — keep typing to narrow down
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

const NewConnector = () => {
  const router = useRouter();
  const { data: connectorTypes = [] } = useConnectorTypes();
  const [name, setName] = useState("");
  const [service, setService] = useState("");
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !service) return;
    setLoading(true);
    setError("");
    try {
      const data = await createConnector({ name: name.trim(), service });
      const connectorId = data.id;
      const connectCardUrl = data.connect_card_url;

      const popup = window.open(
        connectCardUrl,
        "fivetran_connect_card",
        "width=800,height=700,menubar=no,toolbar=no,location=no,status=no"
      );

      if (!popup) {
        setError("Popup blocked — please allow popups for this site and try again.");
        setLoading(false);
        return;
      }

      setLoading(false);
      setWaiting(true);

      const interval = setInterval(async () => {
        if (!popup.closed) return;
        clearInterval(interval);
        setWaiting(false);
        try {
          await finalizeConnector(connectorId);
        } catch {
          // still redirect even if finalize fails
        }
        router.push(`/connectors/${connectorId}`);
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl text-[var(--primary)]">Add Connector</CardTitle>
      </CardHeader>
      <CardContent>
        {waiting ? (
          <div className="text-center py-12">
            <p className="text-[var(--foreground)] mb-2">
              Complete the connector setup in the Fivetran popup window.
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              This page will update automatically when you close the popup.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Connector Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Google Ads Production"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Service Type</Label>
              <ServiceAutocomplete
                value={service}
                onChange={setService}
                types={connectorTypes}
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={loading || !name.trim() || !service}>
                {loading ? "Creating..." : "Continue"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/connectors")}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
};

const NewConnectorPage = () => <NewConnector />;
export default NewConnectorPage;
