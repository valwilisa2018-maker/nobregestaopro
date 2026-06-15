import { useEffect, useState } from "react";
import Joyride, { CallBackProps, STATUS, Step } from "react-joyride";
import { supabase } from "@/integrations/supabase/client";

const STEPS: Step[] = [
  {
    target: "body",
    placement: "center",
    title: "Bem-vindo à Nobre MKT 🎉",
    content:
      "Vamos fazer um tour rápido para você conhecer todas as funções da plataforma. Você pode pular a qualquer momento.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="menu-dashboard"]',
    title: "Dashboard",
    content: "Visão geral do negócio: vendas, metas e indicadores principais.",
  },
  {
    target: '[data-tour="menu-sales"]',
    title: "Vendas",
    content: "Registre novas vendas, cadastre clientes e anexe comprovantes de pagamento.",
  },
  {
    target: '[data-tour="menu-telao"]',
    title: "Telão",
    content: "Tela de exibição em tempo real para acompanhar as vendas do dia.",
  },
  {
    target: '[data-tour="menu-kanban"]',
    title: "Produção (Kanban)",
    content: "Acompanhe a produção dos serviços em colunas, do início até a entrega.",
  },
  {
    target: '[data-tour="menu-services-todo"]',
    title: "Serviços a Fazer",
    content: "Lista de tudo o que ainda precisa ser produzido e entregue.",
  },
  {
    target: '[data-tour="menu-customers"]',
    title: "Clientes",
    content: "Histórico completo de cada cliente, contratos, valores pagos e em aberto.",
  },
  {
    target: '[data-tour="menu-sellers"]',
    title: "Vendedores",
    content: "Cadastro de vendedores, metas mensais e taxas de comissão.",
  },
  {
    target: '[data-tour="menu-producers"]',
    title: "Produtores",
    content: "Cadastro dos produtores responsáveis pela entrega dos serviços.",
  },
  {
    target: '[data-tour="menu-payment-link"]',
    title: "Gerar Pagamento",
    content: "Crie links de pagamento via Pagar.me para enviar ao cliente.",
  },
  {
    target: '[data-tour="menu-finance"]',
    title: "Financeiro",
    content: "Controle de receitas, despesas e fluxo de caixa.",
  },
  {
    target: '[data-tour="menu-pending-payments"]',
    title: "Valores Pendentes",
    content:
      "Clientes com pagamentos parciais ou em débito. Aqui você confirma recebimentos e anexa comprovantes.",
  },
  {
    target: '[data-tour="menu-invoices"]',
    title: "Notas Fiscais",
    content: "Emissão e controle das notas fiscais de cada venda.",
  },
  {
    target: '[data-tour="menu-commissions"]',
    title: "Comissões",
    content: "Apuração das comissões dos vendedores por período.",
  },
  {
    target: '[data-tour="menu-backup"]',
    title: "Backup",
    content: "Faça o backup dos dados da sua operação.",
  },
  {
    target: '[data-tour="menu-admin"]',
    title: "Configurações",
    content:
      "Gerencie usuários, integrações como Pagar.me, tipos de serviço, pacotes e mais.",
  },
];

export function OnboardingTour() {
  const [run, setRun] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted || !data.user) return;
      const key = `tour_done_${data.user.id}`;
      setUserId(data.user.id);
      if (!localStorage.getItem(key)) {
        setTimeout(() => mounted && setRun(true), 600);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleCallback = (d: CallBackProps) => {
    const finished: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finished.includes(d.status)) {
      if (userId) localStorage.setItem(`tour_done_${userId}`, "1");
      setRun(false);
    }
  };

  if (!run) return null;

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      showProgress
      showSkipButton
      disableScrolling={false}
      callback={handleCallback}
      locale={{
        back: "Voltar",
        close: "Fechar",
        last: "Finalizar",
        next: "Próximo",
        skip: "Pular tour",
      }}
      styles={{
        options: {
          primaryColor: "hsl(0 84% 55%)",
          zIndex: 10000,
          arrowColor: "var(--card)",
          backgroundColor: "var(--card)",
          textColor: "var(--foreground)",
          overlayColor: "rgba(0,0,0,0.55)",
        },
      }}
    />
  );
}