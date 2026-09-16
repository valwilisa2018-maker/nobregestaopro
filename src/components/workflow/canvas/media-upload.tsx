import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/error-messages";
import { useSignedUrl } from "@/lib/storage-signed";
import { Loader2, Trash2, Upload } from "lucide-react";

const BUCKET = "workflow-media";

const ACCEPT: Record<string, string> = {
  send_image: "image/*",
  send_video: "video/*",
  send_audio: "audio/*",
};

const MAX_BYTES = 50 * 1024 * 1024;

type Props = {
  kind: "send_image" | "send_video" | "send_audio";
  value?: string | null;
  canEdit: boolean;
  onChange: (value: string) => void;
};

function extensionOf(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "bin";
}

export function MediaUpload({ kind, value, canEdit, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const isLink = /^https?:\/\//i.test((value ?? "").trim());
  const preview = useSignedUrl(BUCKET, isLink ? null : value);
  const src = isLink ? (value ?? "") : preview;

  const upload = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("O arquivo precisa ter até 50 MB.");
      return;
    }
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getUser();
      const uid = session.user?.id ?? "anon";
      const path = `${uid}/${crypto.randomUUID()}.${extensionOf(file.name)}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw error;
      onChange(path);
      toast.success("Arquivo enviado.");
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível enviar o arquivo."));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label>Arquivo</Label>

      {src && (
        <div className="overflow-hidden rounded-lg border bg-muted/30 p-2">
          {kind === "send_image" && (
            <img src={src} alt="Arquivo do bloco" className="max-h-40 w-full rounded object-contain" />
          )}
          {kind === "send_video" && <video src={src} controls className="max-h-40 w-full rounded" />}
          {kind === "send_audio" && <audio src={src} controls className="w-full" />}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[kind]}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canEdit || busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {value ? "Trocar arquivo" : "Enviar arquivo do computador"}
        </Button>
        {value && canEdit && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
            <Trash2 className="mr-2 h-4 w-4" /> Remover
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Ou cole um link do arquivo</Label>
        <Input
          disabled={!canEdit}
          value={isLink ? (value ?? "") : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Aceita até 50 MB. O arquivo fica guardado com segurança e é enviado ao cliente no momento da
        conversa.
      </p>
    </div>
  );
}
