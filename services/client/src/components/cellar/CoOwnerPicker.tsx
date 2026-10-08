"use client";

import { useCommandState } from "cmdk";
import { type ReactNode, useState } from "react";
import { Check, ChevronDown } from "@/components/app/icons";
import { UserAvatar } from "@/components/app/UserAvatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Friend = { id: string; displayName: string; avatarUrl: string };

/**
 * The search field's matcher: a friend's name contains what was typed, case
 * aside. Each item's cmdk `value` is the friend's id (names need not be
 * unique), and cmdk's default fuzzy filter scores that id too — a uuid holds
 * most short runs of a-f in order, so "ca" kept nine friends in ten. Only the
 * `keywords` (the display name) are matched here.
 */
export function matchFriendName(
  _value: string,
  search: string,
  keywords: readonly string[] = [],
): number {
  const needle = search.trim().toLocaleLowerCase();
  if (needle === "") return 1;
  return keywords.some((keyword) =>
    keyword.toLocaleLowerCase().includes(needle),
  )
    ? 1
    : 0;
}

export type CoOwnerPickerProps = {
  /** The trigger's id, for the field's `<label htmlFor>`. */
  id?: string;
  friends: readonly Friend[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * The cellar form's "Co-Owners": the Joy multi-`Select` (one option per
 * friend, avatar beside the name) as a combobox over a checkable list
 * (`ui/command` in `ui/popover`), since `ui/select` picks one value only.
 *
 * Same behaviour: any number of friends on at once, tapping one toggles it,
 * the trigger lists who is chosen. A search field sits over the list — the
 * old listbox could only be scrolled.
 */
export function CoOwnerPicker({
  id,
  friends,
  value,
  onChange,
  onBlur,
  disabled = false,
  placeholder,
}: CoOwnerPickerProps) {
  const [open, setOpen] = useState(false);
  const chosen = friends.filter((friend) => value.includes(friend.id));

  const toggle = (friendId: string) =>
    onChange(
      value.includes(friendId)
        ? value.filter((x) => x !== friendId)
        : [...value, friendId],
    );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onBlur?.();
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          data-slot="co-owner-picker"
          className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-sm border border-input bg-transparent px-3 py-1.5 text-left text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm dark:bg-input/30"
        >
          {chosen.length === 0 ? (
            <span className="min-w-0 flex-1 truncate text-ink-3">
              {placeholder}
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="flex shrink-0 -space-x-2">
                {chosen.map((friend) => (
                  <UserAvatar
                    key={friend.id}
                    avatarUrl={friend.avatarUrl}
                    displayName={friend.displayName}
                    size="sm"
                    className="ring-2 ring-background"
                  />
                ))}
              </span>
              <span className="min-w-0 truncate text-ink-1">
                {chosen.map((friend) => friend.displayName).join(", ")}
              </span>
            </span>
          )}
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
      >
        <Command filter={matchFriendName}>
          <CommandInput placeholder="Search friends" />
          <FriendOptions>
            <CommandGroup>
              {friends.map((friend) => {
                const selected = value.includes(friend.id);
                return (
                  <CommandItem
                    key={friend.id}
                    value={friend.id}
                    keywords={[friend.displayName]}
                    aria-checked={selected}
                    data-checked={selected ? "" : undefined}
                    onSelect={() => toggle(friend.id)}
                    className="min-h-11"
                  >
                    <UserAvatar
                      avatarUrl={friend.avatarUrl}
                      displayName={friend.displayName}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {friend.displayName}
                    </span>
                    <Check
                      aria-hidden
                      className={cn(
                        "size-4 text-ink-1",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </FriendOptions>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The listbox, hidden while nothing matches. cmdk keeps an empty `listbox`
 * in the tree when the search (or a friendless viewer) leaves no option, and
 * a listbox that owns no option is axe's `aria-required-children` (serious) —
 * measured on the lane by searching "zzzz". "No friends found." sits beside
 * it, inside the `Command`, which is all cmdk's `Empty` needs.
 */
function FriendOptions({ children }: { children: ReactNode }) {
  const empty = useCommandState((state) => state.filtered.count === 0);
  return (
    <>
      <CommandEmpty>No friends found.</CommandEmpty>
      <CommandList aria-label="Co-Owners" hidden={empty}>
        {children}
      </CommandList>
    </>
  );
}
