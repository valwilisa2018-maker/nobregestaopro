import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MESSAGE_VARIABLES } from "@/lib/followup-shared";
import { blockTypeLabel, type WorkflowBlock } from "@/lib/workflow-shared";
import { BLOCK_VISUAL } from "./block-meta";
import { Trash2 } from "lucide-react";

const NONE = "__none__";

type Props = {
  block: WorkflowBlock | null;
  blocks: WorkflowBlock[];
  canEdit: boolean;
  onChange: (patch: Partial<WorkflowBlock>) => void;
  onDelete: () => void;
};

export function BlockProperties({ block, blocks, canEdit, onChange, onDelete }: Props) {
  if (!block) {
    return (
      <div className="p-4">
        <p className="text-sm font-semibold">Propriedades</p>
        <p className="mt-1 text-sm text-muted-foreground">Clique em um bloco para editar.</p>
      </div>
    );
  }

  const visual = BLOCK_VISUAL[block.type];
  const Icon = visual.icon;
  const others = blocks.filter((b) => b.id !== block.id);

  const linkSelect = (
    label: string,
    field: "nextId" | "nextIfMatch" | "nextIfNoMatch",
    hint?: string,
  ) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select
        disabled={!canEdit}
        value={block[field] ?? NONE}
        onValueChange={(value) => onChange({ [field]: value === NONE ? null : value })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Bloco seguinte" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Bloco seguinte da lista</SelectItem>
          {others.map((other) => (
            <SelectItem key={other.id} value={other.id}>
              {blockTypeLabel(other.type)} — {(other.text ?? "").slice(0, 24) || other.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-md p-1.5 ${visual.chip}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">{blockTypeLabel(block.type)}</p>
            <p className="text-xs text-muted-foreground">Propriedades do bloco</p>
          </div>
        </div>
        {canEdit && (
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Excluir bloco">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {block.type === "send_message" && (
        <div className="space-y-2">
          <Label>Mensagem</Label>
          <Textarea
            rows={5}
            disabled={!canEdit}
            value={block.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Olá {{primeiro_nome}}, tudo bem? Eu sou o {{vendedor}}."
          />
          {canEdit && (
            <div className="flex flex-wrap gap-1">
              {MESSAGE_VARIABLES.map((variable) => (
                <Button
                  key={variable}
                  size="sm"
                  variant="outline"
                  onClick={() => onChange({ text: `${block.text ?? ""}${variable}` })}
                >
                  {variable}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {block.type === "wait_reply" && (
        <div className="space-y-1">
          <Label>Esperar até (minutos)</Label>
          <Input
            type="number"
            min={5}
            disabled={!canEdit}
            value={block.timeoutMinutes ?? 1440}
            onChange={(e) => onChange({ timeoutMinutes: Number(e.target.value) || 0 })}
          />
        </div>
      )}

      {block.type === "delay" && (
        <div className="space-y-1">
          <Label>Aguardar (minutos)</Label>
          <Input
            type="number"
            min={1}
            disabled={!canEdit}
            value={block.waitMinutes ?? 60}
            onChange={(e) => onChange({ waitMinutes: Number(e.target.value) || 0 })}
          />
        </div>
      )}

      {block.type === "condition" && (
        <div className="space-y-1">
          <Label>Palavras que indicam “sim”</Label>
          <Input
            disabled={!canEdit}
            value={(block.keywords ?? []).join(", ")}
            onChange={(e) =>
              onChange({
                keywords: e.target.value
                  .split(",")
                  .map((word) => word.trim())
                  .filter(Boolean),
              })
            }
            placeholder="sim, quero, pode enviar"
          />
          <p className="text-xs text-muted-foreground">
            Se a resposta tiver alguma dessas palavras, o fluxo segue pelo caminho “sim”.
          </p>
        </div>
      )}

      {block.type === "assign_seller" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>O que fazer com a automação</Label>
            <Select
              value={block.transferMode ?? "keep_owner"}
              onValueChange={(value) =>
                onChange({ transferMode: value as WorkflowBlock["transferMode"] })
              }
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep_owner">Continuar o fluxo mantendo o dono atual</SelectItem>
                <SelectItem value="end_current">Encerrar este fluxo</SelectItem>
                <SelectItem value="start_target">Encaminhar para o novo vendedor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Observação</Label>
            <Input
              disabled={!canEdit}
              value={block.note ?? ""}
              onChange={(e) => onChange({ note: e.target.value })}
              placeholder="Cliente pediu orçamento"
            />
          </div>
        </div>
      )}

      {block.type === "condition" ? (
        <div className="space-y-3">
          {linkSelect("Caminho “sim”", "nextIfMatch")}
          {linkSelect("Caminho “não”", "nextIfNoMatch")}
        </div>
      ) : block.type === "end" || block.type === "handoff" ? null : (
        linkSelect("Depois deste bloco, ir para", "nextId")
      )}
    </div>
  );
}
