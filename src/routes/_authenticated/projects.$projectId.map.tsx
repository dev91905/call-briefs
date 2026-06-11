import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3-force";
import { getProjectGraph } from "@/lib/graph.functions";
import { listProjectTags } from "@/lib/tags.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/map")({
  component: MapTab,
});

type Range = "all" | "90d" | "30d";

function MapTab() {
  const { projectId } = Route.useParams();
  const router = useRouter();
  const [tagId, setTagId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("all");

  const tags = useQuery({
    queryKey: ["project-tags", projectId],
    queryFn: () => listProjectTags({ data: { projectId } }),
  });
  const graph = useQuery({
    queryKey: ["project-graph", projectId, tagId, range],
    queryFn: () => getProjectGraph({ data: { projectId, tagId, range } }),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-3">
        <select
          value={tagId ?? ""}
          onChange={(e) => setTagId(e.target.value || null)}
          className="rounded-md px-2 py-1 text-[12px]"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          <option value="">All tags</option>
          {(tags.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as Range)}
          className="rounded-md px-2 py-1 text-[12px]"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          <option value="all">All time</option>
          <option value="90d">Last 90 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      {graph.isLoading ? (
        <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Loading…</p>
      ) : (graph.data?.nodes.length ?? 0) === 0 ? (
        <div className="rounded-xl p-16 text-center" style={{ background: "var(--surface)" }}>
          <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
            The map draws itself as intelligence accumulates.
          </p>
        </div>
      ) : (
        <ForceGraph
          nodes={graph.data!.nodes}
          edges={graph.data!.edges}
          onNodeClick={(id) =>
            router.navigate({ to: "/projects/$projectId/people/$personId", params: { projectId, personId: id } })
          }
        />
      )}
    </div>
  );
}

type N = { id: string; fullName: string; initials: string; mentionOnly: boolean; x?: number; y?: number; fx?: number | null; fy?: number | null };
type E = { source: string | N; target: string | N; weight: number; mentionOnly: boolean };

function ForceGraph({
  nodes,
  edges,
  onNodeClick,
}: {
  nodes: { id: string; fullName: string; initials: string; mentionOnly: boolean }[];
  edges: { source: string; target: string; weight: number; mentionOnly: boolean }[];
  onNodeClick: (id: string) => void;
}) {
  const width = 880;
  const height = 560;
  const [, setTick] = useState(0);
  const dataRef = useRef<{ nodes: N[]; edges: E[] }>({ nodes: [], edges: [] });
  const [hovered, setHovered] = useState<string | null>(null);

  // Memoize node degree for label visibility
  const topIds = useMemo(() => {
    const deg = new Map<string, number>();
    edges.forEach((e) => {
      deg.set(e.source, (deg.get(e.source) ?? 0) + e.weight);
      deg.set(e.target, (deg.get(e.target) ?? 0) + e.weight);
    });
    return new Set(
      [...deg.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.min(6, nodes.length))
        .map(([id]) => id),
    );
  }, [nodes, edges]);

  useEffect(() => {
    const ns: N[] = nodes.map((n) => ({ ...n }));
    const es: E[] = edges.map((e) => ({ ...e }));
    dataRef.current = { nodes: ns, edges: es };
    const sim = d3
      .forceSimulation<N>(ns)
      .force("link", d3.forceLink<N, E>(es).id((d) => d.id).distance(80).strength((l) => Math.min(1, l.weight / 3)))
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(28))
      .on("tick", () => setTick((t) => t + 1));
    return () => {
      sim.stop();
    };
  }, [nodes, edges]);

  const { nodes: ns, edges: es } = dataRef.current;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        {es.map((e, i) => {
          const s = e.source as N;
          const t = e.target as N;
          if (!s || !t || s.x == null || t.x == null) return null;
          const sw = Math.min(3, 1 + e.weight * 0.5);
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="var(--text-faint)"
              strokeOpacity={0.6}
              strokeWidth={sw}
              strokeDasharray={e.mentionOnly ? "4 3" : undefined}
            />
          );
        })}
        {ns.map((n) => {
          if (n.x == null) return null;
          const showLabel = hovered === n.id || topIds.has(n.id);
          return (
            <g key={n.id} transform={`translate(${n.x}, ${n.y})`} style={{ cursor: "pointer" }}
              onClick={() => onNodeClick(n.id)}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                r={16}
                fill="var(--surface-raised)"
                stroke="var(--text)"
                strokeWidth={n.mentionOnly ? 1 : 1.5}
                strokeDasharray={n.mentionOnly ? "3 2" : undefined}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fill="var(--text)"
              >
                {n.initials}
              </text>
              {showLabel && (
                <text
                  x={0}
                  y={30}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--text-muted)"
                >
                  {n.fullName}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
