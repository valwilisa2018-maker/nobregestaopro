import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/ai")({
  beforeLoad: () => { throw redirect({ to: "/admin-settings" }); },
  component: () => null,
});
