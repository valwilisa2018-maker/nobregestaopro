import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clapperboard, Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { OM_MENU } from "@/components/operacao-meta/shared";

export const Route = createFileRoute("/_authenticated/operacao-meta")({
  component: OperacaoMetaLayout,
});

function OperacaoMetaLayout() {
  const { theme, setTheme, toggle } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("om-theme-touched")) {
      setTheme("dark");
      localStorage.setItem("om-theme-touched", "1");
    }
  }, [setTheme]);

  return (
    <div className={`space-y-4 -m-4 sm:-m-6 p-4 sm:p-6 min-h-screen ${theme === "dark" ? "om-dark-bg" : "om-light-bg"}`}>
      {theme === "dark" && (
        <style>{`
          .om-dark-bg {
            background:
              radial-gradient(1200px 600px at 0% 0%, rgba(239,68,68,0.25), transparent 60%),
              radial-gradient(900px 500px at 100% 10%, rgba(190,18,60,0.22), transparent 65%),
              radial-gradient(1000px 700px at 50% 100%, rgba(120,15,30,0.35), transparent 60%),
              linear-gradient(180deg, #1a0608 0%, #0c0203 100%);
          }
          .om-dark-bg [data-slot="card"], .om-dark-bg .om-card, .om-dark-bg [class*="border-border"] {
            background: linear-gradient(160deg, rgba(40,10,15,0.85), rgba(20,5,8,0.85));
            border-color: rgba(239,68,68,0.25) !important;
            box-shadow: 0 10px 30px -10px rgba(0,0,0,0.6), 0 0 0 1px rgba(239,68,68,0.08), inset 0 1px 0 rgba(255,255,255,0.04) !important;
            backdrop-filter: blur(8px);
          }
          .om-dark-bg [data-slot="card"]:hover {
            border-color: rgba(239,68,68,0.5) !important;
            box-shadow: 0 16px 40px -12px rgba(239,68,68,0.35), 0 0 0 1px rgba(239,68,68,0.2) !important;
          }
        `}</style>
      )}
      {theme !== "dark" && (
        <style>{`
          .om-light-bg {
            background:
              radial-gradient(1000px 500px at 0% 0%, rgba(239,68,68,0.08), transparent 60%),
              radial-gradient(800px 400px at 100% 10%, rgba(190,18,60,0.06), transparent 65%),
              linear-gradient(180deg, #f7f5f3 0%, #ececec 100%);
          }
          .om-light-bg [data-slot="card"], .om-light-bg .om-card, .om-light-bg [class*="border-border"] {
            background: linear-gradient(160deg, #ffffff, #fafafa) !important;
            border-color: rgba(15,15,15,0.12) !important;
            box-shadow: 0 14px 36px -16px rgba(15,15,15,0.25), 0 2px 6px -2px rgba(15,15,15,0.08), 0 0 0 1px rgba(239,68,68,0.06) !important;
          }
          .om-light-bg [data-slot="card"]:hover {
            border-color: rgba(239,68,68,0.4) !important;
            box-shadow: 0 20px 44px -16px rgba(239,68,68,0.25), 0 4px 10px -2px rgba(15,15,15,0.12), 0 0 0 1px rgba(239,68,68,0.2) !important;
            transform: translateY(-1px);
            transition: all .2s ease;
          }
        `}</style>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Clapperboard className="w-7 h-7 text-primary" /> Operação Metas
          </h1>
          <p className="text-muted-foreground text-sm">Painel premium de pontuação por produtor</p>
        </div>
        <Button variant="outline" size="sm" onClick={toggle} className="gap-2">
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </Button>
      </div>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-2">
          <nav className="flex flex-row flex-wrap gap-1 overflow-x-auto">
            {OM_MENU.map((m) => {
              const Icon = m.icon;
              const isActive = pathname === m.path || (pathname === "/operacao-meta" && m.key === "diaria");
              return (
                <Link
                  key={m.key}
                  to={m.path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{m.label}</span>
                </Link>
              );
            })}
          </nav>
        </CardContent>
      </Card>

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}