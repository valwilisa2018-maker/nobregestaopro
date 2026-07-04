import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays, addMinutes, addMonths, endOfMonth, endOfWeek, format, isSameDay,
  isSameMonth, parse, startOfDay, startOfMonth, startOfWeek, differenceInMinutes,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, ChevronLeft, ChevronRight, Menu, Sparkles, Send, Trash2, Edit3, Bot,
  CalendarDays, Clock, Users as UsersIcon, AlignLeft, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Agenda — Plataforma IA" }] }),
  component: CalendarPage,
});

// -------- Types & storage --------
type CalId = "primary" | "work" | "personal" | "ai";
type EventItem = {
  id: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
  description?: string;
  guests?: string;
  calendar: CalId;
  createdByAi?: boolean;
  connectionId?: string | null; // WhatsApp/instance owner
};
const CAL_META: Record<CalId, { label: string; color: string; ring: string; bg: string }> = {
  primary:  { label: "Principal", color: "#3b82f6", ring: "ring-blue-500", bg: "bg-blue-500" },
  work:     { label: "Trabalho",  color: "#10b981", ring: "ring-emerald-500", bg: "bg-emerald-500" },
  personal: { label: "Pessoal",   color: "#f59e0b", ring: "ring-amber-500", bg: "bg-amber-500" },
  ai:       { label: "IA",        color: "#a855f7", ring: "ring-purple-500", bg: "bg-purple-500" },
};
const LS_KEY = "calendar.events.v1";
const uid = () => Math.random().toString(36).slice(2, 10);

function useEvents() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setEvents(JSON.parse(raw));
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(LS_KEY, JSON.stringify(events));
  }, [events, loaded]);
  return { events, setEvents, loaded };
}

function overlaps(a: EventItem, b: EventItem) {
  if (a.id === b.id) return false;
  if (a.calendar !== b.calendar) return false;
  if ((a.connectionId ?? null) !== (b.connectionId ?? null)) return false;
  const as = +new Date(a.start), ae = +new Date(a.end);
  const bs = +new Date(b.start), be = +new Date(b.end);
  return as < be && bs < ae;
}

// -------- Page --------
type ViewMode = "day" | "week" | "month" | "agenda";

function CalendarPage() {
  const { events, setEvents, loaded } = useEvents();
  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [enabledCals, setEnabledCals] = useState<Record<CalId, boolean>>({
    primary: true, work: true, personal: true, ai: true,
  });
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [connections, setConnections] = useState<Array<{ id: string; name: string; phone_number: string | null; status: string | null }>>([]);
  const [activeConn, setActiveConn] = useState<string>("all"); // "all" | connection id

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("connections").select("id,name,phone_number,status").order("created_at", { ascending: true });
      setConnections(data ?? []);
    })();
  }, []);

  const visible = useMemo(
    () => events.filter((e) => enabledCals[e.calendar] && (activeConn === "all" || (e.connectionId ?? null) === activeConn)),
    [events, enabledCals, activeConn],
  );

  function openCreate(prefill?: Partial<EventItem>) {
    const start = prefill?.start ?? new Date(cursor).setHours(9, 0, 0, 0);
    const end = prefill?.end ?? new Date(start as number).valueOf() + 60 * 60 * 1000;
    setEditing({
      id: "",
      title: prefill?.title ?? "",
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      description: prefill?.description ?? "",
      guests: prefill?.guests ?? "",
      calendar: prefill?.calendar ?? "primary",
      createdByAi: prefill?.createdByAi,
      connectionId: prefill?.connectionId ?? (activeConn !== "all" ? activeConn : null),
    });
    setModalOpen(true);
  }
  function openEdit(ev: EventItem) { setEditing(ev); setModalOpen(true); }
  function saveEvent(ev: EventItem) {
    if (!ev.title.trim()) return toast.error("Título é obrigatório");
    if (+new Date(ev.end) <= +new Date(ev.start)) return toast.error("Hora final deve ser após a inicial");
    const conflict = events.some((x) => overlaps(ev, x));
    if (conflict) return toast.error("Choque de horário no mesmo calendário");
    setEvents((prev) => {
      if (ev.id) return prev.map((x) => (x.id === ev.id ? ev : x));
      return [...prev, { ...ev, id: uid() }];
    });
    toast.success(ev.id ? "Evento atualizado" : "Evento criado");
    setModalOpen(false);
  }
  function deleteEvent(id: string) {
    setEvents((p) => p.filter((e) => e.id !== id));
    toast.success("Evento excluído");
    setModalOpen(false);
  }

  const Sidebar = (
    <aside className="w-72 shrink-0 border-r bg-background p-4 flex flex-col gap-4">
      <Button onClick={() => openCreate()} className="rounded-full shadow-md">
        <Plus className="h-4 w-4" /> Criar evento
      </Button>
      <MiniCalendar value={cursor} onChange={setCursor} events={visible} />
      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Instância WhatsApp</div>
        <Select value={activeConn} onValueChange={setActiveConn}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as instâncias</SelectItem>
            {connections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.status === "open" ? "🟢" : "⚪"} {c.name}{c.phone_number ? ` · ${c.phone_number}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-[10px] text-muted-foreground">Cada instância tem sua própria agenda.</div>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Meus calendários</div>
        {(Object.keys(CAL_META) as CalId[]).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-2 py-1">
            <Checkbox
              checked={enabledCals[k]}
              onCheckedChange={(v) => setEnabledCals((s) => ({ ...s, [k]: !!v }))}
            />
            <span className={cn("h-3 w-3 rounded-sm", CAL_META[k].bg)} />
            <span>{CAL_META[k].label}</span>
          </label>
        ))}
      </div>
      <div className="mt-auto text-[11px] text-muted-foreground">Fuso: América/São_Paulo (UTC-3)</div>
    </aside>
  );

  return (
    <div className="flex h-[calc(100vh-3rem)] bg-background text-foreground">
      <div className="hidden lg:block">{Sidebar}</div>
      <Sheet>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center gap-2 px-3">
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <CalendarDays className="h-5 w-5 text-primary" />
            <h1 className="font-semibold">Agenda</h1>
            <div className="mx-3 h-6 w-px bg-border" />
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Hoje</Button>
            <Button variant="ghost" size="icon" onClick={() => setCursor(shift(cursor, view, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => setCursor(shift(cursor, view, 1))}><ChevronRight className="h-4 w-4" /></Button>
            <div className="font-medium capitalize">{format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}</div>
            <div className="ml-auto">
              <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
                <TabsList>
                  <TabsTrigger value="day">Dia</TabsTrigger>
                  <TabsTrigger value="week">Semana</TabsTrigger>
                  <TabsTrigger value="month">Mês</TabsTrigger>
                  <TabsTrigger value="agenda">Agenda</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-hidden">
            {!loaded ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (
              <Tabs value={view} className="h-full">
                <TabsContent value="day" className="h-full m-0">
                  <TimeGrid days={[cursor]} events={visible} onSlot={(d) => openCreate({ start: d.toISOString(), end: addMinutes(d, 60).toISOString() })} onOpen={openEdit} />
                </TabsContent>
                <TabsContent value="week" className="h-full m-0">
                  <TimeGrid days={weekDays(cursor)} events={visible} onSlot={(d) => openCreate({ start: d.toISOString(), end: addMinutes(d, 60).toISOString() })} onOpen={openEdit} />
                </TabsContent>
                <TabsContent value="month" className="h-full m-0">
                  <MonthView cursor={cursor} events={visible} onDay={(d) => { setCursor(d); setView("day"); }} onOpen={openEdit} />
                </TabsContent>
                <TabsContent value="agenda" className="h-full m-0">
                  <AgendaView events={visible} onOpen={openEdit} />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
        <SheetContent side="left" className="p-0 w-72">{Sidebar}</SheetContent>
      </Sheet>

      <EventModal
        open={modalOpen}
        event={editing}
        onOpenChange={setModalOpen}
        onSave={saveEvent}
        onDelete={deleteEvent}
        connections={connections}
      />
    </div>
  );
}

// -------- Helpers --------
function shift(d: Date, view: ViewMode, dir: number) {
  if (view === "day") return addDays(d, dir);
  if (view === "week") return addDays(d, dir * 7);
  if (view === "month") return addMonths(d, dir);
  return addDays(d, dir * 7);
}
function weekDays(d: Date) {
  const start = startOfWeek(d, { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// -------- Mini calendar --------
function MiniCalendar({ value, onChange, events }: { value: Date; onChange: (d: Date) => void; events: EventItem[] }) {
  const [month, setMonth] = useState(startOfMonth(value));
  useEffect(() => setMonth(startOfMonth(value)), [value]);
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const hasEvent = (d: Date) => events.some((e) => isSameDay(new Date(e.start), d));
  return (
    <div className="border rounded-lg p-2">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-sm font-medium capitalize">{format(month, "MMMM yyyy", { locale: ptBR })}</span>
        <div className="flex">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-3 w-3" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-3 w-3" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-[10px] text-muted-foreground text-center">
        {["D","S","T","Q","Q","S","S"].map((d, i) => <div key={i} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 text-xs">
        {days.map((d, i) => {
          const sel = isSameDay(d, value);
          const today = isSameDay(d, new Date());
          const dim = !isSameMonth(d, month);
          return (
            <button
              key={i}
              onClick={() => onChange(d)}
              className={cn(
                "aspect-square flex flex-col items-center justify-center rounded transition-colors hover:bg-accent",
                dim && "text-muted-foreground/50",
                today && !sel && "text-primary font-semibold",
                sel && "bg-primary text-primary-foreground font-semibold",
              )}
            >
              <span>{format(d, "d")}</span>
              {hasEvent(d) && !sel && <span className="h-1 w-1 rounded-full bg-primary mt-0.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -------- Time grid (Day/Week) --------
function TimeGrid({ days, events, onSlot, onOpen }: {
  days: Date[]; events: EventItem[];
  onSlot: (d: Date) => void; onOpen: (e: EventItem) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const HOUR_H = 48;

  return (
    <ScrollArea className="h-full">
      <div className="min-w-[600px]">
        <div className="grid sticky top-0 z-10 bg-background border-b" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
          <div />
          {days.map((d, i) => {
            const today = isSameDay(d, new Date());
            return (
              <div key={i} className="py-2 text-center border-l">
                <div className="text-xs text-muted-foreground uppercase">{format(d, "EEE", { locale: ptBR })}</div>
                <div className={cn("text-xl font-semibold", today && "text-primary")}>{format(d, "d")}</div>
              </div>
            );
          })}
        </div>
        <div className="grid relative" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
          <div>
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_H }} className="text-[10px] text-muted-foreground text-right pr-1 -translate-y-2">
                {h > 0 && `${String(h).padStart(2,"0")}:00`}
              </div>
            ))}
          </div>
          {days.map((d, di) => {
            const dayEvents = events.filter((e) => isSameDay(new Date(e.start), d));
            const today = isSameDay(d, new Date());
            const nowTop = (now.getHours() + now.getMinutes()/60) * HOUR_H;
            return (
              <div key={di} className="relative border-l">
                {hours.map((h) => (
                  <button
                    key={h}
                    onClick={() => { const dt = new Date(d); dt.setHours(h, 0, 0, 0); onSlot(dt); }}
                    className="w-full border-b border-border/60 hover:bg-accent/40 transition-colors block"
                    style={{ height: HOUR_H }}
                  />
                ))}
                {today && (
                  <div className="absolute left-0 right-0 pointer-events-none z-20" style={{ top: nowTop }}>
                    <div className="h-0.5 bg-red-500" />
                    <div className="h-2 w-2 rounded-full bg-red-500 -mt-[5px] -ml-1" />
                  </div>
                )}
                {dayEvents.map((e) => {
                  const s = new Date(e.start), en = new Date(e.end);
                  const top = (s.getHours() + s.getMinutes()/60) * HOUR_H;
                  const height = Math.max(20, differenceInMinutes(en, s) / 60 * HOUR_H);
                  const meta = CAL_META[e.calendar];
                  return (
                    <button
                      key={e.id}
                      onClick={() => onOpen(e)}
                      className="absolute left-1 right-1 rounded-md px-2 py-1 text-left text-white text-xs shadow-sm hover:brightness-110 hover:shadow-md transition-all overflow-hidden"
                      style={{ top, height, background: meta.color }}
                    >
                      <div className="flex items-center gap-1 font-medium truncate">
                        {e.createdByAi && <Sparkles className="h-3 w-3 shrink-0" />}
                        {e.title}
                      </div>
                      <div className="opacity-90">{format(s, "HH:mm")} – {format(en, "HH:mm")}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

// -------- Month view --------
function MonthView({ cursor, events, onDay, onOpen }: {
  cursor: Date; events: EventItem[];
  onDay: (d: Date) => void; onOpen: (e: EventItem) => void;
}) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b text-xs uppercase text-muted-foreground">
        {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => <div key={d} className="p-2 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {days.map((d, i) => {
          const dim = !isSameMonth(d, cursor);
          const today = isSameDay(d, new Date());
          const dayEvents = events.filter((e) => isSameDay(new Date(e.start), d));
          return (
            <div key={i} className={cn("border-r border-b p-1 flex flex-col gap-0.5 hover:bg-accent/30 transition-colors cursor-pointer overflow-hidden", dim && "bg-muted/30")}
              onClick={() => onDay(d)}>
              <div className={cn("text-xs text-right px-1", today && "font-bold text-primary")}>
                {today ? <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">{format(d, "d")}</span> : format(d, "d")}
              </div>
              {dayEvents.slice(0, 3).map((e) => {
                const meta = CAL_META[e.calendar];
                return (
                  <button key={e.id} onClick={(ev) => { ev.stopPropagation(); onOpen(e); }}
                    className="text-[11px] rounded px-1.5 py-0.5 text-white truncate text-left flex items-center gap-1 hover:brightness-110"
                    style={{ background: meta.color }}>
                    {e.createdByAi && <Sparkles className="h-2.5 w-2.5" />}
                    {format(new Date(e.start), "HH:mm")} {e.title}
                  </button>
                );
              })}
              {dayEvents.length > 3 && <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} mais</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -------- Agenda view --------
function AgendaView({ events, onOpen }: { events: EventItem[]; onOpen: (e: EventItem) => void }) {
  const sorted = [...events].sort((a, b) => +new Date(a.start) - +new Date(b.start));
  const groups = new Map<string, EventItem[]>();
  sorted.forEach((e) => {
    const k = format(new Date(e.start), "yyyy-MM-dd");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  });
  if (sorted.length === 0) {
    return <div className="p-10 text-center text-muted-foreground">Nenhum evento agendado.</div>;
  }
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4 max-w-3xl mx-auto">
        {Array.from(groups.entries()).map(([k, list]) => (
          <div key={k}>
            <div className="text-sm font-semibold mb-2 capitalize">{format(new Date(k), "EEEE, d 'de' MMMM", { locale: ptBR })}</div>
            <div className="space-y-1">
              {list.map((e) => {
                const meta = CAL_META[e.calendar];
                return (
                  <button key={e.id} onClick={() => onOpen(e)} className="w-full text-left p-3 rounded-lg border hover:bg-accent/40 flex items-center gap-3">
                    <span className="h-8 w-1 rounded" style={{ background: meta.color }} />
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-1">
                        {e.createdByAi && <Sparkles className="h-3 w-3 text-purple-500" />}
                        {e.title}
                      </div>
                      <div className="text-xs text-muted-foreground">{format(new Date(e.start), "HH:mm")} – {format(new Date(e.end), "HH:mm")} · {meta.label}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// -------- Event modal --------
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(v: string) { return new Date(v).toISOString(); }

function EventModal({ open, event, onOpenChange, onSave, onDelete, connections }: {
  open: boolean; event: EventItem | null;
  onOpenChange: (o: boolean) => void;
  onSave: (e: EventItem) => void;
  onDelete: (id: string) => void;
  connections: Array<{ id: string; name: string; phone_number: string | null; status: string | null }>;
}) {
  const [draft, setDraft] = useState<EventItem | null>(event);
  useEffect(() => { setDraft(event); }, [event]);
  if (!draft) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {draft.id ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {draft.id ? "Editar evento" : "Novo evento"}
            {draft.createdByAi && <span className="ml-2 text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600"><Sparkles className="h-3 w-3" /> IA</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título</Label>
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Reunião com..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1"><Clock className="h-3 w-3" /> Início</Label>
              <Input type="datetime-local" value={toLocalInput(draft.start)} onChange={(e) => setDraft({ ...draft, start: fromLocalInput(e.target.value) })} />
            </div>
            <div>
              <Label className="flex items-center gap-1"><Clock className="h-3 w-3" /> Fim</Label>
              <Input type="datetime-local" value={toLocalInput(draft.end)} onChange={(e) => setDraft({ ...draft, end: fromLocalInput(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>Calendário</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {(Object.keys(CAL_META) as CalId[]).map((k) => (
                <button key={k} onClick={() => setDraft({ ...draft, calendar: k })}
                  className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm transition-colors", draft.calendar === k ? "border-transparent text-white" : "hover:bg-accent")}
                  style={draft.calendar === k ? { background: CAL_META[k].color } : {}}>
                  <span className={cn("h-2 w-2 rounded-full", CAL_META[k].bg)} />
                  {CAL_META[k].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="flex items-center gap-1"><UsersIcon className="h-3 w-3" /> Convidados</Label>
            <Input value={draft.guests ?? ""} onChange={(e) => setDraft({ ...draft, guests: e.target.value })} placeholder="email1@... , email2@..." />
          </div>
          <div>
            <Label>Instância WhatsApp</Label>
            <Select
              value={draft.connectionId ?? "none"}
              onValueChange={(v) => setDraft({ ...draft, connectionId: v === "none" ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma (agenda geral)</SelectItem>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.status === "open" ? "🟢" : "⚪"} {c.name}{c.phone_number ? ` · ${c.phone_number}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="flex items-center gap-1"><AlignLeft className="h-3 w-3" /> Descrição</Label>
            <Textarea value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {draft.id && (
            <Button variant="destructive" onClick={() => onDelete(draft.id)} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave(draft)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- AI Chat sidebar --------
type ChatMsg = { id: string; role: "user" | "ai"; text: string; proposal?: EventItem };

function AiChat({ onPropose, events }: { onPropose: (e: Partial<EventItem>) => void; events: EventItem[] }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { id: uid(), role: "ai", text: "Olá! Diga algo como: \"Agendar reunião com Pedro quarta às 15h por 1h\"." },
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMsgs((m) => [...m, { id: uid(), role: "user", text }]);
    setTimeout(() => {
      const parsed = parseCommand(text);
      if (!parsed) {
        setMsgs((m) => [...m, { id: uid(), role: "ai", text: "Não entendi a data/hora. Tente: \"reunião amanhã às 14h por 30min\"." }]);
        return;
      }
      const conflict = events.some((x) => overlaps({ ...parsed, id: "" } as EventItem, x));
      const note = conflict ? " ⚠️ Há conflito neste horário no mesmo calendário." : "";
      setMsgs((m) => [...m, {
        id: uid(), role: "ai",
        text: `Encontrei: **${parsed.title}** em ${format(new Date(parsed.start), "EEEE, d 'de' MMM 'às' HH:mm", { locale: ptBR })}.${note} Confirmar?`,
        proposal: parsed,
      }]);
    }, 250);
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-xl flex items-center justify-center text-white hover:scale-105 transition-transform"
        style={{ background: "linear-gradient(135deg,#8b5cf6,#3b82f6)" }}
        aria-label="Assistente IA"
      >
        <Bot className="h-6 w-6" />
      </button>
      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-8rem)] rounded-2xl border bg-background shadow-2xl flex flex-col overflow-hidden">
          <div className="p-3 border-b flex items-center gap-2 bg-gradient-to-r from-purple-500/10 to-blue-500/10">
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#8b5cf6,#3b82f6)" }}>
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">Assistente da Agenda</div>
              <div className="text-[11px] text-muted-foreground">Interpreta comandos e agenda por você</div>
            </div>
            <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              {msgs.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    {m.proposal && (
                      <div className="mt-2 rounded-lg border bg-background text-foreground p-2">
                        <div className="flex items-center gap-1 text-xs font-medium">
                          <Sparkles className="h-3 w-3 text-purple-500" /> Confirmar agendamento
                        </div>
                        <div className="text-xs mt-1"><b>{m.proposal.title}</b></div>
                        <div className="text-[11px] text-muted-foreground">{format(new Date(m.proposal.start), "EEE dd/MM HH:mm", { locale: ptBR })} – {format(new Date(m.proposal.end), "HH:mm")}</div>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" className="h-7" onClick={() => onPropose(m.proposal!)}>Abrir e revisar</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </ScrollArea>
          <div className="p-2 border-t flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Ex.: Reunião com Ana amanhã 10h por 45min" />
            <Button size="icon" onClick={send}><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </>
  );
}

// -------- Very simple pt-BR intent parser --------
function parseCommand(text: string): EventItem | null {
  const lower = text.toLowerCase();
  const now = new Date();
  let base = startOfDay(now);

  const weekMap: Record<string, number> = {
    "domingo": 0, "segunda": 1, "terça": 2, "terca": 2, "quarta": 3,
    "quinta": 4, "sexta": 5, "sábado": 6, "sabado": 6,
  };
  if (/\bhoje\b/.test(lower)) base = startOfDay(now);
  else if (/\bamanh[ãa]\b/.test(lower)) base = addDays(startOfDay(now), 1);
  else {
    for (const [k, v] of Object.entries(weekMap)) {
      if (new RegExp(`\\b${k}\\b`).test(lower)) {
        const diff = (v - now.getDay() + 7) % 7 || 7;
        base = addDays(startOfDay(now), diff);
        break;
      }
    }
  }
  const dmy = lower.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dmy) {
    const y = dmy[3] ? (dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])) : now.getFullYear();
    base = new Date(y, Number(dmy[2]) - 1, Number(dmy[1]));
  }

  const timeM = lower.match(/(\d{1,2})(?::(\d{2}))?\s*h(?:oras?)?/) || lower.match(/(\d{1,2}):(\d{2})/);
  if (!timeM) return null;
  const hh = Number(timeM[1]);
  const mm = timeM[2] ? Number(timeM[2]) : 0;
  const start = new Date(base); start.setHours(hh, mm, 0, 0);

  let durMin = 60;
  const dur = lower.match(/por\s+(\d+)\s*(min|minutos|h|hora|horas)/);
  if (dur) durMin = /h/.test(dur[2]) ? Number(dur[1]) * 60 : Number(dur[1]);
  const end = addMinutes(start, durMin);

  let title = text.replace(/\b(agendar|marcar|criar|novo|nova)\b/gi, "").trim();
  title = title.replace(/\b(hoje|amanhã|amanha|segunda|terça|terca|quarta|quinta|sexta|s[áa]bado|domingo)\b/gi, "").trim();
  title = title.replace(/\b\d{1,2}(:\d{2})?\s*h(oras?)?\b/gi, "").trim();
  title = title.replace(/\bpor\s+\d+\s*(min|minutos|h|hora|horas)\b/gi, "").trim();
  title = title.replace(/\s+/g, " ").replace(/^[,.\-\s]+|[,.\-\s]+$/g, "");
  if (!title) title = "Evento";

  return {
    id: "", title, start: start.toISOString(), end: end.toISOString(),
    calendar: "ai", createdByAi: true, description: `Criado por IA a partir de: "${text}"`,
  };
}