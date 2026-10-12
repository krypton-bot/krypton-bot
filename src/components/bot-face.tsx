type Props = {
  className?: string;
  /** Eyes scan and blink (globals.css). Off renders the static mark. */
  animated?: boolean;
  /** Bot is busy: faster scan and a glow pulse. */
  active?: boolean;
  title?: string;
};

/**
 * Krypton Bot mark (option B, owner pick): a square-cut kryptonite diamond with two sharp eyes.
 * Used wherever the bot acts (logo, buttons, agent, chart markers). Pure SVG, safe in server trees.
 */
export function BotFace({ className = "size-6", animated = true, active = false, title }: Props) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={`bot-face ${animated ? "bot-animated" : ""} ${active ? "bot-active" : ""} ${className}`}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path d="M20 1 39 20 20 39 1 20Z" className="bot-body fill-brand" />
      <path className="bot-shade" d="M20 1 39 20H1Z" fill="#fff" opacity=".28" />
      <path className="bot-shade" d="M20 20h19L20 39Z" fill="#000" opacity=".18" />
      <g className="bot-eyes">
        <rect className="bot-eye" x="12.5" y="17" width="4" height="6" rx="1" fill="#0a0c08" />
        <rect className="bot-eye" x="23.5" y="17" width="4" height="6" rx="1" fill="#0a0c08" />
      </g>
    </svg>
  );
}
