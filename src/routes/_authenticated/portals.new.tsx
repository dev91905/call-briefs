import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/portals/new")({
  beforeLoad: () => {
    throw redirect({ to: "/clients" });
  },
});