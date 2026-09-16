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
import { blockTypeLabel, TERMINAL_BLOCKS, type WorkflowBlock } from "@/lib/workflow-shared";
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
  const isBranch = block.type === "condition" || block.type === "yes_no";
  const isMedia =
    block.type === "send_image" || block.type === "send_video" || block.type === "send_audio";

  const listField = (
    label: string,
    field: "keywords" | "tags",
    placeholder: string,
    hint?: string,
  ) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        disabled={!canEdit}
        value={(block[field] ?? []).join(", ")}
        onChange={(e) =>
          onChange({
            [field]: e.target.value
              .split(",")
              .map((word) => word.trim())
              .filter(Boolean),
          } as Partial<WorkflowBlock>)
        }
        placeholder={placeholder}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  const textField = (label: string, placeholder: string) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea
        rows={5}
        disabled={!canEdit}
        value={block.text ?? ""}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder={placeholder}
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
  );

  const timeoutField = (
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
  );

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
    <div className="max-h-[560px] space-y-4 overflow-auto p-4">
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

      {block.type === "trigger" && (
        <p className="text-sm text-muted-foreground">
          Este bloco marca o início do fluxo. Ligue-o ao primeiro bloco que deve acontecer.
        </p>
      )}

      {block.type === "send_message" &&
        textField("Mensagem", "Olá {{primeiro_nome}}, tudo bem? Eu sou o {{vendedor}}.")}

      {block.type === "broadcast" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Número que recebe o aviso</Label>
            <Input
              disabled={!canEdit}
              value={block.targetPhone ?? ""}
              onChange={(e) => onChange({ targetPhone: e.target.value })}
              placeholder="(11) 99999-0000"
            />
          </div>
          {textField("Aviso", "Novo interessado: {{nome}}")}
        </div>
      )}

      {block.type === "question" && (
        <div className="space-y-3">
          {textField("Pergunta", "Qual produto você procura?")}
          {timeoutField}
        </div>
      )}

      {block.type === "capture_name" && (
        <div className="space-y-3">
          {textField("Pergunta", "Como você se chama?")}
          {timeoutField}
          <p className="text-xs text-muted-foreground">
            A resposta é salva como nome do cliente na ficha dele.
          </p>
        </div>
      )}

      {block.type === "schedule" && (
        <div className="space-y-3">
          {textField("Pergunta do agendamento", "Qual o melhor dia e horário para você?")}
          {timeoutField}
          <p className="text-xs text-muted-foreground">
            O horário informado pelo cliente fica registrado no histórico da conversa.
          </p>
        </div>
      )}

      {isMedia && (
        <div className="space-y-3">
          <MediaUpload
            kind={block.type as "send_image" | "send_video" | "send_audio"}
            value={block.mediaUrl ?? ""}
            canEdit={canEdit}
            onChange={(value) => onChange({ mediaUrl: value })}
          />
          {block.type !== "send_audio" && (
            <div className="space-y-1">
              <Label>Legenda</Label>
              <Input
                disabled={!canEdit}
                value={block.caption ?? ""}
                onChange={(e) => onChange({ caption: e.target.value })}
                placeholder="Veja o catálogo, {{primeiro_nome}}"
              />
            </div>
          )}
        </div>
      )}

      {(block.type === "typing" || block.type === "recording") && (
        <div className="space-y-1">
          <Label>Duração (segundos)</Label>
          <Input
            type="number"
            min={1}
            max={20}
            disabled={!canEdit}
            value={block.seconds ?? 3}
            onChange={(e) => onChange({ seconds: Number(e.target.value) || 0 })}
          />
        </div>
      )}

      {block.type === "wait_reply" && timeoutField}

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

      {isBranch &&
        listField(
          "Palavras que indicam “sim”",
          "keywords",
          "sim, quero, pode enviar",
          "Se a resposta tiver alguma dessas palavras, o fluxo segue pelo caminho “sim”.",
        )}

      {block.type === "tags" &&
        listField(
          "Etiquetas",
          "tags",
          "interessado, orçamento",
          "As etiquetas são adicionadas na ficha do cliente.",
        )}

      {block.type === "sequence" && (
        <div className="space-y-3">
          {listField("Etiquetas", "tags", "em atendimento")}
          {timeoutField}
        </div>
      )}

      {block.type === "webhook" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Endereço do sistema externo</Label>
            <Input
              disabled={!canEdit}
              value={block.url ?? ""}
              onChange={(e) => onChange({ url: e.target.value })}
              placeholder="https://meusistema.com/receber"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Enviamos nome, telefone, etiquetas e a última resposta do cliente.
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

      {isBranch ? (
        <div className="space-y-3">
          {linkSelect("Caminho “sim”", "nextIfMatch")}
          {linkSelect("Caminho “não”", "nextIfNoMatch")}
        </div>
      ) : TERMINAL_BLOCKS.includes(block.type) ? null : (
        linkSelect("Depois deste bloco, ir para", "nextId")
      )}
    </div>
  );
}
