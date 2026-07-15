import { createFileRoute, useRouter, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unlockMaster } from "@/lib/master-gate.functions";

type Search = { redirect?: string };

export const Route = createFileRoute("/_authenticated/master-login")({
  head: () => ({
    meta: [
      { title: "Acesso Admin Master" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: MasterLoginPage,
});

function MasterLoginPage() {
  const router = useRouter();
  const search = useSearch({ from: "/_authenticated/master-login" });
  const unlock = useServerFn(unlockMaster);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    try {
      const res = await unlock({ data: { password } });
      if (res.ok) {
        toast.success("Acesso liberado.");
        const to = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/master";
        await router.navigate({ to });
      } else if (res.error === "not_configured") {
        toast.error("Senha do Admin Master ainda não foi configurada.");
      } else {
        toast.error("Senha incorreta.");
        setPassword("");
      }
    } catch {
      toast.error("Falha ao validar senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Admin Master</CardTitle>
          <CardDescription>Área restrita ao dono da plataforma. Digite a senha.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="master-password">Senha</Label>
              <Input
                id="master-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !password}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}