# Phase 0 — Market research (ux-review-market, 2026-10-05)

Method: web search and App Store listings only. No repo was touched. Every "Cellar Assistant" cell is UNKNOWN; reviewers must verify against the code. Competitor-written comparison posts are biased.

## Three findings that should shape the plan
1. **Untappd went multi-beverage in Nov 2025.** It now covers spirits, wine, canned cocktails, coffee and soda, with 900+ categories. Multi-beverage alone no longer differentiates Cellar Assistant. Depth per category (cellar, drinking windows, recipes) plus AI that removes typing does.
2. **"One photo of a pile, many items" is now standard.** cellarmate.ai (haul photo, receipt and invoice scanning), VinSip (shelf scan) and Mixel's AI bartender Bart (photo of your bar shelf). Single-label scan is the minimum, not a feature.
3. **Incumbents' AI assistants can see the user's collection, and some can edit it.** InVintory's Vincent adds, updates and removes bottles in conversation and reads PDFs. CellarTracker has CellarChat. Vivino's AI Sommelier uses the user's history. A chatbot that can't see or change the cellar is now behind.

## Competitor notes (condensed)
- **Vivino:**
  - Capture and AI: label scan, whole wine-list scan with a score/price overlay, "Match for You" personal score, AI Sommelier, Apple Visual Intelligence integration.
  - Cellar: drinking windows.
  - Delight: taste profile, weekly highlights, challenges, a yearly recap.
- **CellarTracker:**
  - Add via Receipt: forward an email or send a PDF/photo; it matches against a 4.5M-wine DB, sends a "Confirm New Wines" email, then you add in bulk.
  - Also: label and barcode scan, drinking-window alerts, valuation data, CellarChat, "will you like it" predictions.
  - Delight: a quarterly "What's Poppin'" report, a printable cellar list.
- **InVintory:**
  - Capture: label scan, receipt scan, import from CellarTracker / Vivino / CSV with automatic fill of value, drink window and scores.
  - Vincent assistant (see above).
  - VinLocate: a 3D rack map that highlights the bottle's slot.
  - Home dashboard: value, a "Ready to Drink" list that fills itself.
  - Year in Review: up to 10 cards, skips cards with thin data, pre-renders all as share images, stays available year-round.
  - Latest: emoji reactions.
- **Untappd:**
  - Check-in: drink required, venue optional; flavour-tag chips; photo; rating.
  - Badges levelled to 100.
  - Venues: live venue menus; push when a friend checks in nearby or a liked beer is tapped nearby.
  - Recappd: styles, flavour profile, check-in map, a month-long event.
  - CAUTION: arXiv 2601.04841 argues count-based badges reward drinking more.
- **Distiller:** flavour graphs (removed, then restored after backlash), an AI summary of community reviews ("Members Say"), TruePrice valuation.
- **Whiskybase:** scan shows community rating, shop listings and auction results; Plus tier adds collection value and price alerts.
- **Mixel:** "can make now" sort; Maximizer (which ingredient unlocks the most recipes); Bart works from text or a shelf photo; shopping list; PDF menu export.
- **Highball:** recipe share images with an embedded QR that re-imports an editable copy, so every share brings in users.
- **Paprika / Mela:**
  - Paprika: tap a detected time to start a timer, screen stays awake, cross off ingredients, scaling.
  - Mela: Live Text cookbook scan; Cook mode, one step at a time.
  - ReciMe and Deglaze import recipes from TikTok (caption, then audio, then on-screen text, then source site).
- **Coffee:**
  - Beanconqueror: roaster QR fills bean details; brew graphs.
  - Bean AI: reads the bag, then uses an LLM to fill in what the label omits; a rest-days-after-roast countdown and peak-flavour bar; recipes per method.
- **Tea:** TeaCabinet steep timers with steep count per tea.
- **Sake:**
  - Sakenowa (Jul 2026) scans the BACK label (polishing ratio, SMV, acidity, yeast, yamahai/namazake), shows a draft with a confirm screen, then the check-in form.
  - Sakenomy: serving temperature, pairing search by cuisine.
- **Beli:**
  - Rating: 3 buckets, then pairwise "which did you like more?" with Skip / Too tough / Undo, giving a /10 score and a ranked list where scores spread out.
  - Map pins coloured by your score.
  - Lists: Been, Want to Try, Recs.
  - Taste Profile and a Match Score with each friend.
  - Leaderboards, streaks, a mid-year recap.
  - Add to Want to Try straight from TikTok or Instagram.
  - Critique: the pairwise comparisons mix categories (wrong item compared).
- **Letterboxd:** a diary framing (date, half stars, a separate "loved" heart, a rewatch flag); poster grid; chronological feed; stats and Year in Review; a URL scheme that pre-fills a log entry.
- **Delectable:** label recognition; a feed of what sommeliers are drinking. Lesson: an expert feed solves cold start before you have friends on the app.
- **AI-native newcomers:**
  - Cella: drinking-window timeline (too young / ready / peak / past), value.
  - VinoCellar: voice dictation turned into a structured note.
  - Tannotes: WSET-structured notes.

## Top 15 features to consider (difficulty assumes the existing vision, embedding and menu pipelines are reused)
1. **Haul / shelf capture: one photo, many draft items, shown as a grid of draft cards.** (M)
2. **Bulk import:** receipt photo or PDF, forwarded order email (needs an inbound-mail webhook), CellarTracker / Vivino / CSV import. (M)
3. **One "draft, then confirm" contract for every AI capture, with a back-label mode per category** (sake SMV and polishing ratio; coffee roast date; beer canned-on date). (L)
4. **Beli-style pairwise placement into rankings.** Binary-search insertion; AI picks the comparator within the same category or style; Skip / Too tough / Undo; a /10 score derived from position. (M)
5. **One "Ready now" freshness lane across types:** wine windows, coffee days off roast, IPA canned date, namazake, opened-bottle clocks. (M)
6. **An assistant that sees and edits the collection** via tool-calling, with confirmation before any write ("I drank two of the Barolo"). (M–H)
7. **Menu scan with a personal-match overlay:** a per-user predicted score and a "you rated similar" note on each matched line. (M)
8. **Check-in in three taps** (drink required, venue optional, flavour chips, Letterboxd diary framing), with an optional voice note turned into a structured note. (L–M)
9. **Recap system:** mid-year and year-end; skips thin cards; share images; an AI-written narrative from the existing insights pipeline. (M)
10. **Share cards with a QR or deep link back in** for recipes, tier lists, "My Six" and recaps. (L–M)
11. **"What can I make" plus a Maximizer, using the spirits already in the cellar** — no separate bar setup. (L–M)
12. **Capture from anywhere:** share a link, post or video into the app. Web Share Target is Android-only, so iOS needs paste-a-link. (M)
13. **Taste profile plus a match score with each friend.** (M)
14. **Badges for breadth, not volume:** firsts, styles, regions, all six categories. Streaks count logging days, never drinks. (M)
15. **Make / brew mode:** one step at a time, auto timers, Wake Lock, steep and pour timers. (L–M)

Left out on purpose:
- Licensed valuation: an AI-estimated value would mislead.
- A 3D rack map: a 2D rack grid that highlights the bottle gets most of the value.

## Five delight ideas only a multi-beverage app can do
1. **"Tonight's lineup"** from one prompt or a dinner photo: aperitif cocktail you can make now, then wine or sake, then coffee or tea, then a digestif, all from your inventory, with bottles near the end of their window first.
2. **Cross-category taste bridges / a "taste passport"**: peated Islay → lapsang souchong, rauchbier, a mezcal cocktail. Each bridge tried stamps the passport.
3. **One freshness clock for everything you own**: a weekly "drink this week" digest. The opened-vermouth clock links to cocktails that use it.
4. **"My Six"**: a four-favourites style grid with one slot per beverage type, plus a pairwise cross-category final. Shares as a QR card.
5. **A 24-hour drinks clock in the recap**, plus an automatic menu-scan → check-in prompt: "You scanned Bar X's menu last night. Which did you have?"

## PWA constraints
- Not available on iOS: `navigator.vibrate`, Web Share Target, Live Activities, widgets, Visual Intelligence.
- Available: getUserMedia camera-first entry, Screen Wake Lock, Web Push (installed PWAs, iOS 16.4+), View Transitions.
- So motion and transitions are the dependable delight lever on iOS.

Full source URLs are in the original agent report. Key ones:
- https://support.cellartracker.com/article/75-add-via-receipt
- http://help.invintory.com/en/articles/14304137-understanding-your-year-in-review
- https://muro.sakenowa.com/en/posts/20260726-label-scan
- https://ixd.prattsi.org/2022/02/design-critique-beli-ios-app/
- https://arxiv.org/pdf/2601.04841
- https://www.cellarmate.ai/
- https://www.thedrinksbusiness.com/2025/11/untappd-expands-beyond-the-beer-category/
