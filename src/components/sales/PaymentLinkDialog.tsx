import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, ExternalLink, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

export interface PaymentLinkDialogProps {
  paymentLinkData: { url: string; id: string } | null;
  onOpenChange: (open: boolean) => void;
}

export function PaymentLinkDialog({ paymentLinkData, onOpenChange }: PaymentLinkDialogProps) {
  return (
    <Dialog open={!!paymentLinkData} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600">
            <QrCode className="w-5 h-5" />
            Pagamento Gerado
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center space-y-6 py-4">
          <div className="p-4 bg-white rounded-2xl border-2 border-emerald-100 shadow-sm">
            <QRCodeSVG value={paymentLinkData?.url || ""} size={200} />
          </div>

          <div className="w-full space-y-2">
            <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
              Link de Pagamento
            </Label>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border group relative">
              <span className="text-sm truncate flex-1 font-medium">{paymentLinkData?.url}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(paymentLinkData?.url || "");
                  toast.success("Link copiado!");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 h-11 text-base font-bold shadow-lg shadow-emerald-200"
            onClick={() => window.open(paymentLinkData?.url, "_blank")}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Abrir Página de Pagamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
