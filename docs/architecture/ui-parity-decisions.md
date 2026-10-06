# UI parity — decisions

**Status:** defaults chosen 2026-10-04 by the orchestrating agent under the user's
standing instruction, so the restore can proceed without blocking. **Every row
marked _default_ is open to the user's override**; a row marked _user_ is theirs.
Read with [`ui-parity-inventory.md`](ui-parity-inventory.md) (the question numbers
below are its §"Open questions").

## The principle (user)

> "I'd feel better about leveraging the existing UI itself. If I were to do a
> visual overhaul I'd want it to be intentional and separate."

So: the production UI at `82450ad1` (`src/components`, `src/app`) is the **spec**.
Restore its components as close to verbatim as the new data layer allows, behind
thin adapters from the new API's shapes to the old props. Where the old and new
UIs overlap, the old one wins. Server-side capability added by the migration
(pagination, the patch policy, typed errors, visibility rules, security fixes) is
**kept** — the restored UI calls it; it does not route around it.

## Gating answers

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Cellar-item URL: bottle id (old) or catalog item id (new)? | **Bottle id (old).** The URL means what it meant in production, so existing bookmarks and shared links keep working. An item id arriving at that route redirects to the cellar's matching bottle when there is exactly one, else to the item page. | default |
| 2 | New-only features that overlap the old UI | **Old UI wins where they overlap**: the Your/Shared split, per-card bottle controls and the search tabs go. **New routes that do not replace an old view stay** (`/{type}s` lists, `/{type}s/[id]/edit`, `/cellars/[id]` check-ins page, tier-list delete, in-page tier-list add) but are restyled with the restored components, never left in the rewrite's style. Each kept one is listed in the wave's report for the user to ratify. | default |
| 3 | Re-add dropped dependencies for pixel parity? | **Yes**, at current versions, through `bunfig.toml`'s release-age rules: react-virtual, xstate, recharts, framer-motion, lexical, react-webcam, barcode-detector, star-rating, qr-code, date-fns — each only when the first restored component needs it, and each recorded in that commit. A dependency with a known advisory and no fixed version is replaced, not re-added, and reported. | default |
| 4 | Empty bottles | **Old behaviour**: hidden from cellar lists; counts are of non-empty bottles. | default |
| 5 | Recipes | **The old visual design over the new data**, including the pages that never loaded in production (votes and reviews had no Hasura permissions). The design is the spec, the old data bugs are not. | default |
| 6 | Rich text in reviews | **Lexical, restored**, so migrated review JSON renders as it did, not as raw JSON. | default |

## Per-domain questions

Decided in the wave that reaches them, each recorded here with its source, and
any whose answer changes product behaviour is put to the user before that
wave merges.

## Not decided here

- Chosen drop G32 (image search): stays dropped until the user says otherwise.
  G31 (the `/search` activity feed and nearby strip) was answered by the user on
  2026-10-05 — restore it; see item 19.
- Anything that changes production data or URLs beyond row 1.

## Awaiting the user (collected 2026-10-05)

Everything below shipped as described so the restore could finish; each is a
one-line or small change to reverse. Answer per item.

### Kept new-only (the rewrite added it; the old UI had nothing there)
1. `/cellars/[id]` overview page (old URL only printed the id), with a per-card
   **Check in** button on its bottle preview. — CellarsWave
2. Tier lists: in-page "Add entry" and the delete button. — TierListsWave
3. Items: one review per person with edit/delete; "Show more reviews". Same on
   recipes. — ItemsWave, RecipesWave
4. Recipes: Stop/stalled handling on photo jobs, canonical badge on the detail
   page, variation chips as links, "N more versions not listed". — RecipesWave
5. Map: Accept/Reject on pending suggestions, visit count from the server,
   `recordPlaceAccess`. — MapPlacesWave
6. `/{type}s` list pages and `/{type}s/[id]/edit`, restyled. — ItemsWave

### Dropped (old or rewrite feature not carried over)
7. Item page: the rewrite's photo gallery, linking/unlinking brands, the barcode
   line and the edit form's barcode field, `Item.checkIns` list (per-bottle
   check-ins remain), recipe recommendations (needed G29). — ItemsWave
8. Recipes: ingredient availability icons and "View substitutions" (were
   `Math.random()` in production), the favourite heart (its handler was a TODO),
   the semantic recipe search panel — semantic recipe search is now nowhere in
   the UI although the API supports it. — RecipesWave, SearchWave
9. Search: the rewrite's brands/people/recipes tabs and two quick-link chips;
   text search capped at 10 results (the old cap); image search (G32). — SearchWave
   (The discovery section — Recent Activity and Nearby Places — is no longer
   dropped: restored under item 19.)
10. Map: Discoveries "Recent Additions" (G22, no API), the favourites visit
    filter (G34; filtered nothing in production), the rewrite's place rating /
    notes / tags / want-to-visit panel. — MapPlacesWave
11. Onboarding: image search on the display photo (G32). — OnboardingWave

### Behaviour choices
12. `me.collectionStats` counts items whatever their bottles' state (production
    did), unlike decision 4's "non-empty only" for cellar counts. — ApiWaveA
13. Cellars list is newest-first; production's query had no `ORDER BY`, so its
    order was arbitrary. — orchestrator
14. Tier-list lock is enforced in the UI only, as in production. — TierListsWave
15. The map asks for geolocation on load (old), not on click (rewrite). — MapPlacesWave
16. AI place-review categories now equal the restored create form's 25 slugs
    (12 added, 6 dropped: wine_shop, vineyard, taproom, coffee_roaster,
    tea_shop, izakaya). — FinalGate 90d1e8e9
20. **Email verification is superseded by social-first sign-in in production
    (user, 2026-10-05).** No email is sent at all, so verification and
    reset-by-email are not restored. Production runs
    `AUTH_PASSWORD_MODE=signin-only`: social buttons first, a collapsed
    password form for the 4 existing password users with no social login, and
    no password sign-up; dev and e2e stay `enabled`. Google/Discord link a
    password user's account by email; Facebook cannot (better-auth reports its
    email unverified). The old page's "Forgot your password?" link pointed at
    `#replace-with-a-link` and is not restored. — SocialOnlyAuth

### Product questions
17. Is a Google Places budget configured in production? Without one, place
    enrichment fails closed (it stays queued). — MapPlacesWave
18. Should AI calls that never reach the provider count against a user's cap?
    Today a Vertex outage plus outbox retries can lock users out for up to a
    day. — E2EStability
19. G22 recent additions from discoveries, G29 "can make", G30 multiple recipes
    per photo — build, or stay dropped?
    **G31 answered (user, 2026-10-05): restore.** `/search` again renders Recent
    Activity (`?activity=` filters) and Nearby Places under the quick links, at
    the old paths (`components/search/{SearchDiscovery,RecentActivity,
    NearbyPlaces}.tsx`). Served by `me.recentActivity` and `me.nearbyPlaces`,
    neither of which takes a user id: the server reads the viewer's own friend
    rows, shows a tier-list entry only from a list `canSeeTierList` admits (a
    friend's PRIVATE list never appears, name included — the old query showed
    it) and a bottle only from a cellar `canSeeCellar` admits. Two deviations to
    ratify: "Added" lists bottles added by you or a friend, where the old query
    listed any visible cellar's newest bottles, a stranger's PUBLIC cellar's
    included; and a relative time ("· 3 days ago") appears after hydration
    rather than in the first paint (the hydration rule). — SearchDiscovery
