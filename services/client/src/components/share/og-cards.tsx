import type { ReactNode } from "react";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { BAND_LABELS } from "@/components/tier-list/constants";
import { bandColor, color, itemTypeColor } from "@/lib/tokens";

/**
 * The link-preview cards (X17, `next/og`): what a chat app shows when a
 * share link is pasted. Satori renders these — a subset of CSS, inline
 * styles only, every element with more than one child a flex box — so the
 * colours are read from `lib/tokens.ts` as values, never written here.
 *
 * Dark, like the app (D21): the name large, one brass rule as the signature,
 * and for a tier list the top three in their band colours. A card is built
 * only from the shared (public, anonymous) read; a missing or private thing
 * gets the plain brand card, the same either way.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

const ellipsis = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

function Frame({
  overline,
  children,
  image,
}: {
  overline: string;
  children: ReactNode;
  image?: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: color.bg,
        color: color.ink1,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "64px 72px",
          gap: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 24,
            letterSpacing: 4,
            color: color.ink3,
            textTransform: "uppercase",
          }}
        >
          {overline}
        </div>
        {children}
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              width: 64,
              height: 6,
              borderRadius: 3,
              background: color.accent,
            }}
          />
          <div style={{ display: "flex", fontSize: 28, color: color.ink2 }}>
            Cellar Assistant
          </div>
        </div>
      </div>
      {image ? (
        <div
          style={{
            display: "flex",
            width: 420,
            height: "100%",
            background: color.surface1,
          }}
        >
          {/* biome-ignore lint/performance/noImgElement: satori renders plain img only. */}
          <img
            src={image}
            alt=""
            width={420}
            height={630}
            style={{ width: 420, height: 630, objectFit: "cover" }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Title({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: children.length > 40 ? 56 : 72,
        lineHeight: 1.1,
        fontWeight: 600,
        color: color.ink1,
      }}
    >
      {ellipsis(children, 80)}
    </div>
  );
}

function Line({ children }: { children: string }) {
  return (
    <div style={{ display: "flex", fontSize: 32, color: color.ink2 }}>
      {ellipsis(children, 90)}
    </div>
  );
}

export function TierListCard({
  name,
  ownerDisplayName,
  top,
}: {
  name: string;
  ownerDisplayName: string | null;
  top: readonly { rank: number | null; band: number; name: string | null }[];
}) {
  return (
    <Frame overline="A ranked list">
      <Title>{name}</Title>
      {ownerDisplayName !== null && <Line>{`by ${ownerDisplayName}`}</Line>}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          marginTop: 12,
        }}
      >
        {top.map((entry) => (
          <div
            key={`${entry.rank}`}
            style={{ display: "flex", alignItems: "center", gap: 18 }}
          >
            <div
              style={{
                display: "flex",
                width: 56,
                fontSize: 36,
                color: entry.rank === 1 ? color.brandInk : color.ink3,
              }}
            >
              {`#${entry.rank ?? ""}`}
            </div>
            <div
              style={{
                display: "flex",
                width: 14,
                height: 14,
                borderRadius: 7,
                background:
                  bandColor[entry.band as 1 | 2 | 3 | 4 | 5] ?? color.surface3,
              }}
            />
            <div style={{ display: "flex", fontSize: 34, color: color.ink1 }}>
              {ellipsis(entry.name ?? "", 42)}
            </div>
            <div style={{ display: "flex", fontSize: 24, color: color.ink3 }}>
              {BAND_LABELS[entry.band] ?? ""}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function ItemCard({
  type,
  typeLabel,
  name,
  subtitle,
  scoreAverage,
  scoreCount,
  image,
}: {
  type: ApiItemType;
  typeLabel: string;
  name: string;
  subtitle: string;
  scoreAverage: number | null;
  scoreCount: number;
  image: string | null;
}) {
  return (
    <Frame overline={typeLabel} image={image}>
      <div
        style={{
          display: "flex",
          width: 72,
          height: 6,
          borderRadius: 3,
          background: itemTypeColor[type].deep,
        }}
      />
      <Title>{name}</Title>
      {subtitle !== "" && <Line>{subtitle}</Line>}
      {scoreAverage !== null && scoreCount > 0 && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <div style={{ display: "flex", fontSize: 64, color: color.ink1 }}>
            {`${Math.round(scoreAverage * 10) / 10}`}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: color.ink3 }}>
            {`out of 5 · ${scoreCount} ${scoreCount === 1 ? "rating" : "ratings"}`}
          </div>
        </div>
      )}
    </Frame>
  );
}

export function RecipeCard({
  name,
  facts,
  ingredients,
}: {
  name: string;
  facts: string;
  ingredients: readonly string[];
}) {
  return (
    <Frame overline={facts === "" ? "A recipe" : facts}>
      <Title>{name}</Title>
      {ingredients.length > 0 && (
        <Line>{ingredients.slice(0, 5).join(" · ")}</Line>
      )}
    </Frame>
  );
}

/** For anything missing or not public: the brand, and nothing about it. */
export function BrandCard() {
  return (
    <Frame overline="Shared from">
      <Title>Cellar Assistant</Title>
      <Line>Your cellar, your rankings, your friends' picks.</Line>
    </Frame>
  );
}

/**
 * A public photo, inlined for satori: fetched here with a short timeout so a
 * slow or failed file host costs the card its photo, never the card. PNG and
 * JPEG only — what satori decodes — and nothing over 4 MB.
 */
export const inlineImage = async (
  url: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> => {
  if (url === null) return null;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type")?.split(";")[0]?.trim();
    if (type !== "image/png" && type !== "image/jpeg") return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 4 * 1024 * 1024) {
      return null;
    }
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
};
