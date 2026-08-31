import { toast as sonnerToast } from "sonner";
import { translateMessage } from "@/lib/error-messages";

type Message = Parameters<typeof sonnerToast>[0];

function tr(message: Message): Message {
  return typeof message === "string" ? translateMessage(message) : message;
}

function trOptions<T extends Record<string, any> | undefined>(options: T): T {
  if (!options) return options;
  const next: Record<string, any> = { ...options };
  if (typeof next.description === "string") next.description = translateMessage(next.description);
  return next as T;
}

type SonnerToast = typeof sonnerToast;

/**
 * Wrapper do sonner que garante que TODA notificação do sistema
 * (sucesso, erro, aviso, info) apareça em português.
 */
const base = ((message: any, options?: any) => sonnerToast(tr(message), trOptions(options))) as SonnerToast;

export const toast: SonnerToast = Object.assign(base, sonnerToast, {
  success: (message: any, options?: any) => sonnerToast.success(tr(message), trOptions(options)),
  error: (message: any, options?: any) => sonnerToast.error(tr(message), trOptions(options)),
  warning: (message: any, options?: any) => sonnerToast.warning(tr(message), trOptions(options)),
  info: (message: any, options?: any) => sonnerToast.info(tr(message), trOptions(options)),
  message: (message: any, options?: any) => sonnerToast.message(tr(message), trOptions(options)),
  loading: (message: any, options?: any) => sonnerToast.loading(tr(message), trOptions(options)),
});
