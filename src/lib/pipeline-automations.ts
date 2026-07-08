// Stage automations config — indexed by normalized stage name.
// Executed client-side after a successful stage move.

export type StageAutomation = {
  reminderDays?: number;      // sets next_contact_at = now + N days
  whatsapp?: string;          // template with {name}, {company}, {product}, {value}
  email?: { subject: string; body: string };
  task?: string;              // creates calendar event (localStorage)
  taskDurationMin?: number;
};

// Keys are normalized (lowercase, no accents). Matched by "contains".
export const STAGE_AUTOMATIONS: Array<{ match: string; a: StageAutomation }> = [
  {
    match: "novo lead",
    a: {
      reminderDays: 1,
      whatsapp: "Olá {name}! 👋 Recebemos seu contato e em breve retornaremos. Obrigado!",
      task: "Fazer primeiro contato com {name}",
    },
  },
  {
    match: "primeiro contato",
    a: {
      reminderDays: 2,
      whatsapp: "Oi {name}, tudo bem? Sou da equipe e vou te acompanhar por aqui. Podemos conversar?",
      task: "Retornar contato com {name}",
    },
  },
  {
    match: "qualificac",
    a: {
      reminderDays: 3,
      whatsapp: "{name}, para eu te apresentar a melhor solução, posso te fazer algumas perguntas rápidas?",
      task: "Qualificar necessidades de {name}",
    },
  },
  {
    match: "apresentac",
    a: {
      reminderDays: 2,
      whatsapp: "{name}, confirmo nossa apresentação. Qualquer dúvida, me chama por aqui!",
      task: "Apresentar solução para {name}",
      taskDurationMin: 45,
    },
  },
  {
    match: "negociac",
    a: {
      reminderDays: 2,
      whatsapp: "{name}, seguindo com nossa negociação. Preparei condições especiais, posso te enviar?",
      task: "Negociar condições com {name}",
    },
  },
  {
    match: "proposta",
    a: {
      reminderDays: 3,
      whatsapp: "{name}, enviei sua proposta! 🎯 Qualquer ponto que precise ajustar, me avisa.",
      email: {
        subject: "Sua proposta chegou 🎯",
        body: "Olá {name},\n\nSegue a proposta que preparamos. Fico à disposição para tirar dúvidas.\n\nAbraço!",
      },
      task: "Confirmar recebimento da proposta com {name}",
    },
  },
  {
    match: "follow",
    a: {
      reminderDays: 2,
      whatsapp: "{name}, passando aqui para saber se conseguiu ver a proposta. Alguma dúvida?",
      task: "Follow-up com {name}",
    },
  },
  {
    match: "fechamento",
    a: {
      reminderDays: 1,
      whatsapp: "{name}, que bom te ter com a gente! 🚀 Vamos alinhar os últimos detalhes para fechar?",
      task: "Fechar negócio com {name}",
    },
  },
  {
    match: "pagamento",
    a: {
      reminderDays: 1,
      whatsapp: "{name}, aqui está o link para pagamento. Assim que confirmarmos, damos início! 💳",
      email: {
        subject: "Instruções de pagamento",
        body: "Olá {name},\n\nSegue o passo a passo para pagamento. Qualquer dúvida, me chame.\n\nObrigado!",
      },
      task: "Confirmar pagamento de {name}",
    },
  },
  {
    match: "implantac",
    a: {
      reminderDays: 3,
      whatsapp: "{name}, bora começar! 🚀 Vou te enviar os primeiros passos da implantação.",
      task: "Iniciar implantação de {name}",
      taskDurationMin: 60,
    },
  },
  {
    match: "pos-venda",
    a: {
      reminderDays: 7,
      whatsapp: "{name}, tudo certo por aí? Estou por aqui para o que precisar. 💙",
      task: "Follow-up de pós-venda com {name}",
    },
  },
  {
    match: "recorrente",
    a: {
      reminderDays: 30,
      whatsapp: "{name}, obrigado por continuar com a gente! 🎉 Qualquer novidade, me avisa.",
      email: {
        subject: "Obrigado por continuar com a gente 💙",
        body: "Olá {name},\n\nSó passando para agradecer a parceria. Estamos sempre à disposição!\n\nAbraço.",
      },
      task: "Check-in mensal com {name}",
    },
  },
  {
    match: "perdido",
    a: {
      task: "Registrar motivo da perda de {name}",
    },
  },
];

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getStageAutomation(stageName: string): StageAutomation | null {
  const n = normalize(stageName);
  const hit = STAGE_AUTOMATIONS.find((s) => n.includes(s.match));
  return hit?.a ?? null;
}

export function renderTemplate(
  tpl: string,
  vars: { name?: string | null; company?: string | null; product?: string | null; value?: string | null },
) {
  return tpl
    .replace(/\{name\}/g, vars.name || "cliente")
    .replace(/\{company\}/g, vars.company || "")
    .replace(/\{product\}/g, vars.product || "")
    .replace(/\{value\}/g, vars.value || "");
}