import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import logoAsset from "@/assets/agent-ia-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar na Plataforma — Agent IA" },
      { name: "description", content: "Acesse a Agent IA para gerenciar seus agentes de inteligência artificial no WhatsApp, conversas, follow-ups e integrações." },
      { property: "og:title", content: "Entrar na Plataforma — Agent IA" },
      { property: "og:description", content: "Acesse a Agent IA para gerenciar seus agentes de IA no WhatsApp." },
      { property: "og:url", content: "https://agente-iapro.lovable.app/auth" },
    ],
    links: [{ rel: "canonical", href: "https://agente-iapro.lovable.app/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
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
      navigate({ to: isMaster ? "/master" : "/dashboard" });
    })();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast.error(error.message);
    const { data: u } = await supabase.auth.getUser();
    const { data: isMaster } = await supabase.rpc("has_role", {
      _user_id: u.user!.id, _role: "master",
    });
    setLoading(false);
    if (isMaster) {
      await supabase.auth.signOut();
      return toast.error("Conta Master. Use o login exclusivo em /master-auth.");
    }
    navigate({ to: "/dashboard" });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (data.session) {
      toast.success("Conta criada!");
      navigate({ to: "/dashboard" });
    } else {
      toast.success("Conta criada. Verifique seu e-mail para confirmar.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <img src={logoAsset.url} alt="Agent IA" className="h-20 w-20 rounded-2xl object-cover ring-1 ring-primary/30 mb-2" />
          <h1 className="text-2xl font-bold tracking-tight">Entrar na Plataforma</h1>
          <CardTitle className="text-xl">AGENT IA</CardTitle>
          <CardDescription>Plataforma inteligente de atendimento no WhatsApp</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>Entrar</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email2">E-mail</Label>
                  <Input id="email2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Senha</Label>
                  <Input id="password2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>Criar conta</Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}