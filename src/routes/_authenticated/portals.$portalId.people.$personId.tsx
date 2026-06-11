import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/portals/$portalId/people/$personId")({
  beforeLoad: () => {
    throw redirect({ to: "/clients" });
  },
});