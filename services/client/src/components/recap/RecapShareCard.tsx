/**
 * L04 — one recap card as a share image (`next/og`, Satori: inline styles
 * only, every element with more than one child a flex box). The same words as
 * the deck (`recapCardCopy`), at 1080x1350, and no URL anywhere on it (L16).
 * Colours are read from `lib/tokens.ts` as values, as `og-cards.tsx` does.
 */
import type { RecapPeriod } from "@cellar-assistant/contracts/recap";
import { color } from "@/lib/tokens";
import {
  type RecapCardView,
  type RecapTone,
  recapCardCopy,
  recapPeriodLabel,
  stampFace,
} from "./recap-copy";

export const RECAP_IMAGE_SIZE = { width: 1080, height: 1350 } as const;

/**
 * The claret wash is the board's `--ca-brand` over `--ca-bg`: here a brand
 * layer at 22% over the plain background (Satori has no `color-mix`).
 */
const TONE_BG: Readonly<Record<RecapTone, string>> = {
  plain: color.bg,
  claret: color.bg,
  raised: color.surface1,
};
const CLARET_OPACITY = 0.22;

export function RecapShareCard({
  card,
  period,
}: {
  card: RecapCardView;
  period: RecapPeriod;
}) {
  const copy = recapCardCopy(card);
  const accent = copy.accent === "claret" ? color.brandInk : color.accent;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: TONE_BG[copy.tone],
        color: color.ink1,
        padding: "120px 96px 96px",
        position: "relative",
      }}
    >
      {copy.tone === "claret" && (
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: color.brand,
            opacity: CLARET_OPACITY,
          }}
        />
      )}
      <div style={{ display: "flex", fontSize: 36, color: color.ink2 }}>
        {recapPeriodLabel(period)}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          gap: 36,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {copy.overline}
        </div>
        {copy.big !== "" && (
          <div style={{ display: "flex", fontSize: 240, lineHeight: 1 }}>
            {copy.big}
          </div>
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 76,
            lineHeight: 1.2,
            fontWeight: 600,
          }}
        >
          {copy.title.split("\n").map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        {copy.chips.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {copy.chips.map((chip) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  padding: "16px 32px",
                  borderRadius: 999,
                  background: color.line,
                  fontSize: 40,
                }}
              >
                {chip}
              </div>
            ))}
          </div>
        )}
        {card.stamp !== null && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 360,
              height: 360,
              borderRadius: 999,
              border: `8px solid ${color.accent}`,
              color: color.accent,
              transform: "rotate(-8deg)",
            }}
          >
            <div style={{ display: "flex", fontSize: 96 }}>
              {stampFace(card.stamp).count}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: "uppercase",
                textAlign: "center",
              }}
            >
              {stampFace(card.stamp).noun}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", fontSize: 30, color: color.ink3 }}>
        Cellar Assistant
      </div>
    </div>
  );
}
