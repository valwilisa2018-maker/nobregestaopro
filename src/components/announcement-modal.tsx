import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type Ann = { id: string; title: string; body: string; severity: string; cta_label: string | null; cta_url: string | null };

export function AnnouncementModal() {
  const [current, setCurrent] = useState<Ann | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: anns } = await supabase.from("announcements").select("id,title,body,severity,cta_label,cta_url")
        .eq("is_active", true).order("created_at", { ascending: false }).limit(10);
      if (!anns?.length) return;
      const ids = anns.map(a => a.id);
      const { data: reads } = await supabase.from("announcement_reads").select("announcement_id")
        .eq("user_id", user.id).in("announcement_id", ids);
      const readIds = new Set((reads ?? []).map(r => r.announcement_id));
      const unread = anns.find(a => !readIds.has(a.id));
      if (unread) setCurrent(unread as Ann);
    })();
  }, []);

  const close = async () => {
    if (!current) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("announcement_reads").insert({ announcement_id: current.id, user_id: user.id });
    }
    setCurrent(null);
  };

  if (!current) return null;
  return (
    <Dialog open onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant={current.severity === "warning" ? "destructive" : "outline"}>{current.severity}</Badge>
            <DialogTitle>{current.title}</DialogTitle>
          </div>
          <DialogDescription className="whitespace-pre-wrap pt-2">{current.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {current.cta_url && current.cta_label && (
            <Button asChild><a href={current.cta_url} target="_blank" rel="noreferrer">{current.cta_label}</a></Button>
          )}
          <Button variant="outline" onClick={close}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}