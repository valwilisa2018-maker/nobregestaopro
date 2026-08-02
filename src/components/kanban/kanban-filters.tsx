import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { PrivateImage } from "@/components/private-image";
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
            <span className="w-5 h-5 rounded-full bg-muted overflow-hidden border flex items-center justify-center text-[10px] font-bold">
              {p.avatar_url ? (
                <PrivateImage
                  bucket="producer-avatars"
                  value={p.avatar_url}
                  alt={p.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                (p.name?.charAt(0)?.toUpperCase() ?? "?")
              )}
            </span>
            {p.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
