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
    if (error) toast.error(error.message);
    else toast.success("Bem-vindo!");
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) toast.error(error.message);
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
    if (error) toast.error(error.message);
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
        style={{ boxShadow: "var(--shadow-premium)" }}>
        <CardHeader className="text-center space-y-3">
          <img src={logoUrl} alt="Nobre MKT" className="mx-auto w-24 h-24 rounded-2xl object-contain drop-shadow-[0_8px_30px_rgba(220,38,38,0.35)]"
            style={{ boxShadow: "var(--shadow-premium)" }} />
          <div>
            <CardTitle className="text-2xl tracking-tight">Gestão Nobre MKT</CardTitle>
            <CardDescription>Plataforma premium de gestão</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input className="border-2 border-foreground/20 bg-background/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
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
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nome completo</Label>
                  <Input className="border-2 border-foreground/20 bg-background/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input className="border-2 border-foreground/20 bg-background/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <div className="relative">
                    <Input className="pr-10 border-2 border-foreground/20 bg-background/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40" type={showSignupPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                    <button type="button" onClick={() => setShowSignupPassword((v) => !v)} aria-label={showSignupPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
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