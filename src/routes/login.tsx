import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import logoUrl from "@/assets/logo.png";

const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 8, label: "Mínimo de 8 caracteres" },
  { test: (p: string) => /[A-Z]/.test(p), label: "Pelo menos 1 letra maiúscula" },
  { test: (p: string) => /[a-z]/.test(p), label: "Pelo menos 1 letra minúscula" },
  { test: (p: string) => /\d/.test(p), label: "Pelo menos 1 número" },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: "Pelo menos 1 caractere especial (!@#$...)" },
];

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("password should be at least")) return "A senha é muito curta. Use no mínimo 8 caracteres.";
  if (m.includes("password") && (m.includes("weak") || m.includes("pwned") || m.includes("compromised") || m.includes("breach"))) {
    return "Essa senha foi vazada em vazamentos públicos. Escolha uma senha diferente e mais forte.";
  }
  if (m.includes("password")) return "Senha inválida. Verifique os requisitos de segurança abaixo.";
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("user already registered") || m.includes("already been registered")) return "Este e-mail já está cadastrado. Faça login.";
  if (m.includes("email") && m.includes("invalid")) return "E-mail inválido.";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  return msg;
}

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/dashboard" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(translateAuthError(error.message));
    else toast.success("Bem-vindo!");
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const failed = PASSWORD_RULES.filter((r) => !r.test(password));
    if (failed.length > 0) {
      toast.error("Sua senha não atende aos requisitos:\n• " + failed.map((r) => r.label).join("\n• "));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) toast.error(translateAuthError(error.message));
    else toast.success("Conta criada! Você já pode entrar.");
  };

  const handleGoogle = async () => {
    setLoading(true);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) { toast.error("Falha ao entrar com Google"); setLoading(false); }
  };

  const handleForgot = async () => {
    if (!email) { toast.error("Digite seu e-mail para recuperar a senha"); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(translateAuthError(error.message));
    else toast.success("Enviamos um link de recuperação para seu e-mail.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      <div className="auth-bg" aria-hidden="true">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
        <div className="auth-shine" />
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="auth-spark"
            style={{
              left: `${(i * 7 + 5) % 100}%`,
              animationDuration: `${10 + (i % 5) * 2}s`,
              animationDelay: `${(i * 0.8) % 9}s`,
              opacity: 0.4 + ((i % 4) * 0.15),
            }}
          />
        ))}
      </div>
      <Card className="relative w-full max-w-md border-border/50 backdrop-blur-xl bg-card/70 animate-fade-in"
        style={{
          boxShadow:
            "0 0 0 1px rgba(220,38,38,0.45), 0 0 24px 2px rgba(220,38,38,0.45), 0 0 60px 8px rgba(220,38,38,0.35), var(--shadow-premium)",
        }}>
        <CardHeader className="text-center space-y-3">
          <img src={logoUrl} alt="Nobre MKT" className="mx-auto w-24 h-24 rounded-2xl object-contain" />
          <div>
            <CardTitle className="text-2xl tracking-tight">Gestão Nobre MKT</CardTitle>
            <CardDescription>Plataforma premium de gestão</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-8 py-6">
          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 w-full bg-transparent gap-2 p-0">
              <TabsTrigger
                value="login"
                className="border-2 border-red-600/60 text-red-500 data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:border-red-600 data-[state=active]:shadow-[0_0_18px_rgba(220,38,38,0.55)]"
              >
                Entrar
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="border-2 border-red-600/60 text-red-500 data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:border-red-600 data-[state=active]:shadow-[0_0_18px_rgba(220,38,38,0.55)]"
              >
                Criar conta
              </TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-5 mt-6">
                <div className="space-y-2.5">
                  <Label>E-mail</Label>
                  <Input className="border-2 border-foreground/20 bg-background/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label>Senha</Label>
                    <button type="button" onClick={handleForgot} className="text-xs text-primary hover:underline">
                      Esqueceu a senha?
                    </button>
                  </div>
                  <div className="relative">
                    <Input className="pr-10 border-2 border-foreground/20 bg-background/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Entrar
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-5 mt-6">
                <div className="space-y-2.5">
                  <Label>Nome completo</Label>
                  <Input className="border-2 border-foreground/20 bg-background/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-2.5">
                  <Label>E-mail</Label>
                  <Input className="border-2 border-foreground/20 bg-background/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2.5">
                  <Label>Senha</Label>
                  <div className="relative">
                    <Input className="pr-10 border-2 border-foreground/20 bg-background/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40" type={showSignupPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                    <button type="button" onClick={() => setShowSignupPassword((v) => !v)} aria-label={showSignupPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <ul className="text-xs space-y-1 mt-2">
                    {PASSWORD_RULES.map((r) => {
                      const ok = r.test(password);
                      return (
                        <li key={r.label} className={ok ? "text-emerald-500" : "text-muted-foreground"}>
                          {ok ? "✓" : "•"} {r.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}