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
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [captcha, setCaptcha] = useState<{ a: number; b: number; token: string }>({ a: 0, b: 0, token: "" });
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [authError, setAuthError] = useState("");

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
    setAuthError("");
    try {
      const res = await signInWithCaptcha({
        data: { email, password, token: captcha.token, answer: Number(captchaAnswer.trim()) },
      });
      if (!res.ok) {
        const message = formatAuthError(res.error);
        setAuthError(message);
        toast.error(message);
        regenCaptcha();
        return;
      }
      const { error } = await supabase.auth.setSession(res.session);
      if (error) {
        const message = formatAuthError(error.message);
        setAuthError(message);
        toast.error(message);
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data: isMaster } = await supabase.rpc("has_role", {
        _user_id: u.user!.id, _role: "master",
      });
      if (isMaster) {
        await supabase.auth.signOut();
        const message = "Conta Master. Use o login exclusivo em /master-auth.";
        setAuthError(message);
        toast.error(message);
        return;
      }
      navigate({ to: "/dashboard" });
    } catch {
      const message = "Não foi possível entrar agora. Tente novamente.";
      setAuthError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
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
                  <Input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setAuthError(""); }} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setAuthError(""); }} required />
                </div>
                <CaptchaField captcha={captcha} value={captchaAnswer} onChange={setCaptchaAnswer} onRefresh={regenCaptcha} />
                {authError && (
                  <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                    {authError}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</Button>
                <button
                  type="button"
                  onClick={() => { setResetEmail(email); setResetOpen(true); }}
                  className="w-full text-sm text-primary hover:underline"
                >
                  Esqueceu a senha?
                </button>
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
      {resetOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setResetOpen(false)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-lg">Recuperar senha</CardTitle>
              <CardDescription>Enviaremos um link para redefinir sua senha.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!captcha.token || String(captcha.a + captcha.b) !== captchaAnswer.trim()) {
                    regenCaptcha();
                    return toast.error("Verificação de segurança incorreta.");
                  }
                  setResetLoading(true);
                  const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
                    redirectTo: `${window.location.origin}/reset-password`,
                  });
                  setResetLoading(false);
                  if (error) return toast.error(error.message);
                  toast.success("Link enviado! Verifique seu e-mail.");
                  setResetOpen(false);
                  regenCaptcha();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="resetEmail">E-mail</Label>
                  <Input id="resetEmail" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required />
                </div>
                <CaptchaField captcha={captcha} value={captchaAnswer} onChange={setCaptchaAnswer} onRefresh={regenCaptcha} />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setResetOpen(false)}>Cancelar</Button>
                  <Button type="submit" className="flex-1" disabled={resetLoading}>Enviar link</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function formatAuthError(error: string) {
  const msg = error.toLowerCase();
  if (msg.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (msg.includes("verificação") || msg.includes("captcha")) return "Verificação de segurança incorreta.";
  return error || "Não foi possível entrar.";
}

function CaptchaField({
  captcha, value, onChange, onRefresh,
}: { captcha: { a: number; b: number }; value: string; onChange: (v: string) => void; onRefresh: () => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="captcha" className="flex items-center justify-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" /> Verificação de segurança
      </Label>
      <div className="flex items-center justify-center gap-2">
        <div
          className="select-none rounded-md border border-primary/40 bg-gradient-to-br from-primary/15 to-primary/5 px-4 py-2 font-mono text-lg font-bold tracking-widest italic text-primary"
          style={{ textShadow: "1px 1px 0 hsl(var(--primary) / 0.35)", letterSpacing: "0.25em" }}
        >
          {captcha.a} + {captcha.b} = ?
        </div>
        <Input
          id="captcha"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="="
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="w-20 text-center font-mono text-lg"
        />
        <Button type="button" size="icon" variant="outline" onClick={onRefresh} title="Gerar outro">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}