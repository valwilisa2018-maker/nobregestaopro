import { MessageCircle, Copy } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { waHref, formatPhoneBR } from "@/lib/phone";
import { toast } from "sonner";

export interface CardWhatsAppButtonsProps {
  phone?: string | null;
  customerName?: string | null;
}

export function CardWhatsAppButtons({ phone, customerName }: CardWhatsAppButtonsProps) {
  const waUrl = waHref(phone, `Olá ${customerName ?? ""}!`.trim());
  if (!waUrl) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigator.clipboard.writeText(formatPhoneBR(phone)).then(
                () => toast.success(`Número copiado: ${formatPhoneBR(phone)}`),
                () => toast.error("Não foi possível copiar"),
              );
            }}
            className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#25D366] text-white shadow-md hover:scale-110 transition-transform"
            aria-label="Abrir WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
          </a>
        </TooltipTrigger>
        <TooltipContent side="top">Abrir WhatsApp</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigator.clipboard.writeText(formatPhoneBR(phone)).then(
                () => toast.success(`Número copiado: ${formatPhoneBR(phone)}`),
                () => toast.error("Não foi possível copiar"),
              );
            }}
            className="absolute top-2 right-10 z-10 inline-flex items-center justify-center w-6 h-6 rounded-full bg-foreground/80 text-background shadow-md hover:scale-110 transition-transform"
            aria-label="Copiar número"
          >
            <Copy className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Copiar número</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
