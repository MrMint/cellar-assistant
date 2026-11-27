/**
 * L04 — one recap card as a share image (`next/og`, Satori: inline styles
 * only, every element with more than one child a flex box). The same words as
 * the deck (`recapCardCopy`), at 1080x1350, and no URL anywhere on it (L16).
 *
 * The image leaves the app, so it is one look whatever the app's theme: the
 * Social-Recap board's dark values (LIGHT-social-b ruling 1), read from
 * `lib/tokens.ts` as values, as `og-cards.tsx` does.
 */
import type { RecapPeriod } from "@cellar-assistant/contracts/recap";
import { color } from "@/lib/tokens";
import {
  type RecapCardView,
  recapCardCopy,
  recapMoreText,
  recapPeriodFoot,
  recapPeriodShort,
  recapTotalsLine,
  stampFace,
} from "./recap-copy";
import type { RecapEndView, RecapShareFace } from "./recap-data";

export const RECAP_IMAGE_SIZE = { width: 1080, height: 1350 } as const;

export function RecapShareCard({
  card,
  period,
}: {
  card: RecapShareFace;
  period: RecapPeriod;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: color.bg,
        color: color.ink1,
        padding: "96px 88px 80px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          gap: 40,
        }}
      >
        {card.kind === "END" ? (
          <EndFace card={card} period={period} />
        ) : (
          <CardFace card={card} />
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 34,
          fontWeight: 600,
          color: color.ink2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              width: 44,
              height: 8,
              borderRadius: 4,
              background: color.accent,
            }}
          />
          Cellar Assistant
        </div>
        <div style={{ display: "flex" }}>{recapPeriodFoot(period)}</div>
      </div>
    </div>
  );
}

function Overline({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 36,
        fontWeight: 600,
        color: color.ink2,
      }}
    >
      {text}
    </div>
  );
}

function Title({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: 76,
        lineHeight: 1.15,
        fontWeight: 700,
      }}
    >
      {text.split("\n").map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
}

function CardFace({ card }: { card: RecapCardView }) {
  const copy = recapCardCopy(card);
  const more = recapMoreText(card);
  return (
    <>
      <Overline text={copy.overline} />
      {card.stamp !== null && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "center",
            width: 340,
            height: 340,
            borderRadius: 999,
            border: `10px solid ${color.gold}`,
            transform: "rotate(-8deg)",
          }}
        >
          <div style={{ display: "flex", fontSize: 104, fontWeight: 700 }}>
            {stampFace(card.stamp).count}
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 600 }}>
            {stampFace(card.stamp).noun}
          </div>
        </div>
      )}
      {copy.big !== "" && (
        <div
          style={{
            display: "flex",
            fontSize: 200,
            lineHeight: 1,
            fontWeight: 700,
          }}
        >
          {copy.big}
        </div>
      )}
      <Title text={copy.title} />
      {copy.chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          {copy.chips.slice(0, 10).map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                padding: "16px 28px",
                borderRadius: 16,
                background: color.surface2,
                fontSize: 40,
              }}
            >
              {chip}
            </div>
          ))}
          {more !== "" && (
            <div
              style={{
                display: "flex",
                padding: "16px 8px",
                fontSize: 40,
                color: color.ink2,
              }}
            >
              {more}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function EndFace({
  card,
  period,
}: {
  card: RecapEndView;
  period: RecapPeriod;
}) {
  const totals = recapTotalsLine(card.totals);
  return (
    <>
      <Overline text="The end" />
      <Title text={`That’s your ${recapPeriodShort(period)}`} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
        {card.stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              display: "flex",
              flexDirection: "column",
              width: 440,
              padding: "36px 40px",
              borderRadius: 16,
              border: `2px solid ${color.line}`,
              background: color.surface1,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 120,
                lineHeight: 1,
                fontWeight: 700,
              }}
            >
              {String(stat.value)}
            </div>
            <div style={{ display: "flex", fontSize: 40, color: color.ink2 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      {totals !== "" && (
        <div style={{ display: "flex", fontSize: 40, color: color.ink2 }}>
          {totals}
        </div>
      )}
    </>
  );
}
