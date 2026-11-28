"use client";

import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SearchField } from "../../shell/SearchField";
import { AIDraftField } from "../AIDraftField";
import { EmptyState, ErrorState } from "../EmptyState";
import { FilterChip } from "../FilterChip";
import {
  Add,
  Back,
  Camera,
  Check,
  Comment,
  More,
  NoResults,
  Offline,
  Refresh,
  Settings,
  Star,
} from "../icons";
import { LabelPlate } from "../LabelPlate";
import { HERO_DISC, InsetSection, ListRow, PageHero } from "../Page";
import { ActivityItem, ActivityName } from "../parts/ActivityItem";
import { BandSheet } from "../parts/BandSheet";
import { CellarTile } from "../parts/CellarTile";
import { Histogram, TrendChart } from "../parts/Chart";
import { CountFilters, CountStrip } from "../parts/CountStrip";
import { FormField, NumberField, PickerButton } from "../parts/Field";
import {
  BeerGlyph,
  CoffeeGlyph,
  OpenBottleGlyph,
  WineGlyph,
} from "../parts/glyphs";
import { Heart } from "../parts/Heart";
import { HistoryList, HistoryRow } from "../parts/HistoryRow";
import { PersonRow } from "../parts/PersonRow";
import { PlaceRow } from "../parts/PlaceRow";
import { type Band, BandBar, RankChip } from "../parts/Rank";
import { Scrubber } from "../parts/Scrubber";
import { PublicRating, Stars } from "../parts/Stars";
import { StatGrid, StatTile } from "../parts/StatTile";
import { RatingInput } from "../RatingInput";
import { Score } from "../Score";
import { SegmentedControl } from "../SegmentedControl";
import { SortChip } from "../SortChip";
import { TypeChip } from "../TypeChip";
import { UserAvatar } from "../UserAvatar";

/*
 * Every name, place and number here is demo-seed data
 * (services/actors/scripts/demo-seed-data.ts), never a real cellar.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="t-title m-0 text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="t-micro m-0 text-ink-3">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const SORTS = [
  { value: "name", label: "Name A to Z", short: "A–Z" },
  { value: "maker", label: "By maker", short: "Maker" },
  { value: "style", label: "By style", short: "Style" },
  { value: "newest", label: "Newest first", short: "Newest", groupStart: true },
  { value: "best", label: "My rating best first", short: "Best" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

type Kind = "open" | "beer" | "wine" | "spirit" | "coffee" | "tea";

const SCRUB = [
  { band: 5, count: 4 },
  { band: 4, count: 9 },
  { band: 3, count: 7 },
  { band: 2, count: 3 },
  { band: 1, count: 1 },
] as const satisfies readonly { band: Band; count: number }[];

export function PartsGallery() {
  const [sort, setSort] = useState<Sort>("name");
  const [kind, setKind] = useState<Kind | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [on, setOn] = useState(true);
  const [rating, setRating] = useState<number | null>(4);
  const [loved, setLoved] = useState(false);
  const [lovedPage, setLovedPage] = useState(true);
  const [chip, setChip] = useState(true);
  const [abv, setAbv] = useState("6,2");
  const [sheet, setSheet] = useState(false);
  const [band, setBand] = useState<Band>(4);
  const [rank, setRank] = useState(6);
  const abvBad = !/^\d{1,2}([.,]\d{1,2})?$/.test(abv.trim());

  return (
    <div data-slot="kit-parts" className="flex flex-col gap-8">
      <Section title="Buttons">
        <Row label="Solid, outlined, quiet, danger">
          <Button>Save</Button>
          <Button variant="outline">Check in</Button>
          <Button variant="quiet">Undo</Button>
          <Button variant="quiet-muted">Finish later</Button>
          <Button variant="destructive">Delete</Button>
        </Row>
        <Row label="With a glyph, icon only, disabled">
          <Button variant="outline">
            <Camera aria-hidden />
            Snap a bottle
          </Button>
          <Button variant="outline" size="icon" aria-label="Add">
            <Add aria-hidden />
          </Button>
          <Button disabled>Save</Button>
        </Row>
      </Section>

      <Section title="Chips">
        <Row label="Filter: off, on, a guess">
          <FilterChip selected={false} count={12}>
            Open
          </FilterChip>
          <FilterChip selected={chip} count={41} onClick={() => setChip(!chip)}>
            Wine
          </FilterChip>
          <FilterChip selected={false} guess>
            Trappist
          </FilterChip>
        </Row>
        <Row label="Kind">
          <TypeChip type="BEER" />
          <TypeChip type="WINE" />
          <TypeChip type="SPIRIT" />
          <TypeChip type="COFFEE" />
          <TypeChip type="TEA" />
          <TypeChip type="SAKE" />
        </Row>
      </Section>

      <Section title="Search, sort, count strip">
        <div className="flex gap-2">
          <SearchField
            className="flex-1"
            aria-label="Search Home Cellar by name, maker or style"
            placeholder="Search Home Cellar"
            debounceTimeout={250}
            onDebounced={() => {}}
          />
          <SortChip options={SORTS} value={sort} onValueChange={setSort} />
        </div>
        <CountStrip total={240} noun="bottles" order="A–Z" />
        <CountStrip total={240} noun="bottles" order="A–Z" matching={12} />
        <CountFilters<Kind>
          aria-label="Filter by kind"
          lead={{ value: "open", label: "Open", count: 20 }}
          cells={[
            { value: "beer", label: "Beer", count: 162 },
            { value: "wine", label: "Wine", count: 41 },
            { value: "spirit", label: "Spirit", count: 23 },
            { value: "coffee", label: "Coffee", count: 13 },
            { value: "tea", label: "Tea", count: 1 },
          ]}
          value={kind}
          onValueChange={setKind}
        />
      </Section>

      <Section title="Segments and switch">
        <SegmentedControl
          aria-label="View"
          options={[
            { value: "grid", label: "Grid" },
            { value: "list", label: "List" },
          ]}
          value={view}
          onValueChange={setView}
        />
        <SegmentedControl
          aria-label="View, small"
          size="sm"
          options={[
            { value: "grid", label: "Grid" },
            { value: "list", label: "List" },
          ]}
          value={view}
          onValueChange={setView}
        />
        <InsetSection label="Notifications">
          <ListRow
            title="Friend requests"
            trailing={
              <Switch
                checked={on}
                onCheckedChange={setOn}
                aria-label="Friend requests"
              />
            }
          />
          <ListRow
            title="Weekly recap"
            description="Off, and can't change here"
            trailing={<Switch disabled aria-label="Weekly recap" />}
          />
        </InsetSection>
      </Section>

      <Section title="Fields">
        <FormField label="Name" htmlFor="kit-name" fromLabel check>
          <Input id="kit-name" defaultValue="Orval" />
        </FormField>
        <FormField label="Name" htmlFor="kit-name-bad" error="Needs a name">
          <Input id="kit-name-bad" defaultValue="" aria-invalid />
        </FormField>
        <div className="flex gap-3">
          <FormField
            label="Strength"
            htmlFor="kit-abv"
            className="flex-1"
            error={abvBad ? "Use a number, like 8.2" : undefined}
          >
            <NumberField
              id="kit-abv"
              unit="% ABV"
              value={abv}
              invalid={abvBad}
              onChange={(event) => setAbv(event.target.value)}
            />
          </FormField>
          <FormField label="Country" className="flex-1">
            <PickerButton value="Belgium" />
          </FormField>
        </div>
        <AIDraftField source="label" drafted confidence="check">
          <FormField label="Maker" htmlFor="kit-maker">
            <Input id="kit-maker" defaultValue="Brasserie d'Orval" />
          </FormField>
        </AIDraftField>
        <AIDraftField
          source="suggested"
          drafted={false}
          proposal={{
            display: "Pale ale",
            label: "Style",
            onUse: () => {},
            onDismiss: () => {},
          }}
        >
          <FormField label="Style" htmlFor="kit-style">
            <Input id="kit-style" defaultValue="" />
          </FormField>
        </AIDraftField>
      </Section>

      <Section title="Stars and heart">
        <Row label="Yours (gold), someone else's (grey), not rated">
          <Stars value={4.5} size="lg" />
          <Stars value={3.5} tone="other" size="lg" />
          <Stars value={null} size="lg" />
        </Row>
        <Row label="Public rating, score">
          <PublicRating value={4.7} count={240} />
          <Score value={4.5} variant="hero" />
          <Score value={4.5} variant="pill" />
          <Score value={4.5} count={12} />
        </Row>
        <RatingInput
          value={rating}
          onChange={setRating}
          onClear={() => setRating(null)}
          label="Your rating"
        />
        <RatingInput value={3} onChange={() => {}} disabled label="Disabled" />
        <Row label="Heart: tile, page">
          <Heart on={loved} onToggle={setLoved} />
          <Heart on={lovedPage} onToggle={setLovedPage} size="page" />
          <Heart on={false} onToggle={() => {}} disabled />
        </Row>
      </Section>

      <Section title="Tiles and plates">
        <div className="grid grid-cols-2 gap-3">
          <CellarTile
            name="Orval"
            maker="Brasserie d'Orval"
            style="Pale ale"
            glyph={BeerGlyph}
            plate={
              <LabelPlate
                type="BEER"
                plate={{ name: "Orval", producer: "Brasserie d'Orval" }}
              />
            }
            rating={4.5}
            badge="Open"
            heart={<Heart on={loved} onToggle={setLoved} />}
          />
          <CellarTile
            name="Pliny the Elder"
            maker="Russian River Brewing Company"
            style="India pale ale"
            glyph={BeerGlyph}
            plate={
              <LabelPlate type="BEER" plate={{ name: "Pliny the Elder" }} />
            }
            rating={null}
          />
          <CellarTile
            name="Orval"
            maker="Brasserie d'Orval"
            glyph={BeerGlyph}
            plate={<LabelPlate type="BEER" plate={{ name: "Orval" }} />}
            rating={4}
            wide={{
              note: "Dry, a little funk, lovely with cheese.",
              date: "Mar 3",
            }}
          />
        </div>
        <Row label="The plate: small (glyph), large (label), recipe">
          <div className="size-14">
            <LabelPlate type="WINE" plate={{ name: "Barolo" }} />
          </div>
          <div className="size-28">
            <LabelPlate
              type="WINE"
              plate={{ name: "Barolo", vintage: "2016" }}
            />
          </div>
          <div className="size-28">
            <LabelPlate
              type="SPIRIT"
              face="recipe"
              plate={{ name: "Negroni" }}
            />
          </div>
        </Row>
      </Section>

      <Section title="Ranks and bands">
        <Row label="Rank chips, the owner's #1 with its crown">
          <RankChip rank={1} band={5} crown />
          <RankChip rank={6} band={4} />
          <RankChip rank={14} band={3} />
          <RankChip rank={21} band={2} />
          <RankChip rank={24} band={1} />
        </Row>
        <BandBar band={5} count={4} from={1} to={4} />
        <BandBar band={4} count={9} from={5} to={13} />
        <div className="flex h-64 gap-3">
          <Scrubber bands={SCRUB} value={rank} onValueChange={setRank} />
          <div className="flex flex-col gap-2">
            <p className="t-cap m-0 text-ink-2">Rank #{rank + 1}</p>
            <Button variant="outline" onClick={() => setSheet(true)}>
              Move band
            </Button>
          </div>
        </div>
        <BandSheet
          open={sheet}
          onOpenChange={setSheet}
          subject="Kettle & Kiln Coffee"
          rank={6}
          band={band}
          listName="Madison drinking spots"
          counts={{ 5: 4, 4: 9, 3: 7, 2: 3, 1: 1 }}
          onChoose={setBand}
          onExactPosition={() => {}}
          onRemove={() => {}}
        />
      </Section>

      <Section title="Page hero and history">
        <PageHero
          photo={
            <LabelPlate
              type="BEER"
              labelled
              plate={{ name: "Orval", producer: "Brasserie d'Orval" }}
            />
          }
          back={
            <button type="button" aria-label="Back" className={HERO_DISC}>
              <Back aria-hidden />
            </button>
          }
          actions={
            <button type="button" aria-label="More" className={HERO_DISC}>
              <More aria-hidden />
            </button>
          }
          title="Orval"
          heart={<Heart on={lovedPage} onToggle={setLovedPage} size="page" />}
          meta="Brasserie d'Orval · Pale ale · 6.2% ABV"
        />
        <HistoryList>
          <HistoryRow glyph={<Star aria-hidden />} date="Mar 3" owner>
            You rated it 4.5
          </HistoryRow>
          <HistoryRow glyph={<OpenBottleGlyph aria-hidden />} date="Feb 20">
            Opened
          </HistoryRow>
          <HistoryRow glyph={<Add aria-hidden />} date="Jan 9">
            Added to Home Cellar
          </HistoryRow>
        </HistoryList>
      </Section>

      <Section title="Charts and stat tiles">
        <Histogram
          title="Your ratings"
          points={[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((at, i) => {
            const n = [0, 1, 2, 4, 9, 14, 22, 12, 3][i] ?? 0;
            return {
              label: Number.isInteger(at) ? String(at) : "",
              value: n,
              readout: `${n} at ${at}`,
            };
          })}
        />
        <TrendChart
          title="Check-ins"
          points={["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((m, i) => {
            const n = [3, 5, 4, 8, 6, 9][i] ?? 0;
            return { label: m, value: n, readout: `${n} in ${m}` };
          })}
        />
        <StatGrid>
          <StatTile value="240" label="Bottles" />
          <StatTile value="4.1" label="Your average" delta="+0.2 this year" />
          <StatTile value="23" label="Places" />
          <StatTile value="6" label="Lists" />
        </StatGrid>
      </Section>

      <Section title="People, places, activity">
        <InsetSection>
          <PersonRow name="Maya Chen" displayName="Maya Chen" chevron />
          <PersonRow
            name="Omar Haddad"
            displayName="Omar Haddad"
            status="Asked to be friends"
            actions={
              <Button variant="outline" size="sm">
                <Check aria-hidden />
                Accept
              </Button>
            }
          />
          <PersonRow name="Test Two" displayName="Test Two" sample />
        </InsetSection>
        <Row label="Avatars">
          <UserAvatar displayName="Maya Chen" size="sm" />
          <UserAvatar displayName="Maya Chen" size="md" />
          <UserAvatar displayName="Omar Haddad" size="row" />
          <UserAvatar displayName="Test" size="lg" />
          <UserAvatar displayName="Test Two" size="xl" />
        </Row>
        <PlaceRow
          name="Kettle & Kiln Coffee"
          glyph={CoffeeGlyph}
          where={"State St · 1.2 km"}
          rating={4.6}
          ratingCount={38}
          rank={{ rank: 1, band: 5, crown: true }}
        />
        <PlaceRow
          name="Isthmus Bottle Shop"
          glyph={WineGlyph}
          where={"E Washington Ave · 2.4 km"}
          rating={4.3}
          ratingCount={17}
        />
        <ActivityItem
          who="Maya Chen"
          sentence={
            <>
              <ActivityName>Maya Chen</ActivityName> rated{" "}
              <ActivityName>Orval</ActivityName> 4.5
            </>
          }
          detail="Dry, a little funk."
          time="2h"
        />
        <ActivityItem
          who="Omar Haddad"
          sentence={
            <>
              <ActivityName>Omar Haddad</ActivityName> checked in at{" "}
              <ActivityName>Lakeside Tap House</ActivityName>
            </>
          }
          time="Yesterday"
        />
        <InsetSection label="Settings">
          <ListRow
            leading={<UserAvatar displayName="Test" size="md" />}
            title="Edit profile"
            description="Name and picture"
          />
          <ListRow
            leading={<Settings aria-hidden className="size-5" />}
            title="Who sees your cellars"
            trailing={<span className="t-body text-ink-2">Friends</span>}
          />
          <ListRow
            leading={<Comment aria-hidden className="size-5" />}
            title="Sign out"
          />
        </InsetSection>
      </Section>

      <Section title="Loading, empty and error">
        <div className="grid grid-cols-2 gap-3" aria-hidden>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-2.5 overflow-hidden rounded-md border border-edge bg-card pb-3"
            >
              <Skeleton className="aspect-square w-full rounded-none" />
              <Skeleton className="mx-3 h-3" />
              <Skeleton className="mx-3 h-2.5 w-1/2" />
            </div>
          ))}
        </div>
        <EmptyState
          boxed
          illustration={<NoResults aria-hidden />}
          title={'No bottle matches "pilsner"'}
          action={<Button variant="outline">Clear search</Button>}
        />
        <ErrorState
          boxed
          illustration={<Offline aria-hidden />}
          title="Couldn't load Home Cellar"
          reason="You're offline"
          action={
            <Button variant="ghost">
              <Refresh aria-hidden />
              Try again
            </Button>
          }
        />
      </Section>
    </div>
  );
}
