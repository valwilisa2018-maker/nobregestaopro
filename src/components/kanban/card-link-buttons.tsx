import { FolderOpen, Link as LinkIcon } from "lucide-react";

export interface CardLinkButtonsProps {
  driveLink?: string | null;
  platformLink?: string | null;
}

export function CardLinkButtons({ driveLink, platformLink }: CardLinkButtonsProps) {
  const hasDrive = !!driveLink;
  const hasPlatform = !!platformLink;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className="flex items-center gap-1 pt-1 border-t border-dashed" onClick={stop}>
      {hasDrive ? (
        <a
          href={driveLink!}
          target="_blank"
          rel="noreferrer"
          onClick={stop}
          className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition whitespace-nowrap"
        >
          <LinkIcon className="w-3 h-3 shrink-0" /> <span className="truncate">Google Drive</span>
        </a>
      ) : (
        <span
          aria-disabled
          className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-blue-600/20 text-blue-700 dark:text-blue-300 opacity-50 cursor-not-allowed whitespace-nowrap"
          title="Sem link do Google Drive"
        >
          <LinkIcon className="w-3 h-3 shrink-0" /> <span className="truncate">Google Drive</span>
        </span>
      )}
      {hasPlatform ? (
        <a
          href={platformLink!}
          target="_blank"
          rel="noreferrer"
          onClick={stop}
          className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition whitespace-nowrap"
        >
          <FolderOpen className="w-3 h-3 shrink-0" /> <span className="truncate">Plataforma</span>
        </a>
      ) : (
        <span
          aria-disabled
          className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-red-600/20 text-red-700 dark:text-red-300 opacity-50 cursor-not-allowed whitespace-nowrap"
          title="Sem link da Plataforma"
        >
          <FolderOpen className="w-3 h-3 shrink-0" /> <span className="truncate">Plataforma</span>
        </span>
      )}
    </div>
  );
}
