import { createFileRoute } from "@tanstack/react-router";
import { Settings, Save, Loader2, User, Lock, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações da Conta — Plataforma IA" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const [profile, setProfile] = useState({ full_name: "", phone: "", alert_phone: "" });
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("full_name, phone, alert_phone").eq("id", user.id).maybeSingle();
      if (data) setProfile({
        full_name: data.full_name ?? "",
        phone: data.phone ?? "",
        alert_phone: data.alert_phone ?? "",
      });
      setLoading(false);
    })();
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({
      full_name: profile.full_name.trim() || null,
      phone: profile.phone.trim() || null,
      alert_phone: profile.alert_phone.trim() || null,
    }).eq("id", user.id);
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
  };

  const savePw = async () => {
    if (pw.next.length < 6) return toast.error("Senha deve ter ao menos 6 caracteres");
    if (pw.next !== pw.confirm) return toast.error("Senhas não coincidem");
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setSavingPw(false);
    if (error) return toast.error(error.message);
    setPw({ next: "", confirm: "" });
    toast.success("Senha alterada com sucesso");
  };

  return (
    <PageShell
      title="Configurações da Conta"
      description="Gerencie seus dados pessoais, senha e preferências."
      icon={<Settings className="h-6 w-6" />}
      status="ativo"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                <User className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>Perfil</CardTitle>
                <CardDescription>Suas informações pessoais.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={user?.email ?? ""} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>Nome completo</Label>
                  <Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} placeholder="Seu nome" />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+55 11 99999-9999" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Telefone para alertas</Label>
                  <Input value={profile.alert_phone} onChange={(e) => setProfile({ ...profile, alert_phone: e.target.value })} placeholder="Receberá notificações do sistema" />
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={saveProfile} disabled={savingProfile}>
                    {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar perfil
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>Segurança</CardTitle>
                <CardDescription>Alterar senha de acesso.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nova senha</Label>
              <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="space-y-1.5">
              <Label>Confirmar nova senha</Label>
              <Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} placeholder="Repita a nova senha" />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={savePw} disabled={savingPw || !pw.next}>
                {savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Alterar senha
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}