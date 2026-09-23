# Changelog

What this fork adds on top of
[Coneja-Chibi/TunnelVision](https://github.com/Coneja-Chibi/TunnelVision) `main`
(`a01d7ee`). Everything else in this repository came from there.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
TunnelVision has no releases or version tags: SillyTavern installs an extension
from a repository URL and a branch, so you always get the current tip.

Most of these are open as pull requests upstream; the link is on each entry.
Section links point into [README.md](README.md), which explains each feature in full.

## Changes since upstream `a01d7ee`

### Added

- **[Create Chat Lorebook](README.md#step-2-set-up-a-chat-)**
  ([#61](https://github.com/Coneja-Chibi/TunnelVision/pull/61)) — setting up a chat
  took four steps across two panels: create a lorebook, attach it to the chat,
  enable TunnelVision for it, select it. One button now does all four. It offers to
  bring in the character's own lorebooks read-only and build their trees, marking
  any that already have one.
- **[Mobile tree editor](README.md#-the-tree-editor-on-mobile)**
  ([#51](https://github.com/Coneja-Chibi/TunnelVision/pull/51)) — assigning an entry
  to a category needed drag-and-drop, which doesn't fire on a phone. Every entry row
  now has a **Move to…** button, the sidebar collapses below 768px and the panel
  takes the full height.
- **[Chat Ingest reads hidden messages](README.md#-chat-ingest)** *(off)*
  ([#59](https://github.com/Coneja-Chibi/TunnelVision/pull/59)) — messages hidden
  from context, often the oldest ones, were always skipped, so they could never be
  ingested. An **Include hidden messages** toggle reads them; images and videos are
  skipped, and a live count shows what will be read.

### Changed

- **[SECRET tags](README.md#-secret-tags-dramatic-irony) list who knows, not who
  doesn't.** The model drifted from `[SECRET — X is unaware]` to `[SECRET — X is
  aware]`, and the guard then silenced the one character who knew. Tags now read
  `[SECRET — known to: A, B]` (anyone unlisted is unaware), with `hidden from:` for
  the rare case where nearly everyone knows. Existing `is unaware` tags keep working.

### Fixed

- **[Swipes are memorized](README.md#-undo-on-delete--swipe-the-rewind)**
  ([#50](https://github.com/Coneja-Chibi/TunnelVision/pull/50)). A swipe reverted
  the old reply's memories but never ran the writer for the new one, leaving the
  turn with no memory at all. It now runs on swipes, discards its output if the
  message changed mid-run, and re-runs for a swipe that lands mid-run.
- **Lorebook writes stranded by deletion are reverted.** The revert pass only ran on
  SillyTavern's delete event, so `/cut`, a missed event, or a delete while the
  extension was unloaded left updated entries changed forever. It now also runs on
  chat load, and the writer stops committing if its snapshot is reverted mid-run.
- **The lorebook list refreshes without a page reload**
  ([#60](https://github.com/Coneja-Chibi/TunnelVision/pull/60)), as does the Chat
  Ingest section after enabling a lorebook — new, imported or renamed lorebooks
  used to be missing until reload. Auto-detect help text shows `{{char}}` again
  instead of the current character's name.
- **The mobile stylesheet actually applies**
  ([#51](https://github.com/Coneja-Chibi/TunnelVision/pull/51)). Its media query sat
  above the rules it targeted, so 33 declarations were silently losing to them —
  the sidebar never hid and inputs stayed at 13px, making iOS zoom on every tap.

## Merged upstream

Work from this fork that is now in upstream `main`, so it isn't listed above.

- **2026-08-20** — [#49](https://github.com/Coneja-Chibi/TunnelVision/pull/49) OpenRouter calls no longer carry the user's
  SillyTavern origin header.
- **2026-08-20** — [#48](https://github.com/Coneja-Chibi/TunnelVision/pull/48) OOC turns read the lorebook but never write to it.
- **2026-08-20** — [#46](https://github.com/Coneja-Chibi/TunnelVision/pull/46) Stopping generation cancels a sidecar retrieval
  and stops the reply with it.
- **2026-07-28** — [#39](https://github.com/Coneja-Chibi/TunnelVision/pull/39) SECRET tags name the character who doesn't know,
  not the one the entry is about.
- **2026-07-20** — [#33](https://github.com/Coneja-Chibi/TunnelVision/pull/33) The sidecar no longer latches off after a transient
  failure, and a swipe no longer feeds the rejected reply into retrieval.
- **2026-07-18** — [#32](https://github.com/Coneja-Chibi/TunnelVision/pull/32) SECRET tags: mark lorebook information some
  characters don't know, so the AI writes around it.
- **2026-07-14** — [#31](https://github.com/Coneja-Chibi/TunnelVision/pull/31) Self-contained sidecar and embedding config
  (replacing connection profiles), per-chat lorebook selection, resilient undo and
  cleanup of sidecar writes, activity feed fixes, and dedup improvements.
