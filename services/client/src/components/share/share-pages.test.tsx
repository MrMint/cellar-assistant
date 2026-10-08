/**
 * X17's public pages, rendered on the server as a signed-out viewer gets
 * them: what is on them, and — as much — what is not. The data shapes are
 * the anonymous `shared*` reads'.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { inviteShareRequest } from "./InviteFriendsCard";
import { InviteHero, inviteCopy } from "./InviteHero";
import { recipeDescription, tierListDescription } from "./metadata";
import { SharedItemView, sharedItemSubtitle } from "./SharedItemView";
import {
  formatAmount,
  recipeFacts,
  SharedRecipeView,
  safeImageUrl,
} from "./SharedRecipeView";
import { SharedTierListView } from "./SharedTierListView";
import { ShareFrame } from "./ShareFrame";

const entry = (
  id: string,
  band: number,
  position: number,
  extra: Partial<{
    name: string | null;
    notes: string | null;
    entryType: string;
    imageUrl: string | null;
    location: string | null;
  }> = {},
) => ({
  id,
  band,
  position,
  notes: null,
  entryType: "BEER",
  name: `Beer ${id}`,
  location: null,
  imageUrl: null,
  ...extra,
});

describe("ShareFrame", () => {
  test("sign-in and sign-up both come back to the page", () => {
    const html = renderToStaticMarkup(
      <ShareFrame canonicalPath="/tier-lists/abc" cta="Join Cellar Assistant">
        <p>content</p>
      </ShareFrame>,
    );
    assert.match(html, /href="\/sign-in\?returnTo=%2Ftier-lists%2Fabc"/);
    assert.match(html, /href="\/sign-up\?returnTo=%2Ftier-lists%2Fabc"/);
    assert.match(html, />Join Cellar Assistant</);
    // No tab bar: there is no app to navigate yet.
    assert.doesNotMatch(html, /data-slot="tab-bar"/);
  });
});

describe("SharedTierListView", () => {
  const html = renderToStaticMarkup(
    <SharedTierListView
      name="Fridge beers"
      description="What I keep cold"
      listType="beer"
      ownerDisplayName="Riley"
      entries={[
        entry("b", 5, 1),
        entry("a", 5, 0, {
          notes: "crisp",
          imageUrl: "https://files.example/a.jpg",
        }),
        entry("p", 3, 0, { entryType: "PLACE", name: "Corner Bar" }),
        entry("u", 0, 0),
      ]}
      moreCount={2}
    />,
  );

  test("title, author and the bands in board order", () => {
    assert.match(html, />Fridge beers</);
    assert.match(html, />by Riley</);
    assert.match(html, />Beer · ranked</);
    const order = ["Outstanding", "Good", "Unrated"].map((label) =>
      html.indexOf(`aria-label="${label}"`),
    );
    assert.ok(order.every((index) => index >= 0));
    assert.deepEqual(
      [...order].sort((x, y) => x - y),
      order,
    );
  });

  test("derived ranks, notes and photos", () => {
    assert.ok(html.indexOf("Beer a") < html.indexOf("Beer b"));
    assert.match(html, /“crisp”/);
    assert.match(html, /src="https:\/\/files\.example\/a\.jpg"/);
    assert.match(html, />Corner Bar</);
    assert.match(html, /And 2 more/);
  });

  test("nothing to edit, rank or reveal", () => {
    for (const absent of [
      /Arrange/,
      /Add entry/,
      /Insights/,
      /aria-label="Edit/,
    ]) {
      assert.doesNotMatch(html, absent);
    }
  });
});

describe("SharedItemView", () => {
  const props = {
    type: "WINE" as const,
    name: "Ridge Monte Bello",
    description: "Cabernet from the Santa Cruz Mountains.",
    country: "US",
    attributes: {
      vintage: "2016-01-01",
      style: "RED",
      variety: "CABERNET_SAUVIGNON",
      region: "Santa Cruz Mountains",
    },
    imageUrl: null,
    scoreAverage: 4.5,
    scoreCount: 12,
  };
  const html = renderToStaticMarkup(<SharedItemView {...props} />);

  test("name, facts and everyone's score", () => {
    assert.match(html, /Monte Bello/);
    assert.match(html, /2016/);
    assert.match(html, /Santa Cruz Mountains/);
    assert.match(html, /from 12 ratings/);
    assert.match(html, /aria-label="Rated 4\.5 out of 5"/);
  });

  test("the subtitle reads the shared, unaliased style", () => {
    const subtitle = sharedItemSubtitle(
      "BEER",
      { name: "x", country: null },
      { style: "IPA", vintage: null },
    );
    assert.match(subtitle, /ipa/i);
  });

  test("no score line before anyone has rated it", () => {
    const unrated = renderToStaticMarkup(
      <SharedItemView {...props} scoreAverage={null} scoreCount={0} />,
    );
    assert.doesNotMatch(unrated, /ratings? on/);
  });
});

describe("SharedRecipeView", () => {
  const props = {
    name: "Negroni",
    description: null,
    type: "cocktail",
    difficultyLevel: 1,
    prepTimeMinutes: 3,
    servingSize: 1,
    imageUrl: "javascript:alert(1)",
    ingredients: [
      { name: "Campari", quantity: 1, unit: "oz", isOptional: false },
      { name: "Orange peel", quantity: null, unit: null, isOptional: true },
    ],
    instructions: [{ stepNumber: 1, text: "Stir with ice." }],
  };
  const html = renderToStaticMarkup(<SharedRecipeView {...props} />);

  test("ingredients, method and the facts line", () => {
    assert.match(html, />Negroni</);
    assert.match(html, />Cocktail · 3 min · Serves 1</);
    assert.match(html, /Campari/);
    assert.match(html, />1 oz</);
    assert.match(html, /· optional/);
    assert.match(html, />Stir with ice\.</);
  });

  test("a free-text image URL that is not a web URL is never rendered", () => {
    assert.doesNotMatch(html, /javascript:/);
    assert.equal(safeImageUrl("javascript:alert(1)"), null);
    assert.equal(safeImageUrl("not a url"), null);
    assert.equal(
      safeImageUrl("https://img.example/n.jpg"),
      "https://img.example/n.jpg",
    );
  });

  test("amounts: fractions as glyphs, units kept", () => {
    assert.equal(formatAmount(1.5, "oz"), "1½ oz");
    assert.equal(formatAmount(0.25, "cup"), "¼ cup");
    assert.equal(formatAmount(30, "ml"), "30 ml");
    assert.equal(formatAmount(null, "dash"), "dash");
    assert.equal(formatAmount(2, null), "2");
    assert.equal(
      recipeFacts({ type: "food", prepTimeMinutes: null, servingSize: 4 }),
      "Food · Serves 4",
    );
  });
});

describe("invites", () => {
  test("one sentence per state, naming the inviter", () => {
    assert.match(inviteCopy("Riley", "SIGNED_OUT").title, /Riley invited you/);
    assert.match(inviteCopy("Riley", "CAN_ACCEPT").title, /to be friends/);
    assert.match(inviteCopy("Riley", "ALREADY_FRIENDS").title, /already/);
    assert.match(inviteCopy("Riley", "ACCEPTED").title, /are friends/);
    assert.match(inviteCopy("Riley", "OWN_INVITE").title, /your invite link/);
  });

  test("the hero marks a friendship with a check", () => {
    const friends = renderToStaticMarkup(
      <InviteHero name="Riley" avatarUrl={null} state="ACCEPTED" />,
    );
    const pending = renderToStaticMarkup(
      <InviteHero name="Riley" avatarUrl={null} state="CAN_ACCEPT" />,
    );
    assert.match(friends, /bg-success/);
    assert.doesNotMatch(pending, /bg-success/);
  });

  test("the share sheet carries the invite URL", () => {
    assert.deepEqual(inviteShareRequest("https://cellar.example", "tok"), {
      url: "https://cellar.example/invite/tok",
      title: "Join me on Cellar Assistant",
      text: "Add me as a friend on Cellar Assistant:",
    });
  });
});

describe("preview text", () => {
  test("a tier list names its author and top three", () => {
    assert.equal(
      tierListDescription({
        ownerDisplayName: "Riley",
        entries: [
          { band: 5, position: 0, name: "A" },
          { band: 4, position: 0, name: "B" },
          { band: 4, position: 1, name: "C" },
          { band: 3, position: 0, name: "D" },
        ],
      }),
      "A ranked list by Riley: #1 A, #2 B, #3 C.",
    );
    assert.equal(
      tierListDescription({ ownerDisplayName: null, entries: [] }),
      "A ranked list on Cellar Assistant.",
    );
  });

  test("a recipe says what it is made with when it has no description", () => {
    assert.equal(
      recipeDescription({
        description: null,
        ingredients: [{ name: "Gin" }, { name: null }, { name: "Campari" }],
      }),
      "Made with Gin, Campari.",
    );
  });
});
