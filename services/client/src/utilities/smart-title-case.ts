/**
 * Smart title case for names a model (or a label) shouted — roadmap N17.
 *
 * Label reads come back in capitals because labels are printed in capitals:
 * `CASTELLO DI MONTEROSSO`, `BLANTON'S SINGLE BARREL`. Stored as-is, that name
 * then shouts from every card, list and breadcrumb. This turns it into
 * `Castello di Monterosso` / `Blanton's Single Barrel`.
 *
 * It only ever touches a name with **no lowercase letter at all** and at least
 * one word long enough not to be an acronym ({@link isShouting}). A name with
 * any lowercase letter was cased by a person (`McHenry`, `d'Arenberg`,
 * `iichiko`) and is returned untouched, so applying this at display time to
 * every name is safe.
 *
 * Two call sites, one function:
 * - **write time** — the onboarding wizard pre-fills the form with the AI's
 *   proposal already cased (`formDefaultsFromOnboarding`), so what the user
 *   confirms, and what is stored, is the cased name; a name the user types is
 *   stored as typed.
 * - **display** — every card, list row, page title and breadcrumb that shows
 *   an item name runs it through {@link displayItemName}, which fixes the
 *   all-caps names already in the database.
 *
 * Pure and dependency-free (server and client modules both import it).
 */

/** Kept in capitals wherever they appear: grades, styles, appellations, units. */
const ACRONYMS = new Set([
  "ABV",
  "AOC",
  "AOP",
  "APA",
  "AVA",
  "BBQ",
  "DIPA",
  "DOC",
  "DOCG",
  "ESB",
  "IGP",
  "IGT",
  "IPA",
  "NEIPA",
  "NV",
  "UK",
  "USA",
  "VDP",
  "VS",
  "VSOP",
  "XO",
  "XXO",
]);

/**
 * Lowercased between other words (never first or last): the joining words of
 * Italian, Spanish, French and English names — `Castello di Monterosso`,
 * `Marqués de Riscal`, `Valley of the Moon`. Articles that start a proper name
 * (`La`, `Le`, `Van`) are deliberately absent: `Château La Nerthe`,
 * `Pappy Van Winkle`.
 */
const PARTICLES = new Set([
  "à",
  "and",
  "au",
  "aux",
  "da",
  "de",
  "degli",
  "dei",
  "del",
  "della",
  "delle",
  "des",
  "di",
  "du",
  "en",
  "et",
  "of",
  "sur",
  "the",
  "y",
]);

/** Roman numerals up to the length a cuvée or a batch name ever uses. */
const ROMAN = /^(?=[IVX])X{0,3}(IX|IV|V?I{0,3})$/;
const ORDINAL = /^\d+(ST|ND|RD|TH)$/i;
// Unicode property escapes need the `u` flag, which the client's `es5`
// `target` refuses in a literal; the runtime (every supported browser) has it.
const LETTER = /\p{L}/u;
const LOWER = /\p{Ll}/u;
const DIGIT = /\p{N}/u;
const NOT_LETTER = /[^\p{L}]/gu;
const NOT_ALNUM = /[^\p{L}\p{N}]/gu;

/**
 * True when `name` is written in capitals throughout: no lowercase letter,
 * and at least one word of four or more letters that is not a known acronym
 * — so `IPA`, `XO` or `ABC` on their own are left alone.
 */
export const isShouting = (name: string): boolean => {
  if (LOWER.test(name)) return false;
  return name.split(/[\s\-/.&,]+/).some((word) => {
    const letters = word.replace(NOT_LETTER, "");
    return Array.from(letters).length >= 4 && !ACRONYMS.has(letters);
  });
};

const capitalize = (word: string): string => {
  const chars = Array.from(word);
  const first = chars.findIndex((char) => LETTER.test(char));
  if (first === -1) return word;
  return (
    chars.slice(0, first).join("") +
    chars[first].toLocaleUpperCase() +
    chars.slice(first + 1).join("")
  );
};

/** One whitespace/hyphen-delimited piece of a name known to be all-caps. */
const caseWord = (word: string, isInner: boolean): string => {
  const bare = word.replace(NOT_ALNUM, "");
  if (bare === "") return word;
  if (ACRONYMS.has(bare) || ROMAN.test(bare)) return word;
  if (DIGIT.test(bare)) {
    return ORDINAL.test(bare) ? word.toLocaleLowerCase() : word;
  }
  const lower = word.toLocaleLowerCase();
  // An initial (`E.` in `E. GUIGAL`) is never a particle.
  if (isInner && !word.includes(".") && PARTICLES.has(lower)) return lower;

  // `O'NEILL` → `O'Neill`, `L'ECOLE` → `L'Ecole`; `MAKER'S` → `Maker's`.
  const apostrophe = lower.search(/['’]/);
  if (apostrophe === 1 && lower.length > 2) {
    return capitalize(lower.slice(0, 2)) + capitalize(lower.slice(2));
  }
  // `MCHENRY` → `McHenry`. (`MAC` is left alone: `Macallan`, not `MacAllan`.)
  if (lower.startsWith("mc") && lower.length > 3) {
    return `Mc${capitalize(lower.slice(2))}`;
  }
  return capitalize(lower);
};

/**
 * `CASTELLO DI MONTEROSSO` → `Castello di Monterosso`. A name that is not
 * {@link isShouting} comes back unchanged.
 */
export const smartTitleCase = (name: string): string => {
  if (!isShouting(name)) return name;
  // Words are separated by whitespace; hyphens and slashes join parts that
  // are each cased (`SAINT-ÉMILION` → `Saint-Émilion`).
  const parts = name.split(/(\s+)/);
  const wordIndexes = parts.flatMap((part, index) =>
    /\S/.test(part) ? [index] : [],
  );
  const firstWord = wordIndexes[0];
  const lastWord = wordIndexes.at(-1);
  return parts
    .map((part, index) => {
      if (!/\S/.test(part)) return part;
      const isInner = index !== firstWord && index !== lastWord;
      return part
        .split(/([-/])/)
        .map((piece, pieceIndex) =>
          piece === "-" || piece === "/"
            ? piece
            : caseWord(piece, isInner && pieceIndex === 0),
        )
        .join("");
    })
    .join("");
};

/**
 * What every surface shows for an item name: the stored name, smart title
 * cased if it was stored in capitals. `null`/`undefined` pass through.
 */
export function displayItemName(name: string): string;
export function displayItemName(
  name: string | null | undefined,
): string | undefined;
export function displayItemName(
  name: string | null | undefined,
): string | undefined {
  if (name === null || name === undefined) return undefined;
  return smartTitleCase(name);
}
