import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/published")({
  loader: async () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
  errorComponent: () => null,
  notFoundComponent: () => null,
});