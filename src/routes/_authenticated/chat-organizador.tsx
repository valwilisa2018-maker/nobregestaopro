import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessagesSquare, Send, Paperclip, Mic, Square, Search, FileText, Link2, Link2Off } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORIES,
  detectCategory,
  parseCommandCategory,
  uploadToFolder,
  getSignedUrl,
  type CategoryId,
} from "@/lib/project-folders";

export const Route = createFileRoute("/_authenticated/chat-organizador")({
  component: ChatOrganizador,
});

function ChatOrganizador() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const folders = useQuery({
    queryKey: ["chat_folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folders" as any)
        .select("id, folder_name, client_name, service_type, sale_id, kanban_card_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filteredFolders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return folders.data ?? [];
    return (folders.data ?? []).filter((f: any) =>
      `${f.client_name ?? ""} ${f.folder_name ?? ""}`.toLowerCase().includes(term),
    );
  }, [folders.data, search]);

  const active = useMemo(
    () => (folders.data ?? []).find((f: any) => f.id === activeFolderId) ?? null,
    [folders.data, activeFolderId],
  );

  // Kanban cards (service orders) for linking
  const cards = useQuery({
    queryKey: ["chat_kanban_cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, title, sale_id, sales(customer_id, customers(name), service_types(name))")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const [cardSearch, setCardSearch] = useState("");
  const filteredCards = useMemo(() => {
    const term = cardSearch.trim().toLowerCase();
    return (cards.data ?? []).filter((c: any) => {
      if (!term) return true;
      const name = `${c.title ?? ""} ${c.sales?.customers?.name ?? ""}`.toLowerCase();
      return name.includes(term);
    });
  }, [cards.data, cardSearch]);

  async function linkToCard(cardId: string, saleId: string | null) {
    if (!active) { toast.error("Selecione uma pasta primeiro"); return; }
    const { error } = await supabase
      .from("project_folders" as any)
      .update({ kanban_card_id: cardId, sale_id: saleId })
      .eq("id", active.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pasta vinculada ao card");
    qc.invalidateQueries({ queryKey: ["chat_folders"] });
    qc.invalidateQueries({ queryKey: ["card_folder", cardId] });
  }
  async function unlinkFromCard() {
    if (!active) return;
    const { error } = await supabase
      .from("project_folders" as any)
      .update({ kanban_card_id: null, sale_id: null })
      .eq("id", active.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Desvinculado");
    qc.invalidateQueries({ queryKey: ["chat_folders"] });
  }

  // Auto-select the first folder once they load (or auto-match by what the user typed)
  useEffect(() => {
    if (activeFolderId || !folders.data?.length) return;
    const term = text.trim().toLowerCase();
    const match = term
      ? folders.data.find((f: any) =>
          `${f.client_name ?? ""} ${f.folder_name ?? ""}`.toLowerCase().includes(term),
        )
      : null;
    setActiveFolderId((match ?? folders.data[0]).id);
  }, [folders.data, activeFolderId, text]);

  const msgs = useQuery({
    queryKey: ["chat_messages", activeFolderId],
    enabled: !!activeFolderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folder_messages" as any)
        .select("*")
        .eq("folder_id", activeFolderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs.data]);

  async function sendText() {
    if (!active || !text.trim()) return;
    setSending(true);
    try {
      const { data: ud } = await supabase.auth.getUser();
      const cat = parseCommandCategory(text);
      await supabase.from("project_folder_messages" as any).insert({
        folder_id: active.id,
        sale_id: active.sale_id,
        kanban_card_id: active.kanban_card_id,
        message: text,
        sender_id: ud.user?.id,
      });
      // If command mentions a category and there are recent unsorted files, recategorize the latest "outros"
      if (cat) {
        const { data: pending } = await supabase
          .from("project_folder_files" as any)
          .select("id")
          .eq("folder_id", active.id)
          .eq("file_category", "outros")
          .order("created_at", { ascending: false })
          .limit(5);
        if (pending && pending.length) {
          await supabase
            .from("project_folder_files" as any)
            .update({ file_category: cat })
            .in("id", (pending as any[]).map((p: any) => p.id));
          toast.success(`${pending.length} arquivo(s) movido(s) para ${cat}`);
        }
      }
      setText("");
      qc.invalidateQueries({ queryKey: ["chat_messages", active.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar");
    } finally {
      setSending(false);
    }
  }

  async function sendFiles(list: FileList | null) {
    if (!active || !list) return;
    setSending(true);
    try {
      const { data: ud } = await supabase.auth.getUser();
      for (const file of Array.from(list)) {
        const cat: CategoryId = detectCategory(file);
        const saved = await uploadToFolder({
          folderId: active.id,
          saleId: active.sale_id,
          cardId: active.kanban_card_id,
          file,
          category: cat,
          userId: ud.user?.id ?? null,
        });
        await supabase.from("project_folder_messages" as any).insert({
          folder_id: active.id,
          sale_id: active.sale_id,
          kanban_card_id: active.kanban_card_id,
          file_url: saved.file_url,
          file_id: saved.id,
          sender_id: ud.user?.id,
        });
      }
      toast.success("Enviado");
      qc.invalidateQueries({ queryKey: ["chat_messages", active.id] });
      qc.invalidateQueries({ queryKey: ["project_folder_files", active.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar");
    } finally {
      setSending(false);
    }
  }

  async function toggleRecord() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    if (!active) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
        await sendFiles({ 0: file, length: 1, item: () => file } as any);
      };
      mr.start();
      recRef.current = mr;
      setRecording(true);
    } catch (e: any) {
      toast.error("Não foi possível acessar o microfone");
    }
  }

  async function openSigned(path: string) {
    try {
      const url = await getSignedUrl(path);
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao abrir");
    }
  }

  return (
    <div className="h-[calc(100vh-3rem)] flex">
      <aside className="w-72 border-r flex flex-col">
        <div className="p-3 border-b">
          <div className="flex items-center gap-2 mb-2">
            <MessagesSquare className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Chat Organizador</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." className="pl-7 h-8 text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredFolders.map((f: any) => (
            <button
              key={f.id}
              onClick={() => setActiveFolderId(f.id)}
              className={`w-full text-left px-3 py-2 border-b hover:bg-muted/50 ${activeFolderId === f.id ? "bg-muted" : ""}`}
            >
              <div className="text-sm font-medium truncate">{f.client_name}</div>
              <div className="text-xs text-muted-foreground truncate">{f.service_type}</div>
            </button>
          ))}
          {filteredFolders.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground">Nenhuma pasta.</div>
          )}
        </div>
      </aside>

      <section className="flex-1 flex flex-col">
        <header className="border-b px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Pasta ativa</div>
            <Select value={activeFolderId ?? ""} onValueChange={(v) => setActiveFolderId(v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={folders.isLoading ? "Carregando pastas..." : "Selecione uma pasta"} />
              </SelectTrigger>
              <SelectContent>
                {(folders.data ?? []).map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.client_name} — {f.service_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground max-w-md">
            Envie texto, áudio, imagem, PDF ou vídeo. Comandos: "coloca em referências", "esse pdf é roteiro", "entrega final"...
          </div>
        </header>
        <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {!active && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  {folders.isLoading
                    ? "Carregando pastas..."
                    : (folders.data?.length ?? 0) === 0
                      ? "Nenhuma pasta disponível. Crie uma venda no Kanban para gerar uma pasta automaticamente."
                      : "Selecione uma pasta acima para começar."}
                </div>
              )}
              {(msgs.data ?? []).map((m: any) => (
                <Card key={m.id} className="max-w-2xl">
                  <CardContent className="p-3 space-y-1">
                    {m.message && <div className="text-sm whitespace-pre-wrap">{m.message}</div>}
                    {m.file_url && (
                      <button onClick={() => openSigned(m.file_url)}
                        className="flex items-center gap-2 text-xs text-primary hover:underline">
                        <FileText className="w-3 h-3" /> Abrir arquivo
                      </button>
                    )}
                    <div className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <footer className="border-t p-3 space-y-2">
              <div className="flex items-end gap-2">
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={active ? "Digite uma mensagem ou comando..." : "Selecione uma pasta acima para enviar..."}
                  className="min-h-[50px] flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
                  }}
                />
                <div className="flex flex-col gap-1">
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => sendFiles(e.target.files)} />
                  <Button size="icon" variant="outline" onClick={() => fileRef.current?.click()} disabled={sending || !active} title="Anexar arquivo">
                    <Paperclip className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant={recording ? "destructive" : "outline"} onClick={toggleRecord} disabled={!active && !recording} title="Gravar áudio">
                    {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                  <Button size="icon" onClick={sendText} disabled={sending || !text.trim() || !active} title="Enviar">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground">Categorias: {CATEGORIES.map((c) => c.label).join(" • ")}</div>
            </footer>
        </>
      </section>

      <aside className="w-80 border-l flex flex-col">
        <div className="p-3 border-b">
          <div className="text-sm font-semibold mb-2">Cards do Kanban</div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input value={cardSearch} onChange={(e) => setCardSearch(e.target.value)} placeholder="Buscar card..." className="pl-7 h-8 text-sm" />
          </div>
          {active && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              Pasta ativa: <span className="font-medium text-foreground">{active.folder_name}</span>
              {active.kanban_card_id && (
                <button onClick={unlinkFromCard} className="ml-2 inline-flex items-center gap-1 text-destructive hover:underline">
                  <Link2Off className="w-3 h-3" /> desvincular
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {cards.isLoading && <div className="p-3 text-xs text-muted-foreground">Carregando...</div>}
          {filteredCards.map((c: any) => {
            const linked = active?.kanban_card_id === c.id;
            return (
              <div key={c.id} className={`px-3 py-2 border-b ${linked ? "bg-primary/5" : ""}`}>
                <div className="text-sm font-medium truncate">{c.sales?.customers?.name ?? c.title}</div>
                <div className="text-[11px] text-muted-foreground truncate">{c.sales?.service_types?.name ?? c.title}</div>
                <Button
                  size="sm"
                  variant={linked ? "secondary" : "default"}
                  className="h-7 text-xs mt-1"
                  disabled={!active || linked}
                  onClick={() => linkToCard(c.id, c.sale_id)}
                >
                  <Link2 className="w-3 h-3 mr-1" /> {linked ? "Vinculado" : "Vincular pasta"}
                </Button>
              </div>
            );
          })}
          {!cards.isLoading && filteredCards.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">Nenhum card encontrado.</div>
          )}
        </div>
      </aside>
    </div>
  );
}