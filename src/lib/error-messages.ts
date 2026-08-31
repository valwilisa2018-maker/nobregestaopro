/**
 * Tradução central de mensagens técnicas (backend, banco, rede, autenticação)
 * para português do Brasil. Usada por todos os avisos/notificações do sistema.
 */

type Rule = { match: RegExp; message: string };

const RULES: Rule[] = [
  // --- Permissões / RLS ---
  { match: /row[- ]level security policy/i, message: "Você não tem permissão para fazer isso neste registro." },
  { match: /permission denied for (table|schema|relation|function)/i, message: "Sem permissão de acesso a estes dados. Fale com o administrador." },
  { match: /insufficient[_ ]privilege/i, message: "Permissão insuficiente para esta ação." },
  { match: /JWT (issued at future|expired|is expired)/i, message: "Sua sessão expirou. Entre novamente para continuar." },
  { match: /PGRST303/i, message: "Sua sessão expirou. Entre novamente para continuar." },
  { match: /invalid (jwt|claim|token)/i, message: "Sessão inválida. Faça login novamente." },
  { match: /No API key found|Invalid API key/i, message: "Falha de autenticação com o servidor. Recarregue a página." },

  // --- Autenticação ---
  { match: /invalid login credentials/i, message: "E-mail ou senha incorretos." },
  { match: /email not confirmed/i, message: "Confirme seu e-mail antes de entrar." },
  { match: /user already registered|already been registered/i, message: "Este e-mail já possui uma conta." },
  { match: /password should be at least (\d+)/i, message: "A senha deve ter ao menos 6 caracteres." },
  { match: /email rate limit exceeded|over_email_send_rate_limit/i, message: "Muitos e-mails enviados. Aguarde alguns minutos e tente novamente." },
  { match: /for security purposes, you can only request this after (\d+)/i, message: "Por segurança, aguarde alguns segundos antes de tentar novamente." },
  { match: /signups not allowed|signup is disabled/i, message: "Novos cadastros estão desativados." },
  { match: /unsupported provider/i, message: "Este método de login não está configurado." },
  { match: /user not found/i, message: "Usuário não encontrado." },
  { match: /session (not found|missing)|Auth session missing/i, message: "Sessão não encontrada. Faça login novamente." },
  { match: /unauthorized/i, message: "Você não tem autorização para esta ação." },
  { match: /forbidden/i, message: "Acesso negado." },

  // --- Banco de dados ---
  { match: /duplicate key value|already exists/i, message: "Este registro já existe." },
  { match: /violates foreign key constraint/i, message: "Este registro está vinculado a outros dados e não pode ser alterado ou removido." },
  { match: /violates not-null constraint/i, message: "Preencha todos os campos obrigatórios." },
  { match: /violates check constraint/i, message: "Algum valor informado não é válido." },
  { match: /invalid input syntax for type (uuid|integer|numeric|date|timestamp)/i, message: "Algum valor informado está em formato inválido." },
  { match: /value too long/i, message: "Um dos campos excedeu o tamanho permitido." },
  { match: /division by zero/i, message: "Não foi possível calcular: divisão por zero." },
  { match: /(relation|column|function) .* does not exist/i, message: "Recurso não encontrado no banco de dados. Fale com o suporte." },
  { match: /could not find the (function|table|column)/i, message: "Recurso não encontrado no servidor. Fale com o suporte." },
  { match: /statement timeout|canceling statement due to/i, message: "A consulta demorou demais. Tente filtrar por um período menor." },
  { match: /too many (connections|requests)/i, message: "Servidor ocupado. Tente novamente em instantes." },
  { match: /^JSON object requested|multiple \(or no\) rows returned|PGRST116/i, message: "Registro não encontrado." },

  // --- Armazenamento de arquivos ---
  { match: /(the resource )?already exists/i, message: "Já existe um arquivo com esse nome." },
  { match: /payload too large|exceeded the maximum allowed size|file size/i, message: "Arquivo muito grande." },
  { match: /mime type .* is not supported|invalid mime type/i, message: "Tipo de arquivo não permitido." },
  { match: /bucket not found/i, message: "Pasta de arquivos não encontrada." },
  { match: /object not found|not_found/i, message: "Arquivo não encontrado." },

  // --- Rede ---
  { match: /failed to fetch|network(error| request failed)|fetch failed/i, message: "Sem conexão com o servidor. Verifique sua internet e tente novamente." },
  { match: /load failed/i, message: "Falha ao carregar os dados. Tente novamente." },
  { match: /(timeout|timed out|aborted)/i, message: "A operação demorou demais e foi cancelada. Tente novamente." },
  { match: /internal server error|status(?: code)? 5\d\d/i, message: "Erro no servidor. Tente novamente em instantes." },
  { match: /not found|status(?: code)? 404/i, message: "Não encontrado." },
  { match: /rate limit|too many attempts/i, message: "Muitas tentativas. Aguarde um pouco e tente novamente." },
];

const GENERIC = "Ocorreu um erro inesperado. Tente novamente.";

function hasLatinAccentsOrPtWords(text: string) {
  return /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/.test(text) ||
    /\b(erro|falha|senha|não|venda|arquivo|pasta|conta|salvo|salvar|criado|criada|removido|removida|atualizado|atualizada|sucesso|obrigatório|inválido|inválida|permissão|usuário|cliente|produtor|vendedor|card|plano|fatura|comissão)\b/i.test(text);
}

/** Traduz uma mensagem técnica para português. Mensagens já em PT são mantidas. */
export function translateMessage(input: unknown): string {
  const raw = typeof input === "string" ? input : "";
  const text = raw.trim();
  if (!text) return GENERIC;

  for (const rule of RULES) {
    if (rule.match.test(text)) return rule.message;
  }

  // Já está em português → mantém como está.
  if (hasLatinAccentsOrPtWords(text)) return text;

  // Texto técnico em inglês sem tradução conhecida → mensagem genérica.
  const looksTechnical = /[{}<>]|\b(error|failed|invalid|cannot|unexpected|undefined|null|exception|violates|constraint|denied|request)\b/i.test(text);
  return looksTechnical ? GENERIC : text;
}

/** Extrai e traduz a mensagem de qualquer objeto de erro. */
export function getErrorMessage(error: unknown, fallback = GENERIC): string {
  if (!error) return fallback;
  if (typeof error === "string") return translateMessage(error);
  const e = error as Record<string, any>;
  const candidate =
    e?.message ?? e?.error_description ?? e?.error?.message ?? e?.details ?? e?.hint ?? e?.statusText;
  if (typeof candidate === "string" && candidate.trim()) return translateMessage(candidate);
  return fallback;
}

export const MENSAGEM_ERRO_GENERICA = GENERIC;
