import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Filter, X } from "lucide-react";

export type DashboardScope = "day" | "yesterday" | "week" | "month" | "year" | "custom";

interface NamedOption {
  id: string;
  name: string;
}

interface DashboardFiltersProps {
  scope: DashboardScope;
  onScopeChange: (scope: DashboardScope) => void;
  customFrom: string;
  onCustomFromChange: (value: string) => void;
  customTo: string;
  onCustomToChange: (value: string) => void;
  sellerFilter: string;
  onSellerFilterChange: (value: string) => void;
  serviceFilter: string;
  onServiceFilterChange: (value: string) => void;
  sellers: NamedOption[];
  serviceTypes: NamedOption[];
  showClear: boolean;
  onClear: () => void;
  visibleCount: number;
  totalCount: number;
}

export function DashboardFilters({
  scope,
  onScopeChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
  sellerFilter,
  onSellerFilterChange,
  serviceFilter,
  onServiceFilterChange,
  sellers,
  serviceTypes,
  showClear,
  onClear,
  visibleCount,
  totalCount,
}: DashboardFiltersProps) {
  return (
    <Card
      className="border-border/50 backdrop-blur-sm bg-card/70"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <CardContent className="p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mr-2">
          <Filter className="w-4 h-4 text-primary" />
          Filtros
        </div>

        <ToggleGroup
          type="single"
          value={scope}
          onValueChange={(v) => v && onScopeChange(v as DashboardScope)}
          size="sm"
        >
          <ToggleGroupItem value="day">Dia</ToggleGroupItem>
          <ToggleGroupItem value="yesterday">Ontem</ToggleGroupItem>
          <ToggleGroupItem value="week">Semana</ToggleGroupItem>
          <ToggleGroupItem value="month">Mês</ToggleGroupItem>
          <ToggleGroupItem value="year">Ano</ToggleGroupItem>
          <ToggleGroupItem value="custom">Personalizado</ToggleGroupItem>
        </ToggleGroup>

        {scope === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
            <span className="text-sm text-muted-foreground">até</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
        )}

        <Select value={sellerFilter} onValueChange={onSellerFilterChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vendedores</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={serviceFilter} onValueChange={onServiceFilterChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Tipo de serviço" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os serviços</SelectItem>
            {serviceTypes.map((st) => (
              <SelectItem key={st.id} value={st.id}>
                {st.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showClear && (
          <Button size="sm" variant="ghost" onClick={onClear} className="gap-1">
            <X className="w-4 h-4" />
            Limpar
          </Button>
        )}

        <div className="ml-auto text-xs text-muted-foreground">
          Exibindo <span className="font-semibold text-foreground">{visibleCount}</span> de{" "}
          {totalCount} vendas
        </div>
      </CardContent>
    </Card>
  );
}
