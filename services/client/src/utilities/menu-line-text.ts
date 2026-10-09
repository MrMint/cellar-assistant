/**
 * How a menu line's text reads on a phone (X07).
 *
 * A menu is typeset, and the vision read keeps its typesetting: names in
 * capitals (`OLD FASHIONED`), small caps flattened to capitals, a whole list
 * in lower case for style (`negroni`), or a mix in one line — `OLD FASHIONED —
 * Buffalo Trace, demerara`. Shown as read, the list shouts in places and
 * whispers in others.
 *
 * `smartTitleCase` (N17) only touches a name with no lowercase letter at
 * all, which is right for a bottle name and wrong for a menu line, whose
 * name and ingredients are often cased differently. So this decides **per
 * segment** — the runs between a dash, comma, bullet, pipe or colon:
 *
 * - a segment in capitals throughout, with a word of three or more letters
 *   that is not a known acronym, is title-cased (`GIN` → `Gin`, but `IPA`,
 *   `XO` and `VSOP` stay as they are);
 * - a segment with no capital at all is title-cased too (`negroni` →
 *   `Negroni`, `buffalo trace` → `Buffalo Trace`);
 * - a segment with both was cased by a person and is left alone
 *   (`McHenry`, `d'Arenberg`, `Château La Nerthe`).
 *
 * Whitespace runs collapse to one space. Pure; tested in
 * `menu-line-text.test.ts`.
 */
import { titleCaseWords } from "./smart-title-case";

/** A dash with space around it, or a comma/bullet/pipe/colon/semicolon. */
const SEPARATOR = /(\s+[-–—]\s+|\s*[,·•|:;]\s*)/;

// Case, not `\p{L}` (the client's `es5` target refuses the `u` flag) — the
// same reading `smart-title-case.ts` uses: a letter is a character whose two
// cases differ.
const isLetter = (char: string): boolean =>
  char.toLowerCase() !== char.toUpperCase();
const isLower = (char: string): boolean =>
  isLetter(char) && char !== char.toUpperCase();
const isUpper = (char: string): boolean =>
  isLetter(char) && char !== char.toLowerCase();

/** Kept in capitals: grades and styles a menu prints as such. */
const ACRONYMS = new Set([
  "ABV",
  "AOC",
  "APA",
  "AVA",
  "BBQ",
  "DIPA",
  "DOC",
  "DOCG",
  "ESB",
  "IGT",
  "IPA",
  "NEIPA",
  "NV",
  "UK",
  "USA",
  "VS",
  "VSOP",
  "XO",
  "XXO",
]);

const lettersOf = (word: string): string =>
  Array.from(word).filter(isLetter).join("");

/** Capitals throughout, and at least one real word in them. */
const shouts = (segment: string): boolean => {
  const chars = Array.from(segment);
  if (chars.some(isLower) || !chars.some(isUpper)) return false;
  return segment.split(/[\s\-/.&]+/).some((word) => {
    const letters = lettersOf(word);
    return Array.from(letters).length >= 3 && !ACRONYMS.has(letters);
  });
};

/** No capital letter at all, and some letter to case. */
const whispers = (segment: string): boolean => {
  const chars = Array.from(segment);
  return chars.some(isLower) && !chars.some(isUpper);
};

const caseSegment = (segment: string): string => {
  if (shouts(segment)) return titleCaseWords(segment);
  // Upper-cased first, so the acronyms in it are recognised (`ipa` → `IPA`).
  if (whispers(segment)) return titleCaseWords(segment.toUpperCase());
  return segment;
};

/**
 * `OLD FASHIONED — Buffalo Trace, demerara` →
 * `Old Fashioned — Buffalo Trace, Demerara`.
 */
export const menuLineText = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .split(SEPARATOR)
    .map((part, index) => (index % 2 === 1 ? part : caseSegment(part)))
    .join("");

/**
 * A menu price as the menu printed it: `14`, `14.50`. No currency symbol —
 * the read does not record one, and a "$" on a menu in pounds or euros would
 * be a fact the app made up.
 */
export const formatMenuPrice = (price: number): string =>
  Number.isInteger(price) ? String(price) : price.toFixed(2);
