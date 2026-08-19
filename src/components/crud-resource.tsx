import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "boolean" | "select" | "email" | "url" | "password";
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
  listColumn?: boolean; // show in table
};

type Row = Record<string, unknown> & { id: string };

interface CrudResourceProps {
  table: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  singular: string; // "Agente"
  fields: FieldDef[];
  orderBy?: string;
  ascending?: boolean;
  renderRow?: (row: Row) => ReactNode;
}

export function CrudResource({
  table,
  title,
  description,
  icon,
  singular,
  fields,
  orderBy = "created_at",
  ascending = false,
  renderRow,
}: CrudResourceProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from(table as never)
      .select("*")
      .order(orderBy, { ascending });
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as Row[]);
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user, table]);

  const openCreate = () => {
    const initial: Record<string, unknown> = {};
    for (const f of fields) initial[f.name] = f.defaultValue ?? (f.type === "boolean" ? true : "");
    setForm(initial);
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (row: Row) => {
    const initial: Record<string, unknown> = {};
    for (const f of fields) initial[f.name] = row[f.name] ?? "";
    setForm(initial);
    setEditing(row);
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const payload: Record<string, unknown> = { ...form, user_id: user.id };
    for (const f of fields) {
      if (f.type === "number" && payload[f.name] !== "" && payload[f.name] != null) {
        payload[f.name] = Number(payload[f.name]);
      }
      if (payload[f.name] === "") payload[f.name] = null;
    }
    const q = editing
      ? supabase
          .from(table as never)
          .update(payload as never)
          .eq("id", editing.id)
      : supabase.from(table as never).insert(payload as never);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Atualizado" : "Criado");
    setOpen(false);
    load();
  };

  const remove = async (row: Row) => {
    if (!confirm(`Excluir "${(row.name as string) ?? row.id}"?`)) return;
    const { error } = await supabase
      .from(table as never)
      .delete()
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    load();
  };

  const listCols = fields.filter((f) => f.listColumn ?? true).slice(0, 4);

  return (
    <PageShell
      title={title}
      description={description}
      icon={icon}
      status="ativo"
      actions={
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo {singular}
        </Button>
      }
    >
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
                <Inbox className="h-6 w-6" />
              </div>
              <p className="text-muted-foreground">Nenhum {singular.toLowerCase()} cadastrado.</p>
              <Button onClick={openCreate} variant="outline">
                <Plus className="h-4 w-4" /> Criar primeiro
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-left">
                  <tr>
                    {listCols.map((c) => (
                      <th key={c.name} className="px-4 py-3 font-medium">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border hover:bg-muted/30">
                      {renderRow
                        ? renderRow(row)
                        : listCols.map((c) => (
                            <td key={c.name} className="px-4 py-3">
                              {formatCell(row[c.name], c)}
                            </td>
                          ))}
                      <td className="px-4 py-3 text-right space-x-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Editar"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Excluir"
                          onClick={() => remove(row)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar ${singular}` : `Novo ${singular}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            {fields.map((f) => (
              <div key={f.name} className="space-y-2">
                <Label htmlFor={f.name}>
                  {f.label}
                  {f.required && " *"}
                </Label>
                {f.type === "textarea" ? (
                  <Textarea
                    id={f.name}
                    value={(form[f.name] as string) ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                    rows={4}
                  />
                ) : f.type === "boolean" ? (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={Boolean(form[f.name])}
                      onCheckedChange={(v) => setForm((s) => ({ ...s, [f.name]: v }))}
                    />
                    <span className="text-sm text-muted-foreground">
                      {form[f.name] ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                ) : f.type === "select" ? (
                  <Select
                    value={(form[f.name] as string) ?? ""}
                    onValueChange={(v) => setForm((s) => ({ ...s, [f.name]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={f.placeholder ?? "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options?.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={f.name}
                    type={f.type ?? "text"}
                    placeholder={f.placeholder}
                    value={(form[f.name] as string | number) ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function formatCell(value: unknown, f: FieldDef) {
  if (value == null || value === "") return <span className="text-muted-foreground">—</span>;
  if (f.type === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return <code className="text-xs">{JSON.stringify(value)}</code>;
  return String(value);
}
