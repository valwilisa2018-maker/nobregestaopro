import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/backup")({
  component: () => {
    const exportTable = async (table: string) => {
      const { data, error } = await supabase.from(table as any).select("*");
      if (error) return toast.error(error.message);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${table}-${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${table} exportado`);
    };
    const tables = ["customers", "sales", "service_orders", "invoices", "sellers", "producers"];
    return (
      <div className="space-y-6">
        <div><h1 className="text-3xl font-bold tracking-tight">Backup e Exportação</h1><p className="text-muted-foreground">Exporte cópias dos dados em JSON</p></div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tables.map((t) => (
            <Card key={t} className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
              <CardHeader><CardTitle className="capitalize text-base">{t.replace("_", " ")}</CardTitle></CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" onClick={() => exportTable(t)}>
                  <Download className="w-4 h-4 mr-2" />Exportar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  },
});