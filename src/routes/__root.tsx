import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { UpdateBanner } from "@/components/update-banner";
import { WhiteLabelProvider } from "@/components/white-label-provider";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você está procurando não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocorreu um erro inesperado. Tente atualizar a página ou volte para o início.
        </p>
        {error?.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted/50 p-3 text-left text-xs text-muted-foreground whitespace-pre-wrap break-words">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google", content: "notranslate" },
      { title: "Gestão Nobre MKT — Gestão de Vendas e Produção" },
      { name: "description", content: "Plataforma premium para agências: gestão de vendas, produção, kanban, clientes e notas fiscais em um único lugar." },
      { name: "author", content: "Gestão Nobre MKT" },
      { property: "og:title", content: "Gestão Nobre MKT — Gestão de Vendas e Produção" },
      { property: "og:description", content: "Plataforma premium para agências: gestão de vendas, produção, kanban, clientes e notas fiscais em um único lugar." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Gestão Nobre MKT" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Gestão Nobre MKT — Gestão de Vendas e Produção" },
      { name: "twitter:description", content: "Plataforma premium para agências: gestão de vendas, produção, kanban, clientes e notas fiscais em um único lugar." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/IAkaZvFEYXSf0WwJHshXeO14xq23/social-images/social-1780111238311-ChatGPT_Image_30_de_mai._de_2026,_00_20_17.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/IAkaZvFEYXSf0WwJHshXeO14xq23/social-images/social-1780111238311-ChatGPT_Image_30_de_mai._de_2026,_00_20_17.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" translate="no" className="notranslate">
      <head>
        <HeadContent />
      </head>
      <body translate="no" className="notranslate">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <div translate="no" className="notranslate">
        <WhiteLabelProvider />
        <Outlet />
        <Toaster richColors closeButton theme="dark" position="top-right" />
        <UpdateBanner />
      </div>
    </QueryClientProvider>
  );
}
