import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { KanbanPersonAvatar } from "./person-avatar";
import type { ProducerOption } from "./types";

export interface KanbanFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  producers: ProducerOption[];
  producerFilter: string;
  onProducerFilterChange: (value: string) => void;
}

export function KanbanFilters({
  search,
  onSearchChange,
  producers,
  producerFilter,
  onProducerFilterChange,
}: KanbanFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por cliente, serviço, vendedor..."
          className="pl-9"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button
          size="sm"
          variant={producerFilter === "all" ? "default" : "outline"}
          onClick={() => onProducerFilterChange("all")}
        >
          Todos
        </Button>
        {(producers ?? []).map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={producerFilter === p.id ? "default" : "outline"}
            onClick={() => onProducerFilterChange(p.id)}
            className="whitespace-nowrap gap-2"
          >
            <KanbanPersonAvatar
              bucket="producer-avatars"
              name={p.name}
              value={p.avatar_url}
              className="h-5 w-5"
            />
            {p.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
