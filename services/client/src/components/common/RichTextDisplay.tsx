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
        contentEditable={<ContentEditable className={RICH_TEXT_CONTENT} />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
    </LexicalComposer>
  );
};
