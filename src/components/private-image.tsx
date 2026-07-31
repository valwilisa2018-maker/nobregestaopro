import { useSignedUrl } from "@/lib/storage-signed";

/** Exibe imagens armazenadas em buckets privados via URL assinada. */
export function PrivateImage({
  bucket,
  value,
  alt,
  className,
}: {
  bucket: string;
  value?: string | null;
  alt?: string;
  className?: string;
}) {
  const url = useSignedUrl(bucket, value);
  if (!url) return null;
  return <img src={url} alt={alt ?? ""} className={className} />;
}