/**
 * The content parts (F2b): their pure helpers, and the one class each part
 * promises (gold only for the owner's verdict, ink-2 for everyone else's).
 * Markup only: interaction is the kit page's to show.
 *
 *   bun test --isolate src/components/app/parts
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { initialsOf } from "../UserAvatar";
import { barShares } from "./Chart";
import { countLine } from "./CountStrip";
import { parseDecimal } from "./Field";
import { HistoryList, HistoryRow } from "./HistoryRow";
import { BANDS, bandName, RankChip } from "./Rank";
import { bandAt, bandStarts, indexAtFraction } from "./Scrubber";
import { formatKitScore, PublicRating, Stars } from "./Stars";
import { StatTile } from "./StatTile";

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe("Stars", () => {
  test("the owner's stars are gold; someone else's are ink-2", () => {
    assert.match(html(<Stars value={4} />), /text-gold/);
    const other = html(<Stars value={4} tone="other" />);
    assert.match(other, /text-ink-2/);
    assert.doesNotMatch(other, /text-gold/);
  });
  test("named as a sentence, filled by fraction", () => {
    const m = html(<Stars value={3.5} />);
    assert.match(m, /role="img"/);
    assert.match(m, /data-fraction="0.5"/);
  });
  test("one decimal for the score", () => {
    assert.equal(formatKitScore(4), "4.0");
    assert.equal(formatKitScore(4.25), "4.3");
  });
  test("public rating: value and count, nothing when unrated", () => {
    const m = html(<PublicRating value={4.7} count={240} />);
    assert.match(m, /4.7/);
    assert.match(m, /\(240\)/);
    assert.equal(html(<PublicRating value={null} count={0} />), "");
  });
});

describe("Rank", () => {
  test("five bands, best first, in the kit's words", () => {
    assert.deepEqual(
      BANDS.map((b) => b.name),
      ["Outstanding", "Very Good", "Good", "Mediocre", "Bad"],
    );
    assert.equal(bandName(3), "Good");
  });
  test("a rank chip says its band to a reader; the crown only on #1", () => {
    const m = html(<RankChip rank={1} band={5} crown />);
    assert.match(m, /#?1/);
    assert.match(m, /Outstanding/);
    assert.match(m, /text-gold/);
    assert.doesNotMatch(html(<RankChip rank={6} band={4} />), /text-gold/);
  });
});

describe("Scrubber helpers", () => {
  const bands = [
    { band: 5, count: 2 },
    { band: 4, count: 0 },
    { band: 3, count: 3 },
  ] as const;
  test("bandAt: which band holds a rank", () => {
    assert.equal(bandAt(bands, 0), 5);
    assert.equal(bandAt(bands, 1), 5);
    assert.equal(bandAt(bands, 2), 3);
    assert.equal(bandAt(bands, 99), 3);
  });
  test("bandStarts skips empty bands", () => {
    assert.deepEqual(bandStarts(bands), [0, 2]);
  });
  test("indexAtFraction clamps to the rail", () => {
    assert.equal(indexAtFraction(5, -1), 0);
    assert.equal(indexAtFraction(5, 0.5), 2);
    assert.equal(indexAtFraction(5, 1), 4);
    assert.equal(indexAtFraction(0, 0.5), 0);
  });
});

describe("Field", () => {
  test("a decimal takes a comma or a point", () => {
    assert.equal(parseDecimal("8,2"), 8.2);
    assert.equal(parseDecimal(" 6.25 "), 6.25);
    assert.equal(parseDecimal("8."), null);
    assert.equal(parseDecimal("abc"), null);
  });
});

describe("Count strip", () => {
  test("how many, in what order, and how many match", () => {
    assert.equal(countLine(240, "bottles", "A–Z"), "240 bottles · A–Z");
    assert.equal(
      countLine(1240, "bottles", "A–Z", 12),
      "12 of 1,240 bottles · A–Z",
    );
  });
});

describe("Chart", () => {
  test("bar shares are fractions of the tallest; zeros stay zero", () => {
    assert.deepEqual(barShares([0, 2, 4]), [0, 0.5, 1]);
    assert.deepEqual(barShares([0, 0]), [0, 0]);
  });
});

describe("Avatar initials", () => {
  test("two letters, first and last word; one for a single word", () => {
    assert.equal(initialsOf("Maya Chen"), "MC");
    assert.equal(initialsOf("Omar  Haddad"), "OH");
    assert.equal(initialsOf("Test"), "T");
  });
});

describe("History and stats", () => {
  test("the owner's row is gold; others are glyph", () => {
    const m = html(
      <HistoryList>
        <HistoryRow glyph={<svg />} date="Mar 3" owner>
          You rated it
        </HistoryRow>
      </HistoryList>,
    );
    assert.match(m, /<ol/);
    assert.match(m, /text-gold/);
  });
  test("a stat tile is the number in t-score over its label", () => {
    const m = html(<StatTile value="240" label="Bottles" />);
    assert.match(m, /t-score[^>]*>240/);
    assert.match(m, /Bottles/);
  });
});
