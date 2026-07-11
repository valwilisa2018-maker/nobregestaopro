import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, ShieldCheck, KeyRound, Eye, EyeOff } from "lucide-react";
import logoAsset from "@/assets/agent-ia-logo.png.asset.json";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({ meta: [{ title: "Redefinir senha" }] }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strength = (() => {
    let s = 0;
    if (password.length >= 6) s++;
    if (password.length >= 10) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();
  const strengthLabel = ["Muito fraca", "Fraca", "Média", "Boa", "Forte", "Excelente"][strength];
  const strengthColor = ["bg-destructive", "bg-destructive", "bg-amber-500", "bg-amber-400", "bg-emerald-500", "bg-emerald-400"][strength];

  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });

    (async () => {
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const code = url.searchParams.get("code");
        const access_token = hash.get("access_token");
        const refresh_token = hash.get("refresh_token");
        const hashError = hash.get("error_description") || url.searchParams.get("error_description");

        if (hashError) {
          if (!cancelled) setErrorMsg(decodeURIComponent(hashError));
          return;
        }

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          window.history.replaceState({}, "", url.pathname);
          if (!cancelled) setReady(true);
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          window.history.replaceState({}, "", url.pathname);
          if (!cancelled) setReady(true);
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session && !cancelled) setReady(true);
        else if (!cancelled) setErrorMsg("Link inválido ou expirado. Solicite um novo e-mail de recuperação.");
      } catch (err: any) {
        if (!cancelled) setErrorMsg(err?.message ?? "Não foi possível validar o link.");
      }
    })();

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("A senha deve ter ao menos 6 caracteres.");
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha redefinida! Entrando...");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="relative min-h-[100dvh] grid place-items-center overflow-hidden bg-[#05070d] p-4">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(59,130,246,0.15),transparent_60%)]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo + brand */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 -m-2 rounded-2xl bg-gradient-to-br from-blue-500/40 to-indigo-500/40 blur-xl" />
            <img src={logoAsset.url} alt="Agent IA" className="relative h-16 w-16 rounded-2xl object-contain" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">Agent IA</h1>
            <p className="text-xs text-white/50">Redefinição segura de senha</p>
          </div>
        </div>

        <Card className="border-white/10 bg-white/[0.03] shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
              <KeyRound className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-center text-xl text-white">Redefinir senha</CardTitle>
            <CardDescription className="text-center text-white/60">
              {errorMsg ? errorMsg : ready ? "Crie uma nova senha para acessar sua conta." : "Validando link de recuperação..."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/80">Nova senha</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={!ready}
                    placeholder="Mínimo 6 caracteres"
                    className="border-white/10 bg-white/5 pl-9 pr-10 text-white placeholder:text-white/30 focus-visible:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/50 hover:text-white"
                    tabIndex={-1}
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password && (
                  <div className="space-y-1">
                    <div className="flex h-1.5 gap-1">
                      {[0,1,2,3,4].map((i) => (
                        <div key={i} className={`h-full flex-1 rounded-full ${i < strength ? strengthColor : "bg-white/10"}`} />
                      ))}
                    </div>
                    <p className="text-xs text-white/50">Força: {strengthLabel}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm" className="text-white/80">Confirmar senha</Label>
                <div className="relative">
                  <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <Input
                    id="confirm"
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    disabled={!ready}
                    placeholder="Repita a nova senha"
                    className="border-white/10 bg-white/5 pl-9 pr-10 text-white placeholder:text-white/30 focus-visible:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/50 hover:text-white"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirm && confirm !== password && (
                  <p className="text-xs text-destructive">As senhas não coincidem</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 font-semibold text-white shadow-lg shadow-blue-500/30 hover:from-blue-400 hover:to-indigo-500"
                disabled={loading || !ready}
              >
                {loading ? "Salvando..." : "Salvar nova senha"}
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-white/40">
                <ShieldCheck className="h-3 w-3" /> Conexão criptografada • Agent IA
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}