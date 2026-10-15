"use client";

import {
  type InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { RICH_TEXT_CONTENT } from "./rich-text";

export type RichTextDisplayProps = {
  text: string;
};

/** Lexical's textbox-only attributes, removed (its `...rest` is spread last). */
const NOT_A_TEXTBOX = {
  "aria-readonly": undefined,
  "aria-autocomplete": undefined,
} as const;

/**
 * Read-only review text, through Lexical so its formatting survives.
 *
 * Lexical's `ContentEditable` stays a `textbox` even when the editor is not
 * editable (adding `aria-readonly` and `aria-autocomplete`), which axe reports
 * as an unnamed input (X21) and a screen reader announces as an edit field.
 * Here it is an `article` instead — a review is a self-contained piece of
 * writing — and the textbox-only attributes are dropped (hyphenated `aria-*`
 * props are spread last, so `undefined` removes Lexical's own).
 */
export const RichTextDisplay = ({ text }: RichTextDisplayProps) => {
  return (
    <LexicalComposer
      initialConfig={
        {
          editable: false,
          editorState: text,
        } as InitialConfigType
      }
    >
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className={RICH_TEXT_CONTENT}
            role="article"
            spellCheck={false}
            {...NOT_A_TEXTBOX}
          />
        }
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
    </LexicalComposer>
  );
};
