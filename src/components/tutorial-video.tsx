import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { PlayCircle } from "lucide-react";

function toEmbed(url: string): { kind: "iframe" | "video"; src: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // YouTube
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      return { kind: "iframe", src: `https://www.youtube.com/embed/${id}` };
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v") ?? u.pathname.split("/").pop() ?? "";
      return { kind: "iframe", src: `https://www.youtube.com/embed/${id}` };
    }
    // Vimeo
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop() ?? "";
      return { kind: "iframe", src: `https://player.vimeo.com/video/${id}` };
    }
    // MP4 / raw
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return { kind: "video", src: url };
    return { kind: "iframe", src: url };
  } catch {
    return null;
  }
}

export function TutorialVideo({ moduleKey, title = "Tutorial em vídeo" }: { moduleKey: string; title?: string }) {
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    supabase.from("internal_config").select("value").eq("key", "tutorials").maybeSingle()
      .then(({ data }) => {
        if (!data?.value) return;
        try {
          const map = JSON.parse(data.value) as Record<string, string>;
          setUrl(map[moduleKey] ?? "");
        } catch { /* ignore */ }
      });
  }, [moduleKey]);

  const embed = toEmbed(url);
  if (!embed) return null;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <PlayCircle className="h-4 w-4 text-primary" /> {title}
        </div>
        <div className="relative w-full overflow-hidden rounded-xl border border-border/60 bg-black" style={{ aspectRatio: "16 / 9" }}>
          {embed.kind === "iframe" ? (
            <iframe
              src={embed.src}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <video src={embed.src} controls className="absolute inset-0 h-full w-full" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}