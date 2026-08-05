import { PrivateImage } from "@/components/private-image";

export interface KanbanPersonAvatarProps {
  bucket: string;
  name?: string | null;
  value?: string | null;
  className?: string;
}

export function KanbanPersonAvatar({
  bucket,
  name,
  value,
  className = "h-6 w-6",
}: KanbanPersonAvatarProps) {
  const fallback = (name?.trim().charAt(0) ?? "?").toUpperCase();
  const baseClassName =
    "overflow-hidden rounded-full border border-border/70 bg-muted text-[10px] font-semibold text-muted-foreground";

  return (
    <div
      className={`${baseClassName} ${className} flex shrink-0 items-center justify-center`}
      aria-hidden="true"
    >
      {value ? (
        value.startsWith("http") ? (
          <img src={value} alt={name ?? ""} className="h-full w-full object-cover" />
        ) : (
          <PrivateImage
            bucket={bucket}
            value={value}
            alt={name ?? ""}
            className="h-full w-full object-cover"
          />
        )
      ) : (
        fallback
      )}
    </div>
  );
}
