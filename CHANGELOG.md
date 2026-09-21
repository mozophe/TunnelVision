# Changelog

All notable user-facing changes to TunnelVision.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

TunnelVision has no releases or version tags, and doesn't need them: SillyTavern
installs an extension from a repository URL and a branch, so you always get the
current tip rather than a tagged version. This file records the difference between
that tip and the March 2026 snapshot (`da28e58`) this fork's GitHub parent points
at, after the original `Coneja-Chibi/TunnelVision` was taken down.

Those changes came from several people. Each entry below names who built it;
[Credits](README.md#-credits) has the full list with links. The original author's
own development continued until August 2026 and is included here.

Section links point into [README.md](README.md), which explains each feature in full.

## Changes since the March 2026 snapshot

### Added

#### Retrieval

- **[Sidecar LLM](README.md#-sidecar-llm-a-second-set-of-eyes)** *(off)* — a second
  model with its own endpoint, key and format (OpenAI-compatible, Anthropic or
  Google), separate from the chat model. Self-contained: it never borrows the
  SillyTavern connection profile or exposes other API keys. Has a connection test. — *Coneja-Chibi*
- **[Auto-Retrieve Before Generation](README.md#-auto-retrieve-before-generation)**
  *(off)* — the sidecar reads a collapsed view of the channel guide, picks relevant
  nodes and injects their entries before the chat model runs. — *Coneja-Chibi*
- **[Smart Context](README.md#-smart-context-the-pre-roll)** *(off)* — injects
  entries that recent messages mention, using local string matching with alias
  expansion and a recently-injected cooldown. Makes no LLM call. — *Coneja-Chibi*
- **[Rolling World State](README.md#-rolling-world-state-the-station-ident)** *(off)*
  — a single living document of the current scene, recent events, active threads
  and character states, refreshed every N messages and injected every turn. — *Coneja-Chibi*
- **[Narrative Conditionals](README.md#-narrative-conditionals-conditional-channels)**
  *(on)* — eight condition tags on entry keywords (`emotion`, `mood`, `timeOfDay`,
  `location`, `weather`, `activity`, `relationship` and free-form), evaluated
  against the scene during retrieval rather than matched literally. — *Coneja-Chibi*
- **[Embedding Sidecar](README.md#-embedding-sidecar)** *(off)* — a separate
  endpoint for semantic similarity, cached to IndexedDB and recomputed only when
  an entry's content changes. — *Coneja-Chibi*

#### Autonomous writing

- **[Auto-Write After Generation](README.md#-auto-write-after-generation)** *(off)*
  — the sidecar reviews each turn and decides what to remember, update, merge,
  summarize or forget, capped by **Max Operations Per Turn**. — *Coneja-Chibi*
- **[Post-Turn Processor](README.md#-post-turn-processor-the-night-shift)** *(off)*
  — extracts facts and detects scene transitions in one call, archives the scene
  that ended, and updates trackers for mentioned entities. Each step toggles
  independently, with a cooldown. — *Coneja-Chibi*
- **[Memory Lifecycle](README.md#-memory-lifecycle-defragmenting-the-archive)**
  *(off)* — periodic maintenance that consolidates near-duplicates, compresses
  verbose entries and rebalances the tree. — *Coneja-Chibi*
- **[Output Language](README.md#-output-language)** *(auto)* — forces all generated
  content into one language regardless of the conversation's. — *Coneja-Chibi*
- **Summaries collapse the messages they cover** *(on)* — once a scene is
  summarized, the messages it covers are hidden behind it and drop out of the
  prompt while staying readable on screen. Summaries are written as constant
  entries so they always reach the model, the opening and the live scene are kept
  out of them, and a marker is posted in chat at the end of the range covered. — *tobitus*

#### Control and safety

- **[Undo on delete and swipe](README.md#-undo-on-delete--swipe-the-rewind)** *(on)*
  — snapshots every entry a turn is about to touch. Deleting or swiping the message
  deletes entries created that turn, restores entries it modified, and puts the tree
  back. Snapshots persist in chat metadata, surviving reload and chat switches;
  the last 20 turns are kept. — *mozophe*
- **[Per-lorebook permissions](README.md#-per-lorebook-permissions--injection-modes)**
  *(Read + Write)* — Read + Write, Read Only or Write Only, set per lorebook. — *Coneja-Chibi*
- **[Per-lorebook injection modes](README.md#-per-lorebook-permissions--injection-modes)**
  *(Sidecar)* — Sidecar (TunnelVision gates delivery) or Native (SillyTavern handles
  injection at its own outlets, while the tools can still read and write). — *Coneja-Chibi*
- **[SECRET tags](README.md#-secret-tags-dramatic-irony)** *(on)* — `[SECRET — <who>
  is unaware]` marks information a character has not yet learned; write tools apply
  the tag and remove it once the story establishes they know. A storytelling device,
  not access control — tagged content is still sent to the model and provider. — *mozophe*
- **Constant-entry protection** — entries marked constant are never rewritten or
  removed by any autonomous path. — *Coneja-Chibi*

#### Interface and workflow

- **[Create Chat Lorebook](README.md#step-2-set-up-a-chat-)** — one button creates a
  lorebook, attaches it to the open chat, enables TunnelVision for it and selects
  it. Offers to bring in the character's own lorebooks read-only, and to build
  their trees, marking any that already have one. — *mozophe*
- **[Color themes](README.md#-color-themes-adjusting-the-picture)** *(TunnelVision
  pink)* — keep the original palette, follow the active SillyTavern theme, or pin
  TunnelVision to any installed SillyTavern theme. — *J3tze*
- **[Mobile tree editor](README.md#-the-tree-editor-on-mobile)** — a **Move to…**
  button on every entry row, so category assignment no longer requires
  drag-and-drop. The sidebar collapses below 768px and the panel takes the full
  height. — *mozophe*
- **[Chat Ingest reads hidden messages](README.md#-chat-ingest)** *(off)* — an
  **Include hidden messages** toggle, image and video skipping, and a live count
  of what will be read. — *mozophe*
- **`/tv-*` slash commands** — `/tv-search`, `/tv-remember`, `/tv-summarize`,
  `/tv-forget`, `/tv-merge`, `/tv-split`, `/tv-ingest` and `/tv-dedupe`, alongside
  the existing `!command` prefix syntax. — *Coneja-Chibi*
- **[Token housekeeping](README.md#-token-housekeeping)** — compact tool prompts,
  ephemeral tool results, selective retrieval, a combined injection budget, and a
  toggle to hide tool-call messages from the chat log. — *Coneja-Chibi*
- **Rolling world state, smart context, memory lifecycle and post-turn processor
  became configurable from the UI** — the subsystems existed but had no settings
  exposed, so they could not be turned on or tuned without editing code. — *DrMagisto*
- **The advanced settings panel is navigable** — collapsible sections and
  categories, a filter box with a clear button, and a home for the sections that
  belonged nowhere. — *tobitus*

### Changed

- **Lorebook selection is per chat.** It now lives in `chat_metadata` rather than
  being one global setting, with a one-time migration of the legacy value. — *mozophe*
- **The sidecar replaced connection profiles.** The `connectionProfile` setting is
  gone; background LLM calls use the sidecar's own configuration. — *mozophe*
- **Duplicate detection compares by meaning when an Embedding Sidecar is set up,**
  falling back to trigrams otherwise, and **On duplicate** can now decline the
  write and tell the AI to update instead of always saving. — *mozophe*
- **Stopping generation cancels sidecar retrieval,** with the stop button revealed
  during retrieval and the main request cancelled through the generate interceptor. — *mozophe*
- **OOC turns read but never write.** A message marked out-of-character still gets
  full retrieval, but write tools are stripped and every post-turn writer skips it. — *mozophe*

### Fixed

- **Swipes are memorized.** The writer previously reverted the old reply's memories
  without running for the new one, leaving the turn with no memory at all. It now
  runs on swipes, discards its output if the message changed mid-run, and re-runs
  for a swipe that lands mid-run. — *mozophe*
- **Lorebook writes stranded by deletion are reverted.** The revert pass only ran on
  SillyTavern's delete event, so `/cut`, a missed event, or a delete while the
  extension was unloaded left updated entries changed forever. It now also runs on
  chat load, and the writer stops committing if its snapshot is reverted mid-run. — *mozophe*
- **The lorebook list refreshes without a page reload,** as does the Chat Ingest
  section after enabling a lorebook. Auto-detect help text shows `{{char}}` again. — *mozophe*
- **OpenRouter calls no longer carry the user's SillyTavern origin header.** — *mozophe*
- **Transient sidecar timeouts no longer disable the sidecar for the session.** — *mozophe*
- **A batch of eight fixes** across `tool_choice` double-wrapping, slash commands,
  the post-turn processor, imports and auto-hide; plus skipping tool-format
  conversion on SillyTavern's native Claude backend, which was being converted
  when it should have been passed through. — *erratos*
- **Staging-compat regressions** in swipe detection, snapshotting and the
  background-task lifecycle. — *DrMagisto*
- **The static-entry guard is honoured on lifecycle and post-turn writes,** which
  had bypassed it and could rewrite constant entries. — *tobitus*
- **Remember deduplicates on meaning rather than character overlap,** and the
  sidecar accepts an empty API key for local endpoints that don't need one. — *tobitus*
- **The floating button renders correctly on mobile viewports.** — *phampyk*
- **The mobile stylesheet actually applies.** Its media query sat above the rules it
  targeted, so 33 declarations were silently losing to them — the sidebar never hid
  and inputs stayed at 13px, making iOS zoom on every tap. — *mozophe*
