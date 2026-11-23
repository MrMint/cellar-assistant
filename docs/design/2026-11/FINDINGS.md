# Findings: what the owner dislikes about the redesign

Phase 1 of the 2026-11 design pass. The owner rated before/after pairs of `main` (`d3a5b1e9`) and
the integration branch (`987681bc`) at 390×844 on 2026-11-23, both on the demo seed, dark only
(neither app has a reachable light theme). Rating page:
https://claude.ai/artifact/X4U77hMjTEK6ZgtiFTnF7a.

## The owner's words

**Overall, said in chat after rating:**

> some of my core dislike is just how, I don't know, like inconsistent and maybe unintentional
> feeling a lot of the stuff is in the redesign. It feels like there's a lot of room for
> improvement for us to really try and dial in a consistent, good visual design and user
> experience across the whole app, especially given that like this is really a mobile app first
> and foremost. And then similar to Fettle, like we might have some pages where on the desktop
> it's a different experience given the form factor.

**On single pairs:**

| Pair | Verdict | Comment |
|---|---|---|
| SH03 First screen after sign-in | worse | "I'm fine with moving our "old" search screen with all of the stuff on it as the main landing screen. I think it's a mistake to shift it's focus. I think it should be geared around what I had before" |
| CI03 A cellar | worse | "I really liked the image first approach I was taking before." |
| SH01 Sign in | same | "The buttons are basically indistiguinshable from the background on the new one." |
| CI08 An empty cellar | better | "all the stuff at the top feels unorganized though" |

## The ratings

38 of 97 pairs rated: 27 better, 6 same, 5 worse. The owner stopped part-way through the social
pairs and rated no capture or recipes pair.

- **Worse (5):** SH03 first screen · SH05 navigation, resting (same Home screen) · CI03 a cellar ·
  CI04 a cellar, scrolled · CI05 a cellar, filtered.
- **Same (6):** SH01 sign in · CI06 cellar searched · CI17 edit a bottle · CI24 loved items ·
  SO08 and SO09 a tier list.
- **Better (27):** sign-up, first run, Me, profile, offline, not found; the cellar list and its
  forms; every bottle and item page, the Pour sheet, finishing a bottle, bottle actions; the map
  and its place sheet; rankings, the tier-list index, adding to a tier list.

## Themes

Sorted by the lead from the words and verdicts above. Where a line is the lead's reading and not
the owner's statement, it says so.

### 1. It feels inconsistent and unintentional (the core dislike)

- The owner's main complaint is about the app as a whole, not about any one screen. Screen by
  screen the redesign mostly wins (27 of 38), so pairs could not show this.
- Evidence that agrees: the redesign's first screen uses 10.3 text styles on average against
  main's 6.8, and whole screens carry 143 words against 66.
- "all the stuff at the top feels unorganized" (CI08) is one named instance: the cellar's
  header, search, segments, type chips, sort and add button.
- **Not yet known:** which things are drawn more than one way. A consistency audit of the
  captures is the next step, shown to the owner as crops to confirm by looking.

### 2. Home lost its focus

- The owner accepts the old search screen as the landing screen, and wants it "geared around
  what I had before": a greeting, search, shortcuts to Cellars, Map, Tier lists, Favorites and
  Rankings, and their own recent activity.
- The redesign's Home leads with "Waiting on you", a "Continue" shelf, "Drink soon" and a
  friends feed.
- Parity agrees: the owner's own recent activity and its filter (M-027 to M-029) are gone from
  Home; the feed is friends-only.

### 3. The cellar is no longer image first

- "I really liked the image first approach I was taking before." Main's cellar is a two-column
  grid of large pictures. The redesign's default view is a row of small dim plates and then a
  text list ("Drink soon").
- All three cellar-grid pairs were rated worse. The cellar's other segments (CI07a, CI07c) and
  every bottle page were rated better.
- Lead's reading: the complaint is about what leads the cellar, not about the plates as such.
  Neither lane had a real label photo, so the plates were judged at their weakest.

### 4. Actions that do not look like actions

- "The buttons are basically indistiguinshable from the background" on sign-in: the three
  provider buttons are dark on dark.
- The capture measured fewer small tap targets on the redesign (4.6 against 8.6 per first
  screen), so size is not the problem; contrast and affordance are.

### 5. Mobile first, with desktop its own experience where the form factor asks for it

- Stated as a goal for this pass, not as a fault found in a pair. Desktop was not captured.

## What the owner did not complain about

- Bottle and item pages, the Pour sheet, the map and its sheet, Me, and the empty and error
  states were all rated better. These are evidence for what to keep.
- Speed: the redesign is as fast or faster on all eight core jobs counted (`taps` below).

## Measurements (73 pairs with both sides, first frame, dark)

| Measure | Main | Redesign |
|---|---|---|
| Words in the first screen | 39.4 | 51.7 |
| Words on the whole screen | 66.3 | 142.6 |
| Text styles in the first screen | 6.8 | 10.3 |
| Tap targets under 44×44 px in the first screen | 8.6 | 4.6 |

Taps per core job (main → redesign): add a bottle by typing 8 → 3; log a drink 3 → 2; find a
named bottle 2 → 2; rate an item 5 → 4; open menu scan 4 → 2; put an item on a tier list 4 → 4;
see a friend's drinking partial → 0; open a cocktail blocked (demo data) → 3.

Qualifiers: measured 2026-11-23 on containers built from `d3a5b1e9` and `a68fb8bb`, AI off on
both, load average 35–45, no item photos on either lane, main's demo data thinner (116 check-ins
against 285).

## Jobs lost or buried (from `PARITY-MAIN-BRANCH.md`)

Read from source, not rated by the owner. Each needs the owner's ruling before a board drops it.

- **Gone:** QR-code sharing; the tier-list edit lock (Arrange mode replaces it); per-type index
  pages; the activity filter on Home; the tips card during capture.
- **Harder to reach:** add to tier list, edit item and delete bottle (now in an overflow); the
  owner's own recent activity; who checked in a bottle; Brands (search only); recipes (two taps).

## What this means for the pass

1. The vision and the kit have to answer theme 1 first: one way to draw each thing, chosen on
   purpose. A direction that is prettier but no more consistent fails.
2. Home and the cellar are the two screens to redesign from main's intent, not from the branch.
3. Bottle and item pages, Pour, the map sheet and Me are the branch's strongest work; the
   directions should start from them.
