import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { getGraph } from "@/lib/people.functions";

export const Route = createFileRoute("/_authenticated/portals/$portalId/map")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["graph", params.portalId],
      queryFn: () => getGraph({ data: { portalId: params.portalId } }),
    }),
  component: MapPage,
});

const ForceGraph2D = lazy(() => import("react-force-graph-2d").then((m) => ({ default: m.default })));
const parentApi = getRouteApi("/_authenticated/portals/$portalId");

function MapPage() {
  const { portalId } = parentApi.useParams();
  const { data } = useSuspenseQuery({
    queryKey: ["graph", portalId],
    queryFn: () => getGraph({ data: { portalId } }),
  });

  if (data.nodes.length === 0) {
    return <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>No people in the network yet.</p>;
  }

  return (
    <div
      style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", background: "#0a0a0a", height: 600 }}
    >
      <Suspense fallback={<div className="p-6 text-[12px]" style={{ color: "var(--text-faint)" }}>Loading graph…</div>}>
        
        <ForceGraph2D
          graphData={{ nodes: data.nodes.map((n: any) => ({ ...n })), links: data.links.map((l: any) => ({ ...l })) }}
          backgroundColor="#0a0a0a"
          nodeLabel={(n: any) => `${n.name}${n.org ? ` · ${n.org}` : ""}`}
          nodeVal={(n: any) => Math.max(1, n.weight)}
          nodeColor={() => "#e5e5e5"}
          linkColor={(l: any) => (l.kind === "rel" ? "#888" : "#333")}
          linkWidth={(l: any) => (l.kind === "rel" ? 1.5 : 0.5)}
          nodeCanvasObject={(node: any, ctx: any, scale: number) => {
            const label = node.name;
            const r = Math.max(3, 3 + (node.weight ?? 0));
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = "#e5e5e5";
            ctx.fill();
            ctx.font = `${12 / scale}px sans-serif`;
            ctx.fillStyle = "#999";
            ctx.fillText(label, node.x + r + 2, node.y + 4 / scale);
          }}
        />
      </Suspense>
    </div>
  );
}
