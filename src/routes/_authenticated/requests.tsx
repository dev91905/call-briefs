import { createFileRoute, redirect } from "@tanstack/react-router";
import { listMyPortals } from "@/lib/portals.functions";

export const Route = createFileRoute("/_authenticated/requests")({
  loader: async () => {
    const portals = await listMyPortals();
    if (portals.length > 0) {
      throw redirect({ to: "/portals/$portalId/requests", params: { portalId: portals[0].id } });
    }

    throw redirect({ to: "/" });
  },
  component: () => null,
  errorComponent: () => null,
  notFoundComponent: () => null,
});