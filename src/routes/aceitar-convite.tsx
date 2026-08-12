/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import logoUrl from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvitation, inspectInvitation } from "@/lib/access.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/aceitar-convite")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: AcceptInvitationPage,
});

function message(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível aceitar o convite.";
}

function AcceptInvitationPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const query = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => inspectInvitation({ data: { token } }),
    enabled: Boolean(token),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: () => acceptInvitation({ data: { token, password } }),
    onSuccess: async (result: any) => {
      const { error } = await supabase.auth.signInWithPassword({ email: result.email, password });
      if (error) {
        toast.success("Conta criada. Faça login para continuar.");
        navigate({ to: "/login" });
        return;
      }
      toast.success("Conta criada com sucesso.");
      navigate({ to: "/dashboard" });
    },
    onError: (error) => toast.error(message(error)),
  });
  const validPassword = password.length >= 8 && password.length <= 128 && password === confirmation;
  const result = query.data as any;

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="flex justify-center">
          <img
            src={logoUrl}
            alt="Nobre MKT"
            className="h-16 w-16 rounded-2xl bg-black object-contain p-2"
          />
        </div>
        {query.isLoading ? (
          <Card>
            <CardContent className="grid min-h-56 place-items-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </CardContent>
          </Card>
        ) : !token || query.isError || !result?.valid ? (
          <Card>
            <CardHeader className="items-center text-center">
              <XCircle className="h-10 w-10 text-destructive" />
              <CardTitle>Convite indisponível</CardTitle>
              <CardDescription>
                {result?.reason || "O link é inválido ou não pôde ser verificado."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Ir para o login</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>Olá, {result.invitation.name}</CardTitle>
              <CardDescription>
                Você foi convidado para acessar a Gestão Nobre MKT como{" "}
                {result.invitation.job_title || "membro da equipe"}. Defina sua senha para ativar a
                conta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (validPassword) mutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input value={result.invitation.email} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label="Mostrar ou ocultar senha"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Use entre 8 e 128 caracteres.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmation">Confirmar senha</Label>
                  <Input
                    id="confirmation"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                  {confirmation && password !== confirmation && (
                    <p className="text-xs text-destructive">As senhas não coincidem.</p>
                  )}
                </div>
                <Button className="w-full" disabled={!validPassword || mutation.isPending}>
                  {mutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Criar minha conta
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
