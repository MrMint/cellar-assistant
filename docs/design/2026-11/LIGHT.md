# Light theme (DECISIONS 46)

Settled by the `light-kit` designer on the kit boards, 2026-11-26, and accepted by the lead with the
rulings at the end. Builders take the values from here; boards take the switch from § 4.

## 1. Tokens: dark → light

Contrast figures are for light, on bg `#f5f4f8` / card `#fff` / raised `#ebe9f0` / sel `#dedbe7`.

| Token | Dark | Light | Light contrast / note |
|---|---|---|---|
| bg | #111015 | #f5f4f8 | |
| card | #221f2a | #ffffff | |
| raised | #332f3e | #ebe9f0 | also the no-photo well |
| sel | #443f53 | #dedbe7 | |
| edge | #433f4d | #d6d3de | decorative (tiles, cards) |
| edge-2 | #71678a | #867f99 | 3.48 / 3.81 / 3.17; input boundaries (ruling 1) |
| hair | #2c2936 | #e4e2ea | divider |
| rule | #3c3847 | #e1dee7 | |
| dash | #736d89 | #8f89a1 | 3.06 / 3.35; board-note dash |
| ink | #ffffff | #17151c | 16.5 / 18.1 / 15.0 / 13.3 |
| ink-2 | #b8b5c0 | #4a4656 | 8.3 / 9.1 / 7.6 / 6.7 |
| ink-3 | #aea9bd | #5c576b | 6.3 / 6.9 / 5.8 / 5.1 |
| glyph | #857e9f | #7d7791 | 3.9 / 4.3 / 3.6 / 3.1 |
| act | #70a2a9 | #5f949b | 3.10 / 3.39 |
| on-act | #111015 | #0e0d12 | 5.71 on act |
| act-ink | #8cc0c6 | #2d6a71 | 5.6 / 6.2 / 5.1 / 4.5 |
| gold | #d59d24 | #a2700c | 4.0 / 4.3 / 3.6 / 3.2 |
| heart | #fe0000 | #e0001b | 4.6 / 5.0 / 4.2 / 3.7 |
| dng | #f0c5c8 | #b3261e | 6.0 / 6.5 / 5.4 / 4.8 |
| k5..k1 | #4fb469 #9cc25a #e5c84a #ec8f3e #e8615a | same | bands gain `--k-edge` in light |
| on-k | #111015 | #111015 | 5.7 to 11.5 on the bands |
| k-edge | transparent | rgba(17,16,21,.40) | `box-shadow: inset 0 0 0 1px` |
| here | #3d7ef0 | #3d7ef0 | |
| scrim / scrim-pk | rgba(8,7,12,.62) / .78 | rgba(23,21,28,.42) / .62 | |
| glass / on-glass | rgba(17,16,21,.86) / #fff | same | discs and pills over photos |
| toast / edge / ink / act | #332f3e / #71678a / #fff / #8cc0c6 | #2a2733 / #2a2733 / #fff / #8cc0c6 | the toast stays dark |
| skel | #3c3847 | #e2dfe8 | |
| note | rgba(17,16,21,.94) | rgba(255,255,255,.96) | board-note fill |
| sh-bar / sh-pop | rgba(4,3,8,…) | rgba(40,36,52,.22) / .18 | |
| ring (desktop) | #e6e3ee | #17151c | |
| sh-dlg (desktop) | rgba(4,3,8,.7) | rgba(40,36,52,.24) | |

## 2. Photos on light
Tiles keep the card's 1 px edge, photo flush, no shadow. Heroes are full-bleed and fade into
`var(--bg)`; text sits only on the near-opaque end of the fade.

## 3. What stays dark
The toast (an inverse surface), the camera viewfinder (`.keep-dark` subtree), glass discs and pills
over photos. The QR plate and switch knob are white in both themes.

## 4. The switch (boards paste this verbatim)

(a) CSS, replacing the board's token block(s):
```
.app,.app .keep-dark{--bg:#111015;--card:#221f2a;--raised:#332f3e;--sel:#443f53;--edge:#433f4d;--edge-2:#71678a;--hair:#2c2936;--rule:#3c3847;--dash:#736d89;
--ink:#ffffff;--ink-2:#b8b5c0;--ink-3:#aea9bd;--glyph:#857e9f;--act:#70a2a9;--on-act:#111015;--act-ink:#8cc0c6;--gold:#d59d24;--heart:#fe0000;--dng:#f0c5c8;
--k5:#4fb469;--k4:#9cc25a;--k3:#e5c84a;--k2:#ec8f3e;--k1:#e8615a;--on-k:#111015;--k-edge:transparent;--here:#3d7ef0;
--scrim:rgba(8,7,12,.62);--scrim-pk:rgba(8,7,12,.78);--glass:rgba(17,16,21,.86);--on-glass:#ffffff;--sh-bar:0 10px 12px -10px rgba(4,3,8,.9);--sh-pop:0 12px 32px rgba(4,3,8,.6);
--toast:#332f3e;--toast-edge:#71678a;--toast-ink:#ffffff;--toast-act:#8cc0c6;--skel:#3c3847;--note:rgba(17,16,21,.94)}
.app.light{--bg:#f5f4f8;--card:#ffffff;--raised:#ebe9f0;--sel:#dedbe7;--edge:#d6d3de;--edge-2:#867f99;--hair:#e4e2ea;--rule:#e1dee7;--dash:#8f89a1;
--ink:#17151c;--ink-2:#4a4656;--ink-3:#5c576b;--glyph:#7d7791;--act:#5f949b;--on-act:#0e0d12;--act-ink:#2d6a71;--gold:#a2700c;--heart:#e0001b;--dng:#b3261e;
--k5:#4fb469;--k4:#9cc25a;--k3:#e5c84a;--k2:#ec8f3e;--k1:#e8615a;--on-k:#111015;--k-edge:rgba(17,16,21,.4);--here:#3d7ef0;
--scrim:rgba(23,21,28,.42);--scrim-pk:rgba(23,21,28,.62);--glass:rgba(17,16,21,.86);--on-glass:#ffffff;--sh-bar:0 10px 12px -10px rgba(40,36,52,.22);--sh-pop:0 12px 32px rgba(40,36,52,.18);
--toast:#2a2733;--toast-edge:#2a2733;--toast-ink:#ffffff;--toast-act:#8cc0c6;--skel:#e2dfe8;--note:rgba(255,255,255,.96)}
```
Desktop boards add:
```
.app{--ring:#e6e3ee;--sh-dlg:0 20px 48px rgba(4,3,8,.7)}
.app.light{--ring:#17151c;--sh-dlg:0 20px 48px rgba(40,36,52,.24)}
```
(b) Markup: the app root is `<div class="app {{themeCls}}" …>`.
(c) data-props: add `"theme":{"editor":"enum","options":["dark","light"],"default":"dark"}`.
(d) renderVals: `themeCls: (this.props.theme ?? 'dark') === 'light' ? 'light' : '',`
Delete any board-level theme switch (`FORCE_LIGHT`, `const LIGHT`, `matchMedia('(prefers-color-scheme…)')`).
(e) Render light from a scratch copy with the theme default set to `light`.

## 5. One-time edits beyond the swap
- Bands: `.k5{background:var(--k5);box-shadow:inset 0 0 0 1px var(--k-edge)}`, likewise k4..k1.
- Board-note door marker `.doorx`: `background:var(--note)`.
- Text on glass, pills and photo badges: `color:var(--on-glass)`.
- Camera viewfinder root: class `keep-dark`; remove its own re-declared dark tokens.
- Sheet titles over a scrim: `var(--ink)`, never `#fff`.
- Raw colours become tokens. `#fff` means `--on-glass` on a photo or glass, otherwise `--ink`.
  Off-kit values: `#675e7d` → edge-2; `rgba(17,16,21,.94)` → note on board notes, glass on discs;
  `rgba(4,3,8,.7)` → sh-dlg; `#e6e3ee` → ring; others to the nearest token by role.

## Lead's rulings (2026-11-26)
1. Input boundaries (text fields, pickers, steppers, search fields) reach 3:1 in both themes: they
   use `--edge-2`. Tiles and cards stay decorative on `--edge`; their tonal fill is the boundary.
2. The light gold `#a2700c` is accepted; gold stays the owner's own verdict in both themes.
3. Dark-theme failures the kit flagged are fixed with the light round: glyph and heart on `--sel` use
   ink-2 / a filled heart on a card chip; dark `--dash` lightens to #736d89 (3.86 on bg, 3.30 on card); the switch
   knob on act gets a 1 px `--on-act` ring.
4. The kit's sign-in pilot loses "Forgot password?" (DECISIONS 45a).

## Added during the light round (lead, 2026-11-26)
- Kit tokens adopted from Places: `--sh-pin`, `--sh-pin-on`, `--sh-you`, `--sh-dock`, `--sh-bar-up`
  (dark values unchanged from the boards; light values rgba(40,36,52,…)), and `--act-on-glass`
  (#8cc0c6 in both themes) for teal on glass.
- Build note: hero titles must reach 4.5:1 in both themes (below the photo, or on a scrim); the boards
  keep their layout.
- Discs on a hero with no photo (back, menu) are `--card` with `--ink` glyphs; glass discs only over
  photos.
- `--glass-hover`: rgba(17,16,21,.96) in both themes (desktop disc hover). Segmented controls are not
  input boundaries and stay on `--edge`. Images that leave the app (the recap share card, link
  previews) are generated from the dark values whatever the theme.
