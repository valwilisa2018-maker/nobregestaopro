import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, isSuperAdmin } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();
  const { loading, session, roles } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (isSuperAdmin(roles)) {
      navigate({ to: "/master", replace: true });
    } else {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, session, roles, navigate]);

  return null;
}
