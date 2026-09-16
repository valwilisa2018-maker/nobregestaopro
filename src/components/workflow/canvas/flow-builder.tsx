import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  BLOCK_TYPES,
  CANVAS_BLOCK_HEIGHT,
  CANVAS_BLOCK_WIDTH,
  TERMINAL_BLOCKS,
  autoLayout,
  blockTypeLabel,
  newBlock,
  type WorkflowBlock,
  type WorkflowBlockType,
} from "@/lib/workflow-shared";
import { BLOCK_VISUAL, blockSummary } from "./block-meta";
import { BlockProperties } from "./block-properties";
import { LayoutGrid, Minus, Plus } from "lucide-react";

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1400;

type Link = {
  from: WorkflowBlock;
  to: WorkflowBlock;
  label?: string;
  color: string;
};

type Props = {
  blocks: WorkflowBlock[];
  onBlocksChange: (blocks: WorkflowBlock[]) => void;
  canEdit: boolean;
  toolbar?: React.ReactNode;
};

export function FlowBuilder({ blocks, onBlocksChange, canEdit, toolbar }: Props) {
  const worldRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [linking, setLinking] = useState<{
    fromId: string;
    port: "nextId" | "nextIfMatch" | "nextIfNoMatch";
    x: number;
    y: number;
  } | null>(null);

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = worldRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
    },
    [zoom],
  );

  const patch = (id: string, data: Partial<WorkflowBlock>) =>
    onBlocksChange(blocks.map((block) => (block.id === id ? { ...block, ...data } : block)));

  const addBlock = (type: WorkflowBlockType) => {
    const created = newBlock(type, {
      x: 40 + (blocks.length % 3) * 30,
      y: 30 + blocks.length * 70,
    });
    onBlocksChange([...blocks, created]);
    setSelectedId(created.id);
  };

  const removeBlock = (id: string) => {
    onBlocksChange(
      blocks
        .filter((block) => block.id !== id)
        .map((block) => ({
          ...block,
          nextId: block.nextId === id ? null : block.nextId,
          nextIfMatch: block.nextIfMatch === id ? null : block.nextIfMatch,
          nextIfNoMatch: block.nextIfNoMatch === id ? null : block.nextIfNoMatch,
        })),
    );
    setSelectedId(null);
  };

  const links = useMemo<Link[]>(() => {
    const byId = new Map(blocks.map((block) => [block.id, block] as const));
    const result: Link[] = [];
    blocks.forEach((block, index) => {
      const fallback = blocks[index + 1];
      if (block.type === "condition" || block.type === "yes_no") {
        const yes = block.nextIfMatch ? byId.get(block.nextIfMatch) : fallback;
        const no = block.nextIfNoMatch ? byId.get(block.nextIfNoMatch) : undefined;
        if (yes) result.push({ from: block, to: yes, label: "sim", color: "#34d399" });
        if (no) result.push({ from: block, to: no, label: "não", color: "#f87171" });
        return;
      }
      if (TERMINAL_BLOCKS.includes(block.type)) return;
      const next = block.nextId ? byId.get(block.nextId) : fallback;
      if (next) result.push({ from: block, to: next, color: "#60a5fa" });
    });
    return result;
  }, [blocks]);

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = toWorld(event.clientX, event.clientY);
    if (dragRef.current) {
      const { id, dx, dy } = dragRef.current;
      patch(id, {
        x: Math.max(0, Math.min(WORLD_WIDTH - CANVAS_BLOCK_WIDTH, point.x - dx)),
        y: Math.max(0, Math.min(WORLD_HEIGHT - CANVAS_BLOCK_HEIGHT, point.y - dy)),
      });
      return;
    }
    if (linking) setLinking({ ...linking, x: point.x, y: point.y });
  };

  const finishLink = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (linking) {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const targetId = (element as HTMLElement | null)?.closest<HTMLElement>("[data-block-id]")
        ?.dataset.blockId;
      if (targetId && targetId !== linking.fromId) {
        patch(linking.fromId, { [linking.port]: targetId } as Partial<WorkflowBlock>);
      }
      setLinking(null);
    }
    dragRef.current = null;
  };

  const port = (
    block: WorkflowBlock,
    key: "nextId" | "nextIfMatch" | "nextIfNoMatch",
    style: string,
    title: string,
  ) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`absolute h-3.5 w-3.5 rounded-full border-2 border-background ${style} ${
        canEdit ? "cursor-crosshair" : "cursor-default"
      }`}
      onPointerDown={(event) => {
        if (!canEdit) return;
        event.stopPropagation();
        const point = toWorld(event.clientX, event.clientY);
        setLinking({ fromId: block.id, port: key, x: point.x, y: point.y });
      }}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border bg-card/60 p-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
            aria-label="Diminuir zoom"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
            aria-label="Aumentar zoom"
          >
            <Plus className="h-4 w-4" />
          </Button>
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onBlocksChange(autoLayout(blocks))}
              className="gap-2"
            >
              <LayoutGrid className="h-4 w-4" /> Organizar
            </Button>
          )}
        </div>
        {toolbar}
      </div>

      <div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)_300px]">
        <aside className="max-h-[560px] overflow-auto rounded-xl border bg-card/60 p-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">BLOCOS</p>
          <div className="space-y-1.5">
            {BLOCK_TYPES.map((type) => {
              const visual = BLOCK_VISUAL[type.value];
              const Icon = visual.icon;
              return (
                <button
                  key={type.value}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => addBlock(type.value)}
                  className="flex w-full items-center gap-2 rounded-lg border border-transparent p-2 text-left transition hover:border-border hover:bg-accent/50 disabled:opacity-50"
                >
                  <span className={`rounded-md p-1.5 ${visual.chip}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{type.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {type.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div
          className="relative h-[560px] touch-none select-none overflow-auto rounded-xl border bg-muted/20 bg-[radial-gradient(circle,rgba(120,120,140,0.35)_1px,transparent_1px)] [background-size:22px_22px]"
          onPointerMove={onPointerMove}
          onPointerUp={finishLink}
          onPointerLeave={finishLink}
        >
          <div
            ref={worldRef}
            className="relative origin-top-left"
            style={{
              width: WORLD_WIDTH,
              height: WORLD_HEIGHT,
              transform: `scale(${zoom})`,
            }}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setSelectedId(null);
            }}
          >
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {links.map((link, index) => {
                const x1 = (link.from.x ?? 0) + CANVAS_BLOCK_WIDTH;
                const y1 = (link.from.y ?? 0) + CANVAS_BLOCK_HEIGHT / 2;
                const x2 = link.to.x ?? 0;
                const y2 = (link.to.y ?? 0) + CANVAS_BLOCK_HEIGHT / 2;
                const mid = Math.max(40, Math.abs(x2 - x1) / 2);
                return (
                  <g key={`${link.from.id}-${link.to.id}-${index}`}>
                    <path
                      d={`M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={link.color}
                      strokeWidth={2}
                      opacity={0.8}
                    />
                    <circle cx={x2} cy={y2} r={4} fill={link.color} />
                    {link.label && (
                      <text
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2 - 8}
                        fill={link.color}
                        fontSize={11}
                        textAnchor="middle"
                      >
                        {link.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {linking && (
                <path
                  d={`M ${(blocks.find((b) => b.id === linking.fromId)?.x ?? 0) + CANVAS_BLOCK_WIDTH} ${
                    (blocks.find((b) => b.id === linking.fromId)?.y ?? 0) + CANVAS_BLOCK_HEIGHT / 2
                  } L ${linking.x} ${linking.y}`}
                  fill="none"
                  stroke="#a78bfa"
                  strokeDasharray="6 4"
                  strokeWidth={2}
                />
              )}
            </svg>

            {blocks.map((block, index) => {
              const visual = BLOCK_VISUAL[block.type];
              const Icon = visual.icon;
              const isSelected = block.id === selectedId;
              return (
                <div
                  key={block.id}
                  data-block-id={block.id}
                  style={{
                    left: block.x ?? 140,
                    top: block.y ?? 80,
                    width: CANVAS_BLOCK_WIDTH,
                    minHeight: CANVAS_BLOCK_HEIGHT,
                  }}
                  className={`absolute rounded-xl border bg-card/95 shadow-lg backdrop-blur transition ${
                    isSelected ? "border-primary ring-2 ring-primary/40" : visual.ring
                  } ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
                  onPointerDown={(event) => {
                    setSelectedId(block.id);
                    if (!canEdit) return;
                    const point = toWorld(event.clientX, event.clientY);
                    dragRef.current = {
                      id: block.id,
                      dx: point.x - (block.x ?? 0),
                      dy: point.y - (block.y ?? 0),
                    };
                  }}
                >
                  <div className="flex items-center gap-2 border-b px-3 py-2">
                    <span className={`rounded-md p-1 ${visual.chip}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {index + 1}. {blockTypeLabel(block.type)}
                    </span>
                  </div>
                  <p className="line-clamp-3 px-3 py-2 text-sm text-foreground/90">
                    {blockSummary(block)}
                  </p>

                  {block.type === "condition" || block.type === "yes_no" ? (
                    <>
                      <span style={{ position: "absolute", right: -7, top: 34 }}>
                        {port(block, "nextIfMatch", "bg-emerald-400", "Ligar caminho “sim”")}
                      </span>
                      <span style={{ position: "absolute", right: -7, top: 62 }}>
                        {port(block, "nextIfNoMatch", "bg-rose-400", "Ligar caminho “não”")}
                      </span>
                    </>
                  ) : TERMINAL_BLOCKS.includes(block.type) ? null : (
                    <span
                      style={{ position: "absolute", right: -7, top: CANVAS_BLOCK_HEIGHT / 2 - 7 }}
                    >
                      {port(block, "nextId", "bg-sky-400", "Ligar ao próximo bloco")}
                    </span>
                  )}
                </div>
              );
            })}

            {blocks.length === 0 && (
              <p className="absolute left-1/2 top-24 -translate-x-1/2 text-sm text-muted-foreground">
                Escolha um bloco à esquerda para começar. O fluxo começa por uma mensagem.
              </p>
            )}
          </div>
        </div>

        <aside className="rounded-xl border bg-card/60">
          <BlockProperties
            block={selected}
            blocks={blocks}
            canEdit={canEdit}
            onChange={(data) => selected && patch(selected.id, data)}
            onDelete={() => selected && removeBlock(selected.id)}
          />
        </aside>
      </div>
    </div>
  );
}
