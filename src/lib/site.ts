import { BrainIcon, ChartNoAxesCombinedIcon, ChartSplineIcon, PlugZapIcon, RocketIcon, SparklesIcon, TrendingUpIcon } from "lucide-react";

export const SITE = {
  name: "Krypton Bot Light",
  description: "Free, open-source, self-hosted Polymarket copy trading. Paper and live, on your own machine.",
};

/** The paid cloud edition. Every locked item in the app links here. */
export const CLOUD_URL = "https://krypton.bot";

export type CloudFeature = { title: string; blurb: string; icon: React.ComponentType<{ className?: string }> };

/** Features that live in the cloud edition. Shown locked in the sidebar and on the Cloud page. */
export const CLOUD_FEATURES: CloudFeature[] = [
  { title: "Markets", blurb: "Browse and trade every prediction market with a live order book.", icon: TrendingUpIcon },
  { title: "Perps", blurb: "Perpetual futures with leverage, stops and take-profit.", icon: ChartNoAxesCombinedIcon },
  { title: "Decision Maker", blurb: "Every bot call logged with its reasoning and scored against what happened.", icon: BrainIcon },
  { title: "Krypton Bot AI", blurb: "An agent that researches markets, finds traders worth copying and explains each pick.", icon: SparklesIcon },
  { title: "Autopilot", blurb: "The bot trades on its own, around the clock, inside your limits.", icon: RocketIcon },
  { title: "MCP", blurb: "Connect Claude, Cursor or any MCP client to your account.", icon: PlugZapIcon },
  { title: "Analytics", blurb: "Performance, win rate and drawdown across everything the bot trades.", icon: ChartSplineIcon },
];
