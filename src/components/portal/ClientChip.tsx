function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function ClientChip({ name, id }: { name: string; id?: string }) {
  const hue = hashHue(id || name);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{
        background: `hsla(${hue}, 30%, 60%, 0.12)`,
        color: `hsla(${hue}, 40%, 78%, 1)`,
        border: `1px solid hsla(${hue}, 35%, 55%, 0.22)`,
      }}
    >
      {name}
    </span>
  );
}
