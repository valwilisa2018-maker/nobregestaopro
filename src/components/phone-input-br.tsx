import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { formatPhoneBR } from "@/lib/phone";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value?: string | null;
  onChange?: (formatted: string) => void;
};

/**
 * Campo de telefone brasileiro com bandeira 🇧🇷 +55 fixa e máscara
 * (DD) 9XXXX-XXXX. O valor exposto via onChange já vem formatado.
 */
export const PhoneInputBR = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, placeholder, ...rest }, ref) => {
    return (
      <div className={cn("flex items-stretch rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring overflow-hidden", className)}>
        <span
          aria-label="Brasil +55"
          title="Brasil (+55)"
          className="flex items-center gap-1 px-2 bg-muted/50 border-r border-input text-sm select-none"
        >
          <span className="text-base leading-none">🇧🇷</span>
          <span className="text-muted-foreground">+55</span>
        </span>
        <Input
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={placeholder ?? "(35) 99999-9999"}
          value={formatPhoneBR(value ?? "")}
          onChange={(e) => onChange?.(formatPhoneBR(e.target.value))}
          className="border-0 focus-visible:ring-0 rounded-none"
          {...rest}
        />
      </div>
    );
  },
);
PhoneInputBR.displayName = "PhoneInputBR";