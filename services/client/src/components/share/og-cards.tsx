import { BookOpen, List, MapPin, Martini } from "lucide-react";
import type { ReactNode } from "react";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { kindNoun, rankedKind } from "@/components/tier-list/lists/model";
import { bandColor, color } from "@/lib/tokens";

/**
 * The link-preview cards (X17, `next/og`): what a chat app shows when a
 * share link is pasted. Satori renders these (a subset of CSS, inline
 * styles only, every element with more than one child a flex box), so the
 * colours are read from `lib/tokens.ts` as values, never written here.
 *
 * Always the dark look (Social-Lists share sheet's link preview, drawn
 * `.keep-dark`; LIGHT-social-b): a small overline, the name, one byline,
 * up to three lines (a list's top three with their band dots), the act-teal
 * rule and the name of the app at the foot; the photo, or a plate, in the
 * right 40 %. A card is built only from the shared (public, anonymous)
 * read; a missing or private thing gets the plain brand card, the same
 * either way.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** The board draws the card 358 px wide; this is that card at 1200. */
const PANEL = 480;

const ellipsis = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

function Plate({ glyph, label }: { glyph: ReactNode; label?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        width: label === undefined ? "40%" : "76%",
        height: label === undefined ? "40%" : "64%",
        borderRadius: 24,
        background: label === undefined ? "transparent" : color.surface1,
        border: label === undefined ? "none" : `3px solid ${color.line}`,
        padding: 24,
      }}
    >
      {glyph}
      {label !== undefined && (
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 600,
            color: color.ink2,
            textAlign: "center",
          }}
        >
          {ellipsis(label, 60)}
        </div>
      )}
    </div>
  );
}

const glyphStyle = (size: number) => ({ width: size, height: size });

function Frame({
  overline,
  title,
  byline,
  lines,
  image,
  plate,
}: {
  overline: string;
  title: string;
  byline?: string;
  lines?: readonly { text: string; dot?: string }[];
  image?: string | null;
  /** Drawn in the panel when there is no photo. */
  plate: ReactNode;
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
          padding: "56px 40px 44px 64px",
          gap: 12,
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 36,
            fontWeight: 600,
            color: color.ink2,
          }}
        >
          {overline}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: title.length > 32 ? 56 : 68,
            lineHeight: 1.15,
            fontWeight: 600,
            color: color.ink1,
          }}
        >
          {ellipsis(title, 64)}
        </div>
        {byline !== undefined && byline !== "" && (
          <div style={{ display: "flex", fontSize: 40, color: color.ink2 }}>
            {ellipsis(byline, 40)}
          </div>
        )}
        {lines !== undefined && lines.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 10,
            }}
          >
            {lines.map((line) => (
              <div
                key={line.text}
                style={{ display: "flex", alignItems: "center", gap: 18 }}
              >
                {line.dot !== undefined && (
                  <div
                    style={{
                      display: "flex",
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      background: line.dot,
                    }}
                  />
                )}
                <div
                  style={{ display: "flex", fontSize: 40, color: color.ink1 }}
                >
                  {ellipsis(line.text, 34)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              width: 48,
              height: 10,
              borderRadius: 6,
              background: color.accent,
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: 36,
              fontWeight: 600,
              color: color.ink2,
            }}
          >
            Cellar Assistant
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          width: PANEL,
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: color.surface2,
        }}
      >
        {image ? (
          // biome-ignore lint/performance/noImgElement: satori renders plain img only.
          <img
            src={image}
            alt=""
            width={PANEL}
            height={OG_SIZE.height}
            style={{ width: PANEL, height: OG_SIZE.height, objectFit: "cover" }}
          />
        ) : (
          plate
        )}
      </div>
    </div>
  );
}

export function TierListCard({
  name,
  listType,
  itemCount,
  ownerDisplayName,
  top,
}: {
  name: string;
  listType: string;
  itemCount: number;
  ownerDisplayName: string | null;
  top: readonly { rank: number | null; band: number; name: string | null }[];
}) {
  const count = kindNoun(listType, itemCount);
  const Glyph = listType.toLowerCase() === "place" ? MapPin : List;
  return (
    <Frame
      overline={rankedKind(listType)}
      title={name}
      byline={
        ownerDisplayName === null ? count : `by ${ownerDisplayName} · ${count}`
      }
      lines={top.map((entry) => ({
        text: `#${entry.rank ?? ""} ${entry.name ?? ""}`,
        dot: bandColor[entry.band as 1 | 2 | 3 | 4 | 5] ?? color.surface3,
      }))}
      plate={
        <Plate
          glyph={
            <Glyph
              color={color.glyph}
              strokeWidth={1.25}
              style={glyphStyle(190)}
            />
          }
        />
      }
    />
  );
}

export function ItemCard({
  typeLabel,
  name,
  subtitle,
  style,
  scoreAverage,
  scoreCount,
  image,
}: {
  type: ApiItemType;
  typeLabel: string;
  name: string;
  subtitle: string;
  /** The style's first segment, a line of its own. */
  style?: string;
  scoreAverage: number | null;
  scoreCount: number;
  image: string | null;
}) {
  const lines: { text: string }[] = [];
  if (style !== undefined && style !== "") lines.push({ text: style });
  if (scoreAverage !== null && scoreCount > 0) {
    lines.push({
      text: `${Math.round(scoreAverage * 10) / 10} (${scoreCount})`,
    });
  }
  return (
    <Frame
      overline={typeLabel}
      title={name}
      byline={subtitle}
      lines={lines}
      image={image}
      plate={
        <Plate
          label={name}
          glyph={
            <Martini
              color={color.glyph}
              strokeWidth={1.25}
              style={glyphStyle(96)}
            />
          }
        />
      }
    />
  );
}

export function RecipeCard({
  kind,
  name,
  facts,
  blurb,
}: {
  /** "Cocktail", "Food". */
  kind: string;
  name: string;
  /** "5 min · Easy". */
  facts: string;
  blurb: string | null;
}) {
  return (
    <Frame
      overline={kind}
      title={name}
      byline={facts}
      lines={
        blurb === null || blurb.trim() === "" ? [] : [{ text: blurb.trim() }]
      }
      plate={
        <Plate
          label={name}
          glyph={
            <BookOpen
              color={color.glyph}
              strokeWidth={1.25}
              style={glyphStyle(96)}
            />
          }
        />
      }
    />
  );
}

/** For anything missing or not public: the brand, and nothing about it. */
export function BrandCard() {
  return (
    <Frame
      overline="Shared from"
      title="Cellar Assistant"
      byline="Your cellar, your rankings, your friends' picks."
      plate={
        <Plate
          glyph={
            <List
              color={color.glyph}
              strokeWidth={1.25}
              style={glyphStyle(190)}
            />
          }
        />
      }
    />
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
