import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Crown, ShieldCheck, Loader2 } from "lucide-react";

export const Route = createFileRoute("/master-auth")({
  head: () => ({
    meta: [
      { title: "Painel Master — Login Administrativo" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MasterAuthPage,
});

function MasterAuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const { data: isMaster } = await supabase.rpc("has_role", {
        _user_id: data.session.user.id, _role: "master",
      });
      if (isMaster) navigate({ to: "/master" });
    })();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setLoading(false); return toast.error(error.message); }
    const { data: isMaster } = await supabase.rpc("has_role", {
      _user_id: data.user!.id, _role: "master",
    });
    if (!isMaster) {
      await supabase.auth.signOut();
      setLoading(false);
      return toast.error("Acesso negado. Este login é exclusivo para administradores Master.");
    }
    setLoading(false);
    toast.success("Bem-vindo, Master.");
    navigate({ to: "/master" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-gradient-to-br from-neutral-950 via-neutral-900 to-amber-950/40">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.18),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(120,53,15,0.25),transparent_60%)]" />
      <Card className="relative w-full max-w-md border-amber-500/30 bg-card/90 backdrop-blur-xl shadow-2xl shadow-amber-500/10">
        <CardHeader className="items-center text-center pb-2">
          <div className="relative mb-3">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 blur-xl opacity-40" />
            <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 shadow-lg">
              <Crown className="h-8 w-8 text-foreground" />
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-500">
            <ShieldCheck className="h-3.5 w-3.5" /> Área restrita
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-3">Painel Master</h1>
          <CardDescription>Login administrativo exclusivo. Não use para acesso de cliente.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="mail">E-mail administrativo</Label>
              <Input id="mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">Senha</Label>
              <Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 text-foreground" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Entrar como Master
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-2">
              Cliente? <a href="/auth" className="text-primary hover:underline">Acesse o login do cliente</a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
