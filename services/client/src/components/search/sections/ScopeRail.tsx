"use client";

import { useEffect, useRef } from "react";
import { Link } from "@/components/app/Link";
import { pressFeedback } from "@/components/app/overlays/press";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import {
  allResultsHref,
  SEARCH_SECTIONS,
  SECTION_LABELS,
  type SearchSection,
  scopeHref,
} from "../universal-search";

/**
 * The scope chips under the field (Recipes-Search 08, 15, 26): All, then
 * the six sections; the lit one is where you are looking. Each is a link,
 * so a scope can be shared and Back undoes it; 44 tall (KIT § 2 chips), the
 * rail scrolls sideways on a phone and keeps the lit chip in view. Desktop
 * adds each section's total after its name (desk-03) when it is known.
 */
export function ScopeRail({
  query,
  focus,
  counts = [],
  className,
}: {
  query: string;
  focus: SearchSection | null;
  counts?: readonly { section: SearchSection; label: string }[];
  className?: string;
}) {
  const lit = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    lit.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, []);

  // With counts in hand, only the sections that found something are offered,
  // and the opened one, so its lit chip is there even when it found nothing.
  const sections =
    counts.length > 0
      ? SEARCH_SECTIONS.filter(
          (section) =>
            section === focus ||
            counts.some((count) => count.section === section),
        )
      : SEARCH_SECTIONS;

  const chip = (on: boolean) =>
    cn(
      "t-head inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1.5 rounded-md border px-3.5 transition-transform duration-(--ca-dur-micro) ease-standard active:scale-97 motion-reduce:active:scale-100",
      on ? "border-edge-2 bg-sel text-ink" : "border-edge text-ink-2",
    );
  const press = pressFeedback();

  return (
    <nav
      aria-label="Look in"
      data-search-scopes
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0",
        className,
      )}
    >
      <Link
        href={query === "" ? "/search" : allResultsHref(query)}
        underline="none"
        aria-current={focus === null ? "page" : undefined}
        ref={focus === null ? lit : undefined}
        className={chip(focus === null)}
        {...press}
        onClick={() => feedback("tick")}
      >
        All
      </Link>
      {sections.map((section) => {
        const count = counts.find((entry) => entry.section === section);
        return (
          <Link
            key={section}
            href={scopeHref(section, query)}
            underline="none"
            aria-current={focus === section ? "page" : undefined}
            ref={focus === section ? lit : undefined}
            className={chip(focus === section)}
            {...press}
            onClick={() => feedback("tick")}
          >
            {SECTION_LABELS[section]}
            {count !== undefined && (
              <span className="t-cap tabular hidden text-ink-2 md:inline">
                {count.label}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
