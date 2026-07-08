import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type Notification = { id: string; title: string; body: string | null; type: string; link: string | null; read_at: string | null; created_at: string };

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);

  const load = async () => {
    const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(20);
    setItems((data as Notification[]) ?? []);
  };
  useEffect(() => {
    load();
    const channel = supabase.channel("notifications-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const unread = items.filter(n => !n.read_at).length;

  const markAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() })
      .is("read_at", null).eq("user_id", user.id);
    load();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] rounded-full">{unread}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <span className="font-semibold text-sm">Notificações</span>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={markAll}><Check className="h-3.5 w-3.5" /> Marcar como lidas</Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Sem notificações</div>
          ) : items.map(n => (
            <div key={n.id} className={`p-3 border-b hover:bg-muted/40 ${!n.read_at ? "bg-primary/5" : ""}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                  {n.link && (
                    <Link to={n.link} className="text-xs text-primary mt-1 inline-block">Abrir →</Link>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString("pt-BR")}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}