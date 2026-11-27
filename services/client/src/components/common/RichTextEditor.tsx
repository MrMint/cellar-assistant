"use client";

import {
  type InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import type { EditorState } from "lexical";
import { not } from "ramda";
import { cn } from "@/lib/utils";
import { RICH_TEXT_CONTENT } from "./rich-text";

export type RichTextEditorProps = {
  initialText?: string;
  value?: string;
  placeholder?: string;
  readonly?: boolean;
  onChange: (editorState: string) => void;
};

export const RichTextEditor = ({
  initialText,
  value,
  onChange,
  readonly = false,
  placeholder = "Enter some text...",
}: RichTextEditorProps) => {
  const handleChange = (editorState: EditorState) => {
    onChange(JSON.stringify(editorState));
  };

  // Use value as alias for initialText if provided
  const editorInitialState = value ?? initialText;

  return (
    <LexicalComposer
      initialConfig={
        {
          editable: not(readonly),
          editorState: editorInitialState,
        } as InitialConfigType
      }
    >
      {/* The field's frame: an input's surface, radius and focus ring. */}
      <div
        data-slot="rich-text-editor"
        className="relative rounded-sm border border-input dark:bg-input/30"
      >
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className={cn(
                RICH_TEXT_CONTENT,
                "rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              )}
            />
          }
          placeholder={
            <div className="t-body pointer-events-none absolute top-4 left-4 select-none text-ink-3">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <OnChangePlugin onChange={handleChange} />
      </div>
    </LexicalComposer>
  );
};
