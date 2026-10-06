/**
 * One shape for what a scan reports, and one way to fail on it.
 *
 * A finding names a place (`file:line`, relative to the project root), the
 * rule it breaks, and a message that says what to do about it. Scans return
 * arrays of these; a test asserts there are none with
 * {@link assertNoFindings}, whose failure message is the list itself — one
 * line per finding, clickable in a terminal — rather than a deep-equal diff
 * of objects.
 */
import type ts from "typescript";
import { relativePath } from "./files.ts";
import type { Project } from "./project.ts";

export type Finding = {
  /** Relative to the project root, `/`-separated. */
  readonly file: string;
  /** 1-based. */
  readonly line: number;
  /** A short, stable rule id: `outbox/unreadable-reference`. */
  readonly rule: string;
  readonly message: string;
};

/** 1-based line of `node`'s first token. */
export const lineOf = (node: ts.Node): number => {
  const source = node.getSourceFile();
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
};

/** `node`'s source text, first line only, trimmed. */
export const firstLineOf = (node: ts.Node | undefined): string =>
  node === undefined
    ? "<missing>"
    : (node.getText(node.getSourceFile()).split("\n")[0]?.trim() ?? "");

/** A finding at `node`, with the file relative to `project.root`. */
export const findingAt = (
  project: Pick<Project, "root">,
  node: ts.Node,
  rule: string,
  message: string,
): Finding => ({
  file: relativePath(project.root, node.getSourceFile().fileName),
  line: lineOf(node),
  rule,
  message,
});

/** Sorted by file, line, rule. */
export const sortFindings = (findings: readonly Finding[]): Finding[] =>
  [...findings].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.rule.localeCompare(b.rule),
  );

/** One line per finding: `file:line [rule] message`. */
export const formatFindings = (findings: readonly Finding[]): string =>
  sortFindings(findings)
    .map((f) => `  ${f.file}:${f.line} [${f.rule}] ${f.message}`)
    .join("\n");

/**
 * Throws if there are any findings, with every one of them in the message.
 * `advice`, if given, follows the list — say how to fix the class of problem
 * once rather than in every message.
 */
export const assertNoFindings = (
  findings: readonly Finding[],
  advice?: string,
): void => {
  if (findings.length === 0) return;
  const count = `${findings.length} finding${findings.length === 1 ? "" : "s"}`;
  throw new Error(
    [
      `${count}:`,
      formatFindings(findings),
      ...(advice ? ["", advice] : []),
    ].join("\n"),
  );
};
