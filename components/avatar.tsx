type AvatarProps = {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  /** Pass `null` to suppress the native tooltip (e.g. when a hover card is used). */
  title?: string | null;
};

/** Slack-style circular avatar with a default user silhouette. */
export function Avatar({
  src,
  name,
  size = 36,
  className = "",
  title,
}: AvatarProps) {
  const label = name ? `${name} avatar` : "User avatar";
  const tooltip = title === null ? undefined : title === undefined ? name || undefined : title;

  return (
    <span
      className={`avatar ${className}`.trim()}
      style={{ width: size, height: size }}
      title={tooltip}
      aria-label={label}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} width={size} height={size} />
      ) : (
        <DefaultUserIcon />
      )}
    </span>
  );
}

function DefaultUserIcon() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="avatar-fallback">
      <circle cx="20" cy="20" r="20" fill="currentColor" opacity="0.12" />
      <circle cx="20" cy="15" r="7" fill="currentColor" opacity="0.45" />
      <path
        d="M6 34.5c2.8-7.2 8.2-10.5 14-10.5s11.2 3.3 14 10.5"
        fill="currentColor"
        opacity="0.45"
      />
    </svg>
  );
}
