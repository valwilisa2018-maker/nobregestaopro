import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import logoAsset from "@/assets/agent-ia-logo.png.asset.json";
import { issueCaptcha, signInWithCaptcha, signUpWithCaptcha } from "@/lib/captcha.functions";

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
  const [captcha, setCaptcha] = useState<{ a: number; b: number; token: string }>({ a: 0, b: 0, token: "" });
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  const regenCaptcha = useCallback(async () => {
    setCaptchaAnswer("");
    try {
      const c = await issueCaptcha();
      setCaptcha({ a: c.a, b: c.b, token: c.token });
    } catch {
      toast.error("Falha ao carregar verificação. Recarregue a página.");
    }
  }, []);
  useEffect(() => { regenCaptcha(); }, [regenCaptcha]);

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
    const res = await signInWithCaptcha({
      data: { email, password, token: captcha.token, answer: Number(captchaAnswer.trim()) },
    });
    if (!res.ok) {
      setLoading(false);
      toast.error(res.error);
      regenCaptcha();
      return;
    }
    const { error } = await supabase.auth.setSession(res.session);
    if (error) { setLoading(false); return toast.error(error.message); }
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
    const res = await signUpWithCaptcha({
      data: {
        email,
        password,
        token: captcha.token,
        answer: Number(captchaAnswer.trim()),
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    setLoading(false);
    if (!res.ok) { toast.error(res.error); regenCaptcha(); return; }
    if (res.session) {
      await supabase.auth.setSession(res.session);
      toast.success("Conta criada!");
      navigate({ to: "/dashboard" });
    } else {
      toast.success("Conta criada. Verifique seu e-mail para confirmar.");
      regenCaptcha();
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
                <CaptchaField captcha={captcha} value={captchaAnswer} onChange={setCaptchaAnswer} onRefresh={regenCaptcha} />
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
                <CaptchaField captcha={captcha} value={captchaAnswer} onChange={setCaptchaAnswer} onRefresh={regenCaptcha} />
                <Button type="submit" className="w-full" disabled={loading}>Criar conta</Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function CaptchaField({
  captcha, value, onChange, onRefresh,
}: { captcha: { a: number; b: number }; value: string; onChange: (v: string) => void; onRefresh: () => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="captcha" className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Verificação de segurança
      </Label>
      <div className="flex items-center gap-2">
        <div
          className="select-none rounded-md border bg-gradient-to-br from-muted to-muted/40 px-4 py-2 font-mono text-lg font-bold tracking-widest italic"
          style={{ textShadow: "1px 1px 0 hsl(var(--primary) / 0.25)", letterSpacing: "0.25em" }}
        >
          {captcha.a} + {captcha.b} = ?
        </div>
        <Button type="button" size="icon" variant="outline" onClick={onRefresh} title="Gerar outro">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <Input
        id="captcha"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="Digite o resultado"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </div>
  );
}