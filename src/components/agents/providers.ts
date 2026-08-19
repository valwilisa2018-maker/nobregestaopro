export type ProviderId =
  | "openai"
  | "gemini"
  | "anthropic"
  | "grok"
  | "deepseek"
  | "openrouter"
  | "azure"
  | "bedrock"
  | "ollama"
  | "together"
  | "groq"
  | "fireworks"
  | "mistral"
  | "cohere"
  | "huggingface"
  | "qwen"
  | "nvidia"
  | "cerebras"
  | "sambanova"
  | "custom";

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  models: string[];
  fields: {
    apiKey?: boolean;
    baseUrl?: boolean;
    org?: boolean;
    project?: boolean;
    version?: boolean;
    region?: boolean;
  };
  params: {
    temperature?: boolean;
    topP?: boolean;
    topK?: boolean;
    maxTokens?: boolean;
    seed?: boolean;
    freq?: boolean;
    pres?: boolean;
    stop?: boolean;
    streaming?: boolean;
    thinking?: boolean;
  };
}

export const PROVIDERS: ProviderSpec[] = [
  {
    id: "openai",
    label: "OpenAI",
    models: ["gpt-5.5", "gpt-5.5-mini", "gpt-5.4", "gpt-5.4-mini", "gpt-5", "gpt-5-mini", "gpt-4o"],
    fields: { apiKey: true, baseUrl: true, org: true, project: true },
    params: {
      temperature: true,
      topP: true,
      maxTokens: true,
      seed: true,
      freq: true,
      pres: true,
      stop: true,
      streaming: true,
    },
  },
  {
    id: "gemini",
    label: "Google Gemini",
    models: [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-3-flash-preview",
    ],
    fields: { apiKey: true, baseUrl: true },
    params: {
      temperature: true,
      topP: true,
      topK: true,
      maxTokens: true,
      stop: true,
      streaming: true,
      thinking: true,
    },
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    models: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"],
    fields: { apiKey: true, baseUrl: true, version: true },
    params: {
      temperature: true,
      topP: true,
      topK: true,
      maxTokens: true,
      stop: true,
      streaming: true,
      thinking: true,
    },
  },
  {
    id: "grok",
    label: "xAI Grok",
    models: ["grok-4", "grok-3", "grok-3-mini"],
    fields: { apiKey: true, baseUrl: true },
    params: { temperature: true, topP: true, maxTokens: true, seed: true, streaming: true },
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    fields: { apiKey: true, baseUrl: true },
    params: {
      temperature: true,
      topP: true,
      maxTokens: true,
      freq: true,
      pres: true,
      streaming: true,
    },
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    models: ["auto", "openai/gpt-5", "anthropic/claude-opus-4", "google/gemini-2.5-pro"],
    fields: { apiKey: true, baseUrl: true },
    params: {
      temperature: true,
      topP: true,
      topK: true,
      maxTokens: true,
      freq: true,
      pres: true,
      streaming: true,
    },
  },
  {
    id: "azure",
    label: "Azure OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-5"],
    fields: { apiKey: true, baseUrl: true, version: true, region: true },
    params: { temperature: true, topP: true, maxTokens: true, streaming: true },
  },
  {
    id: "bedrock",
    label: "AWS Bedrock",
    models: ["anthropic.claude-3-5-sonnet", "meta.llama3-70b", "mistral.mistral-large"],
    fields: { apiKey: true, region: true },
    params: { temperature: true, topP: true, maxTokens: true, streaming: true },
  },
  {
    id: "ollama",
    label: "Ollama",
    models: ["llama3.1", "llama3.2", "qwen2.5", "mistral", "phi3"],
    fields: { baseUrl: true },
    params: { temperature: true, topP: true, topK: true, maxTokens: true, streaming: true },
  },
  {
    id: "together",
    label: "Together AI",
    models: ["meta-llama/Llama-3.3-70B", "Qwen/Qwen2.5-72B"],
    fields: { apiKey: true, baseUrl: true },
    params: { temperature: true, topP: true, topK: true, maxTokens: true, streaming: true },
  },
  {
    id: "groq",
    label: "Groq",
    models: ["llama-3.3-70b", "mixtral-8x7b", "gemma2-9b"],
    fields: { apiKey: true, baseUrl: true },
    params: { temperature: true, topP: true, maxTokens: true, streaming: true },
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    models: ["llama-v3p3-70b", "qwen2p5-72b"],
    fields: { apiKey: true, baseUrl: true },
    params: { temperature: true, topP: true, maxTokens: true, streaming: true },
  },
  {
    id: "mistral",
    label: "Mistral AI",
    models: ["mistral-large", "mistral-medium", "codestral"],
    fields: { apiKey: true, baseUrl: true },
    params: { temperature: true, topP: true, maxTokens: true, streaming: true },
  },
  {
    id: "cohere",
    label: "Cohere",
    models: ["command-r-plus", "command-r"],
    fields: { apiKey: true, baseUrl: true },
    params: { temperature: true, topP: true, topK: true, maxTokens: true, streaming: true },
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    models: ["meta-llama/Meta-Llama-3-70B", "mistralai/Mixtral-8x7B"],
    fields: { apiKey: true, baseUrl: true },
    params: { temperature: true, topP: true, maxTokens: true, streaming: true },
  },
  {
    id: "qwen",
    label: "Qwen",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
    fields: { apiKey: true, baseUrl: true },
    params: { temperature: true, topP: true, topK: true, maxTokens: true, streaming: true },
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    models: ["llama-3.3-70b-instruct", "nemotron-70b"],
    fields: { apiKey: true, baseUrl: true },
    params: { temperature: true, topP: true, maxTokens: true, streaming: true },
  },
  {
    id: "cerebras",
    label: "Cerebras",
    models: ["llama3.1-70b", "llama3.1-8b"],
    fields: { apiKey: true, baseUrl: true },
    params: { temperature: true, topP: true, maxTokens: true, streaming: true },
  },
  {
    id: "sambanova",
    label: "SambaNova",
    models: ["Meta-Llama-3.3-70B", "Qwen2.5-72B"],
    fields: { apiKey: true, baseUrl: true },
    params: { temperature: true, topP: true, maxTokens: true, streaming: true },
  },
  {
    id: "custom",
    label: "Custom Provider",
    models: [],
    fields: { apiKey: true, baseUrl: true, org: true, version: true },
    params: {
      temperature: true,
      topP: true,
      topK: true,
      maxTokens: true,
      seed: true,
      freq: true,
      pres: true,
      stop: true,
      streaming: true,
      thinking: true,
    },
  },
];

export const TOOL_CATALOG: { id: string; label: string }[] = [
  { id: "web_search", label: "Pesquisa Web" },
  { id: "image_gen", label: "Geração de Imagens" },
  { id: "ocr", label: "OCR" },
  { id: "file_analysis", label: "Análise de Arquivos" },
  { id: "code", label: "Code Interpreter" },
  { id: "calculator", label: "Calculadora" },
  { id: "rag", label: "RAG" },
  { id: "database", label: "Banco de Dados" },
  { id: "apis", label: "APIs" },
  { id: "mcp", label: "MCP" },
  { id: "webhooks", label: "Webhooks" },
  { id: "workflow", label: "Workflow" },
  { id: "calendar", label: "Calendário" },
  { id: "email", label: "E-mail" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telegram", label: "Telegram" },
  { id: "discord", label: "Discord" },
  { id: "slack", label: "Slack" },
  { id: "github", label: "GitHub" },
  { id: "gdrive", label: "Google Drive" },
  { id: "dropbox", label: "Dropbox" },
  { id: "notion", label: "Notion" },
];

export const INTEGRATION_CATALOG: { id: string; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telegram", label: "Telegram" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "messenger", label: "Messenger" },
  { id: "discord", label: "Discord" },
  { id: "slack", label: "Slack" },
  { id: "rest", label: "API REST" },
  { id: "webhooks", label: "Webhooks" },
  { id: "n8n", label: "n8n" },
  { id: "make", label: "Make" },
  { id: "evolution", label: "Evolution API" },
];
