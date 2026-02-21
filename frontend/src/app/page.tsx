import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-3xl text-[var(--primary)]">
          Izakaya
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-[var(--muted-foreground)]">
          Data ingestion platform. Use the sidebar to navigate.
        </p>
      </CardContent>
    </Card>
  );
}
