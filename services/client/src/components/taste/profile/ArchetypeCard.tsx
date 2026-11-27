/**
 * The top of `/taste-profile` (Social-Recap board 19 and taste-locked): your
 * archetype in a card, or, until there are enough ratings to name one, the
 * locked card with its meter and one way forward.
 *
 * The archetype is deterministic; the line under it is the server's plain
 * sentence unless a model phrased it, and only then does it say so (L4).
 */
import { ARCHETYPE_MIN_RATINGS } from "@cellar-assistant/contracts/taste";
import { AI, Category, ICON_STROKE } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { buttonVariants } from "@/components/ui/button-variants";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { archetypeMeter, ratingsLine } from "../taste-lines";

export type ArchetypeCardProfile = {
  readonly ratingCount: number;
  readonly kinds: number;
  readonly line: string;
  readonly linePhrasedByAi: boolean;
  readonly title: string | null;
};

function Disc() {
  return (
    <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-raised">
      <Category
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-7 text-glyph"
      />
    </span>
  );
}

export function ArchetypeCard({ profile }: { profile: ArchetypeCardProfile }) {
  if (profile.title === null) return <LockedArchetype profile={profile} />;
  return (
    <section
      data-slot="taste-archetype"
      className="flex flex-col gap-3 rounded-md border border-edge bg-card p-4"
    >
      <div className="flex items-center gap-4">
        <Disc />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="t-cap text-ink-2">Your archetype</span>
          {/* AppBar's "Taste profile" is the page's one h1 (CR-13). */}
          <h2 className="t-title text-ink-1">{profile.title}</h2>
          <span className="t-cap tabular text-ink-2">
            {ratingsLine(profile.ratingCount, profile.kinds)}
          </span>
        </div>
      </div>
      {profile.line !== "" && (
        <p className="t-body flex items-start gap-2 text-ink-2">
          {profile.linePhrasedByAi && (
            <AI
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="mt-0.5 size-4 shrink-0 text-act-ink"
            />
          )}
          <span>
            {profile.line}
            {profile.linePhrasedByAi && (
              <span className="text-ink-2"> Phrased by AI.</span>
            )}
          </span>
        </p>
      )}
    </section>
  );
}

/** Too few ratings to name one: the meter, and Find drinks (the primary). */
function LockedArchetype({ profile }: { profile: ArchetypeCardProfile }) {
  const short = profile.ratingCount < ARCHETYPE_MIN_RATINGS;
  const meter = archetypeMeter(profile.ratingCount, ARCHETYPE_MIN_RATINGS);
  return (
    <section
      data-slot="taste-locked"
      className="flex flex-col items-center gap-3 rounded-md border border-edge bg-card p-4 pt-6 text-center"
    >
      <Disc />
      <span className="t-cap text-ink-2">Your archetype</span>
      <h2 className="t-head text-ink-1">
        {short
          ? `Rate ${ARCHETYPE_MIN_RATINGS} drinks to see yours`
          : "Not enough to go on yet"}
      </h2>
      {short && (
        <>
          <div
            role="img"
            aria-label={`${meter.line} rated`}
            className="flex w-full gap-1.5"
          >
            {meter.cells.map((lit, k) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: cells are positions
                key={k}
                className={cn(
                  "h-2.5 flex-1 rounded-sm",
                  lit ? "bg-act" : "border border-dash border-dashed",
                )}
              />
            ))}
          </div>
          <span className="t-cap tabular text-ink-2">{meter.line}</span>
          <Link
            href="/search"
            underline="none"
            onPointerDown={() => feedback("primary", { phase: "down" })}
            onPointerUp={() => feedback("primary", { phase: "up" })}
            className={cn(buttonVariants(), "t-head mt-1 w-full")}
          >
            Find drinks
          </Link>
        </>
      )}
      {!short && profile.line !== "" && (
        <p className="t-body text-ink-2">{profile.line}</p>
      )}
    </section>
  );
}
