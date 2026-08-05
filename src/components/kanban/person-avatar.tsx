import { useEffect, useState } from "react";
import { useSignedUrl } from "@/lib/storage-signed";

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
  const signedUrl = useSignedUrl(bucket, value);
  const src = value?.startsWith("http") ? value : signedUrl;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <div
      className={`${baseClassName} ${className} flex shrink-0 items-center justify-center`}
      aria-hidden="true"
    >
      {src && !imageFailed ? (
        <img
          src={src}
          alt={name ?? ""}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        fallback
      )}
    </div>
  );
}
