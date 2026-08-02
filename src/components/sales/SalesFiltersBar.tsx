import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LookupOption } from "./types";

function optionText(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function optionValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export interface SalesFiltersBarProps {
  fSearch: string;
  setFSearch: (v: string) => void;
  fSeller: string;
  setFSeller: (v: string) => void;
  fProducer: string;
  setFProducer: (v: string) => void;
  fService: string;
  setFService: (v: string) => void;
  fYear: string;
  setFYear: (v: string) => void;
  fMonth: string;
  setFMonth: (v: string) => void;
  fFrom: string;
  setFFrom: (v: string) => void;
  fTo: string;
  setFTo: (v: string) => void;
  sellers: LookupOption[];
  producers: LookupOption[];
  serviceTypes: LookupOption[];
  yearOptions: string[];
  filteredCount: number;
  totalCount: number;
  hasFilters: boolean;
  onClearFilters: () => void;
}

export function SalesFiltersBar({
  fSearch,
  setFSearch,
  fSeller,
  setFSeller,
  fProducer,
  setFProducer,
  fService,
  setFService,
  fYear,
  setFYear,
  fMonth,
  setFMonth,
  fFrom,
  setFFrom,
  fTo,
  setFTo,
  sellers,
  producers,
  serviceTypes,
  yearOptions,
  filteredCount,
  totalCount,
  hasFilters,
  onClearFilters,
}: SalesFiltersBarProps) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <div className="col-span-2 md:col-span-2 lg:col-span-2 relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-7 h-9"
            placeholder="Cliente, serviço, vendedor, produtor..."
            value={fSearch}
            onChange={(e) => setFSearch(e.target.value)}
          />
        </div>
        <Select value={fSeller} onValueChange={setFSeller}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos vendedores</SelectItem>
            {(sellers ?? []).map((s) =>
              optionValue(s.id) ? (
                <SelectItem key={s.id} value={String(s.id)}>
                  {optionText(s.name)}
                </SelectItem>
              ) : null,
            )}
          </SelectContent>
        </Select>
        <Select value={fProducer} onValueChange={setFProducer}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Produtor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos produtores</SelectItem>
            {(producers ?? []).map((p) =>
              optionValue(p.id) ? (
                <SelectItem key={p.id} value={String(p.id)}>
                  {optionText(p.name)}
                </SelectItem>
              ) : null,
            )}
          </SelectContent>
        </Select>
        <Select value={fService} onValueChange={setFService}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Serviço" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos serviços</SelectItem>
            {(serviceTypes ?? []).map((st) =>
              optionValue(st.id) ? (
                <SelectItem key={st.id} value={String(st.id)}>
                  {optionText(st.name)}
                </SelectItem>
              ) : null,
            )}
          </SelectContent>
        </Select>
        <Select value={fYear} onValueChange={setFYear}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos anos</SelectItem>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fMonth} onValueChange={setFMonth}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos meses</SelectItem>
            {MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i + 1)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="h-9"
          value={fFrom}
          onChange={(e) => setFFrom(e.target.value)}
          title="De"
        />
        <Input
          type="date"
          className="h-9"
          value={fTo}
          onChange={(e) => setFTo(e.target.value)}
          title="Até"
        />
        <div className="col-span-2 md:col-span-4 lg:col-span-8 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {filteredCount} de {totalCount} vendas
          </span>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-7" onClick={onClearFilters}>
              <X className="w-3 h-3 mr-1" />
              Limpar filtros
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
