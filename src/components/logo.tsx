import Link from "next/link";
import { BotFace } from "@/components/bot-face";

const WORD = "Krypton";

/** Any word with the logo's letter drop-in and shine (plays once per mount). Spaces keep their width. */
export function AnimatedWord({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`logo-word relative inline-block whitespace-nowrap ${className}`} data-text={text}>
      <span className="sr-only">{text}</span>
      {[...text].map((ch, i) => (
        <span key={i} className="logo-letter inline-block" style={{ "--i": i } as React.CSSProperties} aria-hidden>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}

/**
 * Krypton mark: the crowned Krypton Bot face (eyes keep moving).
 * Letter entrance animation (globals.css) plays once per page load.
 */
export function Logo({ className = "", tagline = true }: { className?: string; tagline?: boolean }) {
  return (
    <Link href="/dashboard" className={`logo group flex items-center gap-2 font-semibold tracking-tight ${className}`} aria-label="Krypton Bot Light home">
      <span className="logo-mark inline-flex transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
        <BotFace className="size-8" />
      </span>
      <span className="flex flex-col leading-none">
      <span className="logo-word relative text-lg whitespace-nowrap" data-text={`${WORD}.bot`} aria-hidden>
        {[...WORD].map((ch, i) => (
          <span key={i} className="logo-letter inline-block" style={{ "--i": i } as React.CSSProperties}>
            {ch}
          </span>
        ))}
        <span className="logo-letter logo-tld inline-block text-brand" style={{ "--i": WORD.length + 1 } as React.CSSProperties}>
          .bot
        </span>
      </span>
      {tagline && <span className="mt-0.5 hidden text-[10px] font-medium tracking-wide whitespace-nowrap text-muted-foreground sm:block">Copy trading, free</span>}
      </span>
    </Link>
  );
}
