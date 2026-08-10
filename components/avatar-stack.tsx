import { Avatar } from "@/components/avatar";

export type AvatarStackItem = {
  id: string;
  name: string;
  avatar_url: string | null;
};

export function AvatarStack({
  items,
  size = 24,
  max = 4,
  label,
}: {
  items: AvatarStackItem[];
  size?: number;
  max?: number;
  label?: string;
}) {
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  const title =
    label && items.length
      ? `${label}: ${items.map((i) => i.name).join(", ")}`
      : label;

  return (
    <div
      className="flex items-center"
      title={title}
      aria-label={
        label
          ? `${items.length} ${label}`
          : `${items.length} avatar${items.length === 1 ? "" : "s"}`
      }
    >
      {items.length === 0 ? (
        <span className="muted text-xs tabular-nums">0</span>
      ) : (
        <>
          <div className="flex items-center">
            {shown.map((item, index) => (
              <span
                key={item.id}
                className="relative inline-flex"
                style={{
                  marginLeft: index === 0 ? 0 : -7,
                  zIndex: shown.length - index,
                  boxShadow: "0 0 0 2px var(--presence-ring)",
                  borderRadius: 8,
                }}
              >
                <Avatar src={item.avatar_url} name={item.name} size={size} />
              </span>
            ))}
            {extra > 0 ? (
              <span
                className="muted relative inline-flex items-center justify-center text-[10px] font-semibold"
                style={{
                  width: size,
                  height: size,
                  marginLeft: -7,
                  zIndex: 0,
                  borderRadius: 8,
                  background: "var(--chip-bg)",
                  boxShadow: "0 0 0 2px var(--presence-ring)",
                }}
              >
                +{extra}
              </span>
            ) : null}
          </div>
          <span className="muted ml-1.5 text-xs tabular-nums">{items.length}</span>
        </>
      )}
    </div>
  );
}
