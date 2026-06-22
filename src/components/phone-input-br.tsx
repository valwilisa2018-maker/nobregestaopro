import { forwardRef, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatPhoneBR, digitsOnly } from "@/lib/phone";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value?: string | null;
  onChange?: (formatted: string) => void;
};

type Country = { code: string; dial: string; flag: string; name: string };

// Lista de países com DDI. Brasil é o padrão.
const COUNTRIES: Country[] = [
  { code: "BR", dial: "55", flag: "🇧🇷", name: "Brasil" },
  { code: "US", dial: "1", flag: "🇺🇸", name: "Estados Unidos" },
  { code: "CA", dial: "1", flag: "🇨🇦", name: "Canadá" },
  { code: "MX", dial: "52", flag: "🇲🇽", name: "México" },
  { code: "AR", dial: "54", flag: "🇦🇷", name: "Argentina" },
  { code: "CL", dial: "56", flag: "🇨🇱", name: "Chile" },
  { code: "CO", dial: "57", flag: "🇨🇴", name: "Colômbia" },
  { code: "PE", dial: "51", flag: "🇵🇪", name: "Peru" },
  { code: "UY", dial: "598", flag: "🇺🇾", name: "Uruguai" },
  { code: "PY", dial: "595", flag: "🇵🇾", name: "Paraguai" },
  { code: "BO", dial: "591", flag: "🇧🇴", name: "Bolívia" },
  { code: "VE", dial: "58", flag: "🇻🇪", name: "Venezuela" },
  { code: "EC", dial: "593", flag: "🇪🇨", name: "Equador" },
  { code: "PT", dial: "351", flag: "🇵🇹", name: "Portugal" },
  { code: "ES", dial: "34", flag: "🇪🇸", name: "Espanha" },
  { code: "FR", dial: "33", flag: "🇫🇷", name: "França" },
  { code: "IT", dial: "39", flag: "🇮🇹", name: "Itália" },
  { code: "DE", dial: "49", flag: "🇩🇪", name: "Alemanha" },
  { code: "GB", dial: "44", flag: "🇬🇧", name: "Reino Unido" },
  { code: "IE", dial: "353", flag: "🇮🇪", name: "Irlanda" },
  { code: "NL", dial: "31", flag: "🇳🇱", name: "Países Baixos" },
  { code: "BE", dial: "32", flag: "🇧🇪", name: "Bélgica" },
  { code: "CH", dial: "41", flag: "🇨🇭", name: "Suíça" },
  { code: "AT", dial: "43", flag: "🇦🇹", name: "Áustria" },
  { code: "SE", dial: "46", flag: "🇸🇪", name: "Suécia" },
  { code: "NO", dial: "47", flag: "🇳🇴", name: "Noruega" },
  { code: "DK", dial: "45", flag: "🇩🇰", name: "Dinamarca" },
  { code: "FI", dial: "358", flag: "🇫🇮", name: "Finlândia" },
  { code: "PL", dial: "48", flag: "🇵🇱", name: "Polônia" },
  { code: "CZ", dial: "420", flag: "🇨🇿", name: "República Tcheca" },
  { code: "RU", dial: "7", flag: "🇷🇺", name: "Rússia" },
  { code: "UA", dial: "380", flag: "🇺🇦", name: "Ucrânia" },
  { code: "TR", dial: "90", flag: "🇹🇷", name: "Turquia" },
  { code: "GR", dial: "30", flag: "🇬🇷", name: "Grécia" },
  { code: "IL", dial: "972", flag: "🇮🇱", name: "Israel" },
  { code: "AE", dial: "971", flag: "🇦🇪", name: "Emirados Árabes" },
  { code: "SA", dial: "966", flag: "🇸🇦", name: "Arábia Saudita" },
  { code: "EG", dial: "20", flag: "🇪🇬", name: "Egito" },
  { code: "MA", dial: "212", flag: "🇲🇦", name: "Marrocos" },
  { code: "ZA", dial: "27", flag: "🇿🇦", name: "África do Sul" },
  { code: "NG", dial: "234", flag: "🇳🇬", name: "Nigéria" },
  { code: "KE", dial: "254", flag: "🇰🇪", name: "Quênia" },
  { code: "AO", dial: "244", flag: "🇦🇴", name: "Angola" },
  { code: "MZ", dial: "258", flag: "🇲🇿", name: "Moçambique" },
  { code: "IN", dial: "91", flag: "🇮🇳", name: "Índia" },
  { code: "PK", dial: "92", flag: "🇵🇰", name: "Paquistão" },
  { code: "BD", dial: "880", flag: "🇧🇩", name: "Bangladesh" },
  { code: "CN", dial: "86", flag: "🇨🇳", name: "China" },
  { code: "JP", dial: "81", flag: "🇯🇵", name: "Japão" },
  { code: "KR", dial: "82", flag: "🇰🇷", name: "Coreia do Sul" },
  { code: "TH", dial: "66", flag: "🇹🇭", name: "Tailândia" },
  { code: "VN", dial: "84", flag: "🇻🇳", name: "Vietnã" },
  { code: "ID", dial: "62", flag: "🇮🇩", name: "Indonésia" },
  { code: "MY", dial: "60", flag: "🇲🇾", name: "Malásia" },
  { code: "SG", dial: "65", flag: "🇸🇬", name: "Singapura" },
  { code: "PH", dial: "63", flag: "🇵🇭", name: "Filipinas" },
  { code: "AU", dial: "61", flag: "🇦🇺", name: "Austrália" },
  { code: "NZ", dial: "64", flag: "🇳🇿", name: "Nova Zelândia" },
];

const BR = COUNTRIES[0];

/**
 * Detecta o país a partir do DDI presente no valor. Retorna BR por padrão.
 * Aceita "+55 ..." ou apenas dígitos com DDI no começo.
 */
function detectCountry(raw: string): Country {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const d = digitsOnly(trimmed);
    // tenta DDI de 3, 2, 1 dígitos (mais específico primeiro)
    for (const len of [3, 2, 1]) {
      const prefix = d.slice(0, len);
      const found = COUNTRIES.find((c) => c.dial === prefix && c.code !== "BR");
      if (found) return found;
    }
    if (d.startsWith("55")) return BR;
  }
  return BR;
}

function formatGeneric(raw: string): string {
  // só dígitos e espaços, máximo 15 dígitos (E.164)
  return digitsOnly(raw).slice(0, 15);
}

/**
 * Campo de telefone com seletor de país (padrão Brasil 🇧🇷 +55).
 * Para Brasil aplica máscara (DD) 9XXXX-XXXX e emite só o número nacional.
 * Para outros países emite "+DDI XXXXXXXX".
 */
export const PhoneInputBR = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, placeholder, ...rest }, ref) => {
    const [country, setCountry] = useState<Country>(() => detectCountry(value ?? ""));

    // Se o value externo mudar com DDI explícito, re-detecta país.
    useEffect(() => {
      const v = (value ?? "").trim();
      if (v.startsWith("+")) {
        const det = detectCountry(v);
        if (det.code !== country.code) setCountry(det);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const displayValue = useMemo(() => {
      const v = value ?? "";
      if (country.code === "BR") return formatPhoneBR(v);
      // remove o "+DDI" do início para mostrar só o número nacional no input
      const d = digitsOnly(v);
      const national = d.startsWith(country.dial) ? d.slice(country.dial.length) : d;
      return national;
    }, [value, country]);

    const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = COUNTRIES.find((c) => c.code === e.target.value) ?? BR;
      setCountry(next);
      // re-emite o valor já com o novo formato/DDI
      const national = digitsOnly(displayValue);
      if (next.code === "BR") {
        onChange?.(formatPhoneBR(national));
      } else {
        onChange?.(national ? `+${next.dial} ${national}` : "");
      }
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (country.code === "BR") {
        onChange?.(formatPhoneBR(e.target.value));
      } else {
        const national = formatGeneric(e.target.value);
        onChange?.(national ? `+${country.dial} ${national}` : "");
      }
    };

    return (
      <div className={cn("flex items-stretch rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring overflow-hidden", className)}>
        <div className="relative flex items-center gap-1 px-2 bg-muted/50 border-r border-input text-sm select-none">
          <span className="text-base leading-none">{country.flag}</span>
          <span className="text-muted-foreground">+{country.dial}</span>
          <span aria-hidden className="text-muted-foreground text-xs">▾</span>
          <select
            aria-label="Selecionar país"
            value={country.code}
            onChange={handleCountryChange}
            title={`${country.name} (+${country.dial})`}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code} className="bg-background text-foreground">
                {c.flag} {c.name} (+{c.dial})
              </option>
            ))}
          </select>
        </div>
        <Input
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={placeholder ?? (country.code === "BR" ? "(35) 99999-9999" : "Número")}
          value={displayValue}
          onChange={handleInput}
          className="border-0 focus-visible:ring-0 rounded-none"
          {...rest}
        />
      </div>
    );
  },
);
PhoneInputBR.displayName = "PhoneInputBR";