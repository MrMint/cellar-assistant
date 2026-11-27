import { unique } from "../fixtures/data.ts";
import { deletePlace, insertPlace } from "../fixtures/db.ts";
import { expect, test, watch } from "../fixtures/test.ts";

/**
 * X08 · Want to try (D27's Save; D11 revives a place's want_to_visit).
 *
 * One tea (items have no delete, so it outlives the run — the same trade
 * 11-items makes) and **one** place, inserted straight into `places` and
 * deleted at the end, so the run spends nothing of `createPlace`'s daily cap.
 * Every wish the run makes is taken off again in `afterAll`.
 */
test.describe.configure({ mode: "serial" });

let teaId: string;
let teaName: string;
const placeId = crypto.randomUUID();
const placeName = unique("E2 Want Place").replace(/[^A-Za-z0-9 ]/g, " ");
let placeInserted = false;

const SET = `mutation S($target: WantToTryTargetInput!, $on: Boolean!) {
  setWantToTry(target: $target, wantToTry: $on) {
    __typename
    ... on SetWantToTryPayload { wantToTry changed kind key }
    ... on Error { message }
  }
}`;

const LIST = `query L($kinds: [WantToTryKind!]) {
  me { wantToTry(first: 100, kinds: $kinds) {
    totalCount
    edges { node { key kind item { id isWantToTry } place { id } } }
  } }
}`;

type ListAnswer = {
  me: {
    wantToTry: {
      totalCount: number;
      edges: { node: { key: string; kind: string } }[];
    };
  };
};

const keys = (answer: ListAnswer): string[] =>
  answer.me.wantToTry.edges.map((edge) => edge.node.key);

test.afterAll(async ({ api }) => {
  if (teaId !== undefined) {
    await api.query(SET, {
      target: { itemType: "TEA", itemId: teaId },
      on: false,
    });
  }
  if (placeInserted) await deletePlace(placeId);
});

test("fixtures: a tea and one place", async ({ api }) => {
  // Created the way 11-items does it: tea needs no onboarding session.
  const ref = await api.query(
    `query { referenceData(kind: TEA_CATEGORY, first: 1) {
       __typename ... on ReferenceRowConnection { edges { node { value } } }
     } }`,
  );
  const category = ref.referenceData.edges[0]?.node.value;
  expect(category, "no tea categories seeded").toBeTruthy();
  teaName = unique("E2 Want Tea");
  const created = await api.query(
    `mutation C($input: CreateItemInput!, $id: ID) {
       createItem(type: TEA, itemId: $id, input: $input) {
         __typename
         ... on MutationCreateItemSuccess { data { id } }
         ... on Error { message }
       }
     }`,
    {
      id: crypto.randomUUID(),
      input: { name: teaName, tea: { category } },
    },
  );
  expect(
    created.createItem.__typename,
    JSON.stringify(created.createItem),
  ).toBe("MutationCreateItemSuccess");
  teaId = created.createItem.data.id;

  insertPlace({
    id: placeId,
    name: placeName,
    lng: -89.3842,
    lat: 43.0747,
    category: "wine_bar",
  });
  placeInserted = true;
});

test("the API: set is idempotent, the list follows, kinds filter", async ({
  api,
}) => {
  const tea = { itemType: "TEA", itemId: teaId };
  const first = await api.query(SET, { target: tea, on: true });
  expect(first.setWantToTry).toMatchObject({
    __typename: "SetWantToTryPayload",
    wantToTry: true,
    changed: true,
    kind: "ITEM",
    key: `tea:${teaId}`,
  });
  const again = await api.query(SET, { target: tea, on: true });
  expect(again.setWantToTry).toMatchObject({ wantToTry: true, changed: false });

  const items = (await api.query(LIST, { kinds: ["ITEM"] })) as ListAnswer;
  expect(keys(items)).toContain(`tea:${teaId}`);
  const places = (await api.query(LIST, { kinds: ["PLACE"] })) as ListAnswer;
  expect(keys(places)).not.toContain(`tea:${teaId}`);

  // Two targets at once is refused, as a value, not a thrown error.
  const both = await api.query(SET, {
    target: { ...tea, placeId },
    on: true,
  });
  expect(both.setWantToTry.__typename).toBe("ValidationError");

  const off = await api.query(SET, { target: tea, on: false });
  expect(off.setWantToTry).toMatchObject({ wantToTry: false, changed: true });
});

test("Save on the item page, find it on Me › Lists, take it off with Undo", async ({
  primary,
  api,
}) => {
  const noise = watch(primary);
  await primary.goto(`/teas/${teaId}`);
  await expect(primary.getByRole("heading", { name: teaName })).toBeVisible();

  const save = primary.getByRole("button", { name: `Want to try ${teaName}` });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(primary.getByText(`${teaName} is on Want to try`)).toBeVisible();

  // Me › Lists › Want to try.
  await primary.goto("/me");
  await primary.getByRole("link", { name: "Want to try" }).click();
  await expect(primary).toHaveURL(/\/want-to-try$/);
  await expect(
    primary.getByRole("heading", { name: "Want to try" }),
  ).toBeVisible();
  await expect(primary.getByRole("link", { name: teaName })).toBeVisible();

  // Off, then Undo: the row stays put, and the wish is back.
  const rowButton = primary.getByRole("button", {
    name: `Want to try ${teaName}`,
  });
  await rowButton.click();
  await expect(rowButton).toHaveAttribute("aria-pressed", "false");
  await primary.getByRole("button", { name: "Undo" }).click();
  await expect(rowButton).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => keys((await api.query(LIST, {})) as ListAnswer))
    .toContain(`tea:${teaId}`);
  expect(noise.pageErrors).toEqual([]);
});

test("a place: Want to try on its page, a visit takes it off the list", async ({
  primary,
  api,
}) => {
  const noise = watch(primary);
  await primary.goto(`/places/${placeId}`);
  await expect(primary.getByRole("heading", { name: placeName })).toBeVisible();

  const want = primary.getByRole("button", { name: "Want to try" });
  await expect(want).toHaveAttribute("aria-pressed", "false");
  await want.click();
  await expect(want).toHaveAttribute("aria-pressed", "true");
  // The heart is Love now, not Save.
  await expect(primary.getByRole("button", { name: "Love" })).toBeVisible();

  await expect
    .poll(async () =>
      keys((await api.query(LIST, { kinds: ["PLACE"] })) as ListAnswer),
    )
    .toContain(`place:${placeId}`);

  await primary.getByRole("button", { name: "Visited", exact: true }).click();
  await expect(primary.getByText("Taken off Want to try.")).toBeVisible();
  await expect(want).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(async () =>
      keys((await api.query(LIST, { kinds: ["PLACE"] })) as ListAnswer),
    )
    .not.toContain(`place:${placeId}`);
  expect(noise.pageErrors).toEqual([]);
});
