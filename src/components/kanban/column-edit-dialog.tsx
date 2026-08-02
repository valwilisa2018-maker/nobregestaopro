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
import { Loader2, Trash2 } from "lucide-react";
import { COLUMN_COLORS } from "./types";

export interface EditingColumnState {
  id?: string;
  name: string;
  color: string;
  producer_id?: string | null;
}

export interface ColumnEditDialogProps {
  editingColumn: EditingColumnState | null;
  onOpenChange: (open: boolean) => void;
  onChange: (col: EditingColumnState) => void;
  saving: boolean;
  onSave: () => void;
  onDelete: (id: string) => void;
}

export function ColumnEditDialog({
  editingColumn,
  onOpenChange,
  onChange,
  saving,
  onSave,
  onDelete,
}: ColumnEditDialogProps) {
  return (
    <Dialog open={!!editingColumn} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingColumn?.id ? "Editar Coluna" : "Nova Coluna"}</DialogTitle>
        </DialogHeader>
        {editingColumn && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nome da Coluna</Label>
              <Input
                value={editingColumn.name}
                onChange={(e) => onChange({ ...editingColumn, name: e.target.value })}
                placeholder="Ex: Em Revisão"
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {COLUMN_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${editingColumn.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                    onClick={() => onChange({ ...editingColumn, color: c })}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="flex justify-between sm:justify-between w-full">
          {editingColumn?.id && (
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(editingColumn.id!);
                onOpenChange(false);
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Excluir
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
