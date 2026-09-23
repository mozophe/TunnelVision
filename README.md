# 🔭📺 TunnelVision: Your AI Gets Its Own TV 📺🔭

*Stop making your AI guess what to remember. Give it a remote control and let it browse.* 🐰

[![Status: Active Development](https://img.shields.io/badge/Status-Active%20Development-blueviolet.svg)](https://github.com/Coneja-Chibi/TunnelVision)
[![SillyTavern Extension](https://img.shields.io/badge/SillyTavern-Extension-blue.svg)](https://docs.sillytavern.app/)
[![BunnyMo Compatible](https://img.shields.io/badge/BunnyMo-Compatible-pink.svg)](https://docs.sillytavern.app/)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-green.svg)](LICENSE)

*A [RoleCall](https://github.com/Coneja-Chibi) project, built for the SillyTavern community as a proof of concept.* 🐇

---

> ⚠️ **This is a fork** of [Coneja-Chibi/TunnelVision](https://github.com/Coneja-Chibi/TunnelVision).
> The original concept and architecture are Coneja-Chibi's, as is much of the
> prose below. The features, settings and troubleshooting documented since have
> come from several [contributors](#-credits). See
> [What This Fork Changes](#-what-this-fork-changes).

## 📑 Contents

**Start here:** [Installation & Setup](#-installation--setup) · [Settings Reference](#-settings-reference) · [Common Issues](#-common-issues) · [Changelog](CHANGELOG.md)

| | |
|---|---|
| [🆕 What This Fork Changes](#-what-this-fork-changes) | What differs from upstream |
| [💡 The Core Thesis](#-the-core-thesis) | Why active retrieval beats injection |
| [📺 What the Hell is TunnelVision?](#-what-the-hell-is-tunnelvision) | The pitch |
| [🧠 Why This is Better](#-why-this-is-better-the-memory-problem) | The memory problem |
| [🆚 But What About RAG?](#-but-what-about-rag) | How this differs from vector search |
| [📡 How the Broadcast Works](#-how-the-broadcast-works) | The tree index, search modes, the 8 tools |
| [📺 The Broadcast Flow](#-the-broadcast-flow-under-the-hood) | A turn, step by step |
| [🔥 Features](#-features) | Everything, grouped by what it does |
| [🚀 Installation & Setup](#-installation--setup) | Get running |
| [⚙️ Settings Reference](#-settings-reference) | Every setting in the panel |
| [🔧 Common Issues](#-common-issues) | When it isn't working |
| [🏗️ Architecture](#-architecture-for-the-curious) | Module map |
| [🤝 Compatibility](#-compatibility) | Other extensions |

---

## 🆕 What This Fork Changes

On top of [Coneja-Chibi/TunnelVision](https://github.com/Coneja-Chibi/TunnelVision)
`main`. **[CHANGELOG.md](CHANGELOG.md)** has the details and upstream PR links.

- **[Create Chat Lorebook](#step-2-set-up-a-chat-)** — one-click chat setup: it
  creates a lorebook, attaches it to the chat, enables TunnelVision for it and
  selects it.
- **[Tree editor on a phone](#-the-tree-editor-on-mobile)** — a **Move to…**
  button replaces drag-and-drop, and the sidebar collapses on narrow screens.
- **[Chat Ingest reads hidden messages](#-chat-ingest)** *(off)* — an option to
  ingest messages hidden from context, skipping images and videos.
- **[SECRET tags](#-secret-tags-dramatic-irony) list who knows**, not who doesn't,
  so the guard no longer silences the one character in on it.
- **Fixes:** swipes are memorized; lorebook writes stranded by a deleted message
  are reverted; the lorebook list refreshes without a page reload; the mobile
  stylesheet actually applies.

Already merged upstream from this fork:

- **Self-contained sidecar and embedding config, per-chat lorebook selection,
  resilient undo and cleanup, activity feed and dedup improvements**
  ([#31](https://github.com/Coneja-Chibi/TunnelVision/pull/31))
- **SECRET tags** ([#32](https://github.com/Coneja-Chibi/TunnelVision/pull/32)), and naming the right character in them
  ([#39](https://github.com/Coneja-Chibi/TunnelVision/pull/39))
- **The sidecar no longer latches off after a transient failure**, and swipes no
  longer leak the rejected reply into retrieval ([#33](https://github.com/Coneja-Chibi/TunnelVision/pull/33))
- **Stopping a sidecar retrieval stops the reply with it** ([#46](https://github.com/Coneja-Chibi/TunnelVision/pull/46))
- **OOC turns read the lorebook but never write to it** ([#48](https://github.com/Coneja-Chibi/TunnelVision/pull/48))
- **OpenRouter calls no longer carry the user's SillyTavern origin** ([#49](https://github.com/Coneja-Chibi/TunnelVision/pull/49))

---

## 💡 The Core Thesis

> **When an AI has to make the active effort to retrieve information, to decide what it needs, go find it, and bring it back, it uses that information better.**

Think about it. When RAG silently injects context into the prompt, the AI doesn't even know where it came from. It's just *there*. But when TunnelVision makes the AI *ask for* information, when it has to reason about what's relevant, navigate to it, and consciously retrieve it, the AI treats that information as something it *actively sought out*. It pays more attention. It integrates it more deliberately into its response. It's the difference between someone handing you a textbook page and you going to the library because you *needed* to know something.

That's the philosophy. Your AI should *think* about what it knows, not just have things shoved into its context window and hope for the best. 🧠

---

## 📺 What the Hell is TunnelVision?

You're paying for an intelligent AI. Claude, GPT-4, Gemini. These models can *reason*, *plan*, and *understand context*. So why the hell are you still using **dumb keyword matching** to decide what your AI gets to read? 💀

SillyTavern's default lorebook system works like a search bar. You type "Yuki" → the entry with "Yuki" as a keyword fires. Simple. Dumb. Brittle. What if the conversation is *about* Yuki but nobody said her name? What if the AI needs her backstory because Ren just mentioned "that girl from the academy," but "that girl from the academy" isn't a keyword? Too bad. Entry doesn't fire. Your AI writes Yuki completely wrong. 🤬

**TunnelVision flips the entire model.**

Instead of YOU setting up keywords and praying they trigger at the right time, TunnelVision gives your AI a **TV guide** (a structured channel listing of everything in your lorebook) and hands it the **remote control**. The AI *browses the channels*, *picks what's relevant*, and *tunes in* to exactly the information it needs for the current scene.

> *"Your AI doesn't Ctrl+F anymore. It picks up the remote and changes the channel."* 📺🐰

**The result?** Your lorebook entries activate when they're *contextually relevant*, not just when someone says the magic word. Characters get remembered when the conversation naturally involves them. World details surface when the plot actually needs them. The AI you're already paying for finally gets to use its intelligence for retrieval too.

---

## 🧠 Why This is Better (The Memory Problem)

Let's talk about **memory**. Every long-form RP, every persistent world, every character with a backstory. They all have the same problem: *the AI forgets things*. Context windows are limited. Old messages scroll off. Important details vanish.

Lorebooks were supposed to fix this. And they kinda do, if you're willing to maintain a massive keyword system, constantly update triggers, and hope that your 47-keyword entry fires at the right moment instead of the wrong one.

**TunnelVision solves memory differently.** Beyond storing information, it gives your AI the ability to **autonomously manage its own long-term memory**:

| The Old Way (Keywords) | The TunnelVision Way (AI-Driven) |
|------------------------|----------------------------------|
| YOU decide what triggers | THE AI decides what it needs |
| Keywords fire blindly when mentioned | Entries activate when contextually relevant |
| AI can't save new information | AI creates new memories mid-conversation 💾 |
| AI can't update outdated facts | AI edits entries when things change ✏️ |
| AI can't forget irrelevant stuff | AI disables entries that no longer matter 🗑️ |
| You manually organize everything | AI reorganizes the lorebook itself 🔀 |
| No event history | AI writes scene summaries automatically 📝 |

**Your lorebook isn't a static database anymore.** It's a living, breathing memory system that grows with your story. The AI remembers new things, corrects outdated things, forgets irrelevant things, and summarizes what happened. All autonomously. All via tool calls. No keyword juggling required.

---

## 🆚 "But What About RAG?"

Yeah, you've heard of RAG (Retrieval-Augmented Generation). SillyTavern has a built-in vector storage extension, and the original author also built **VectHare**: a massively upgraded RAG system with temporal decay, importance weighting, multiple vector backends (Vectra, LanceDB, Qdrant), conditional activation rules, and scene management. VectHare is a *damn good* RAG implementation, by the same hand that started this one. 🐰

So why build TunnelVision too? Because **RAG and TunnelVision solve the same problem in fundamentally different ways**, and for lorebook retrieval specifically, TunnelVision's approach wins on three fronts:

### 1. 🧠 Contextual Reasoning vs Semantic Similarity

RAG uses **embeddings**. It converts your query and your lorebook entries into math vectors and finds the ones that are *numerically closest*. It's pattern matching with extra steps. It finds text that **looks similar** to what you asked for.

TunnelVision lets your AI **think about what it needs**. The model sees a structured overview of your entire knowledge base and *reasons* about which information is relevant to the current scene. Contextual understanding, applied to retrieval.

**Where base ST vectors fall short:** SillyTavern's built-in vector storage does basic semantic search. Ren says "I can't stop thinking about what happened at the bridge" and the vector store finds entries that contain similar words about bridges and thinking. It has no concept of *why* that information matters, who was involved, or what emotional weight the scene carries. It just matches surface-level text similarity.

**Where VectHare improves things (but still hits a ceiling):** VectHare adds temporal decay, importance weighting, conditional activation, and scene-aware chunking. It's genuinely excellent at what it does, and it *does* retrieve more intelligently than base vectors. But at the end of the day, even VectHare is still doing semantic similarity search with extra filters on top. The retrieval decision is still math, not reasoning.

**Where TunnelVision goes further:** The AI thinks: *"Ren is reflecting on a past event. I should check the Summaries channel for the bridge scene, AND pull up Ren's emotional state tracker, AND check Sable's entry since she was there too."* Three different categories, retrieved together, because the AI *understood the narrative context*. Semantic similarity will never beat contextual reasoning for this kind of retrieval. 🎯

### 2. ⚡ Zero Infrastructure, Zero Headache

RAG requires (even VectHare, good as it is):
- An **embedding model** (local or API, either way more setup and cost)
- A **vector database** (Vectra, LanceDB, Qdrant. VectHare supports all three, but you still pick and configure one)
- **Chunking strategy** decisions (how big? overlap? what gets embedded?)
- **Decay tuning**, similarity thresholds, conditional activation rules
- Periodic **re-indexing** when your lorebook changes

TunnelVision requires:
- A lorebook ✅
- An API that supports tool calls ✅
- Click "Build Tree" ✅
- That's it ✅

No extra models. No databases. No chunking math. No re-indexing. You're already paying for an intelligent model. TunnelVision just lets it do what it's good at. 🐰

*In fairness:* the optional [Sidecar LLM](#-sidecar-llm-a-second-set-of-eyes) is a
second endpoint and key, and the optional **Embedding Sidecar** is exactly the
embedding model described above. Both are off by default and the core loop above
needs neither — but if you switch them on, this section's boast is only half true.

### 3. 🔄 Read-Write vs Read-Only

This is the killer. **RAG is a search engine.** It retrieves. That's all it does. One direction. Information flows out of the lorebook into the context window, and nothing ever flows back.

TunnelVision is **bidirectional**. The AI reads *and writes*. It creates new entries, updates old ones, removes outdated information, writes summaries, reorganizes categories, and merges duplicates. Your knowledge base evolves autonomously as the story progresses.

RAG gives your AI a library card. TunnelVision makes your AI the librarian. 📚

### 🤝 They're Not Mutually Exclusive

Worth noting: **VectHare and TunnelVision can coexist.** VectHare excels at *chat history* retrieval, finding relevant past messages with temporal decay and conditional rules. TunnelVision excels at *lorebook* retrieval, letting the AI actively navigate and maintain your world knowledge. Use both if you want the best of both worlds.

---

## 📡 How the Broadcast Works

### 🗺 **The Channel Guide** *(Your Tree Index)*

Every lorebook managed by TunnelVision gets organized into a **hierarchical tree**. Think of it as a TV guide with channels and sub-channels. TunnelVision builds this automatically (with or without LLM help) and generates summaries for each node so the AI knows what's on each channel without watching the whole thing.

```
📺 TunnelVision Guide
├── 📡 Ch. Characters
│   ├── 🗡️ Main Party
│   │   ├── Sable
│   │   │   ├── Personality & Backstory
│   │   │   ├── Relationships
│   │   │   └── Combat Style & Abilities
│   │   └── Ren
│   │       ├── Personality & Backstory
│   │       ├── Relationships
│   │       └── Combat Style & Abilities
│   ├── 👤 NPCs
│   │   ├── Thornfield NPCs
│   │   │   ├── The Merchant (shop inventory, personality)
│   │   │   └── The Guard Captain (patrol routes, disposition)
│   │   └── Underground NPCs
│   │       ├── The Fence (black market contacts, prices)
│   │       └── Pale Watcher (motives unknown, sightings)
│   └── 🐾 Creatures & Factions
│       ├── The Hollowed (behavior, weaknesses, territory)
│       └── Thornfield Militia (ranks, allegiances, resources)
├── 📡 Ch. Locations
│   ├── Thornfield
│   │   ├── Layout & Districts
│   │   ├── History & Politics
│   │   └── Secrets & Hidden Areas
│   └── The Underground
│       ├── Known Tunnels
│       ├── Dangers & Hazards
│       └── Faction Territory Map
├── 📡 Ch. Trackers
│   ├── [Tracker] Character Moods & States
│   └── [Tracker] Inventory & Equipment
├── 📡 Ch. World Rules
│   ├── Magic System (costs, limits, schools)
│   └── Calendar & Time (seasons, holidays, moon phases)
└── 📡 Ch. Summaries
    ├── Arc: The Curse Investigation
    │   ├── [Summary] The Ambush at Thornfield Bridge
    │   ├── [Summary] Sable Discovers the Ritual Site
    │   └── [Summary] Interrogating the Captured Scout
    ├── Arc: Underground Negotiations
    │   └── [Summary] First Contact with the Fence
    └── [Summary] First Meeting with the Merchant
```

Trees can go as deep as your lorebook needs. Two levels, five levels, ten levels. The AI navigates however many layers exist, drilling down until it reaches the entries it wants. Small lorebooks might only need a flat list of categories. Massive world-building lorebooks can have deeply nested hierarchies with dozens of sub-channels. TunnelVision handles both.

### 🔍 **Tuning In** *(Search Modes)*

Two ways the AI can browse, pick what works for your setup:

| Mode | How It Works | Best For |
|------|-------------|----------|
| 📡 **Traversal** (default) | AI sees top-level channels → picks one → tunes deeper → picks again → retrieves entries. Step by step, like channel surfing. | Large lorebooks, deep trees |
| 📋 **Collapsed** | Entire guide shown at once. AI picks channel IDs directly in one shot. Based on RAPTOR research. | Smaller lorebooks, faster retrieval |

### 🛠 **8 AI Tools** *(The Full Remote Control)*

TunnelVision gives your AI a complete memory management toolkit. These register as **tool calls**, and the AI decides when and how to use them:

| Tool | What It Does | When AI Uses It |
|------|-------------|-----------------|
| 🔍 **Search** | Browse the channel guide and tune into relevant entries | Every turn (mandatory mode) or when context is needed |
| 💾 **Remember** | Create new lorebook entries mid-conversation | New facts, character developments, world details emerge |
| ✏️ **Update** | Edit existing entries when information changes | Character status changes, relationships evolve, facts get corrected |
| 🗑️ **Forget** | Disable/delete entries that are no longer relevant | Character dies, location destroyed, fact proven false |
| 📝 **Summarize** | Create scene/event summaries with significance levels | Important events happen: battles, confessions, discoveries |
| 🔀 **Reorganize** | Move entries between channels, create new channels | Tree structure no longer fits the growing lorebook |
| ✂️ **Merge/Split** | Combine related entries or split bloated ones | Two entries cover same topic, or one entry covers too many |
| 📓 **Notebook** | Private AI scratchpad for plans, follow-ups, narrative threads | AI needs to track something tactical across turns without permanent lorebook storage |

> **Your AI is the station manager.** It creates new programs, updates the schedule, cancels shows that jumped the shark, and writes episode recaps. Your lorebook evolves alongside your story. 📈

---

## 📺 The Broadcast Flow (Under the Hood)

```
You send a message
 ↓
📡 TunnelVision injects tool definitions into the API call
 ↓
🧠 AI thinks: "I need context about Sable for this scene"
 ↓
🔍 AI calls TunnelVision_Search (1st call)
 ↓
📺 AI sees the top-level channel guide:
   "Ch. Characters (12 entries) [has sub-channels]"
   "Ch. Locations (6 entries) [has sub-channels]"
   "Ch. Trackers (2 entries)"
   "Ch. World Rules (3 entries) [has sub-channels]"
   "Ch. Summaries (9 entries) [has sub-channels]"
 ↓
🔍 AI navigates into "Characters" (2nd call)
 ↓
📺 AI sees sub-channels:
   "Main Party [has sub-channels]"
   "NPCs [has sub-channels]"
   "Creatures & Factions"
 ↓
🔍 AI navigates into "Main Party" → "Sable" (3rd call)
 ↓
📺 AI sees Sable's sub-channels:
   "Personality & Backstory"
   "Relationships"
   "Combat Style & Abilities"
 ↓
🔍 AI retrieves "Personality & Backstory" + "Relationships" (4th call)
 ↓
📝 Sable's specific entries are returned to the AI
 ↓
💬 AI responds using Sable's accurate personality, backstory, relationships
 ↓
💾 AI notices something important happened → calls TunnelVision_Remember
 ↓
📚 New memory saved to lorebook, filed under the right channel
 ↓
✏️ AI also updates the mood tracker since Sable's emotional state changed
 ↓
🔄 Next turn: AI searches again, finds the new memories, story stays consistent
```

The depth of traversal depends on your tree structure and the recurse limit setting. Shallow trees resolve in 1-2 calls. Deep trees might take 3-5. The AI stops drilling when it finds what it needs.

**Meanwhile, normal keyword triggers are SUPPRESSED** for TV-managed lorebooks by
default. No double-injection, no keyword conflicts. The AI picks what it reads. 🎯

Three things opt out of that, deliberately: **constant** entries still inject
unconditionally (*Constant Entry Passthrough*, on), a lorebook set to **Native**
injection mode is left entirely to SillyTavern, and *Keyword Trigger Passthrough*
(off) restores ordinary keyword firing if you want it back.

---

## 🔥 Features

---

*📥 Getting context into the prompt*

### 🧩 **Sidecar LLM** *(A Second Set of Eyes)*

> **Off by default.** Needs its own endpoint, key and model under *Sidecars*.

Everything above assumes your chat model does the retrieval work through tool
calls. The **sidecar** is a second, separate model that works the lorebook on its
own — cheap and fast, while your expensive chat model concentrates on prose.

Give it an endpoint (OpenAI-compatible, Anthropic or Google), a key and a model
name. It's self-contained: TunnelVision never borrows your SillyTavern
connection profile or exposes your other API keys, and only this one key is
stored. There's a connection test button next to it.

It has two jobs, switched on separately.

#### 📡 Auto-Retrieve Before Generation

Runs before your chat model sees the prompt. Reads a collapsed view of the
channel guide, picks the relevant nodes and injects their entries. Your chat
model can still call Search on top of this.

#### ✍ Auto-Write After Generation

Runs after the reply lands. Reviews the turn and decides what to remember,
update, merge, summarize or forget — capped at **Max Operations Per Turn**.

#### 🧬 Embedding Sidecar

A separate endpoint, configured on its own, for semantic duplicate
detection rather than the trigram check. Embeddings are cached to IndexedDB and
recomputed only when an entry's content actually changes.

*Your chat model writes the show. The sidecar runs the archive.* 🗄️

### 🎯 **Smart Context** *(The Pre-Roll)*

> **Off by default.**

Scans your recent messages for names and terms matching entry titles and keys,
and injects the matches **before** generation — so the obvious context is already
there without the AI spending a tool call to fetch it.

This makes **no LLM call**. It's local string matching at `GENERATION_STARTED`,
with alias expansion from entry content, a cooldown that penalizes
recently-injected entries so the same three entries don't dominate every turn,
and a character budget you set. With an Embedding Sidecar configured it can score
by meaning instead of surface text.

### 🌍 **Rolling World State** *(The Station Ident)*

> **Off by default.**

Auto-Summary writes individual historical records. The world state is the
opposite: **one continuously-updated document** describing where the story stands
right now — current scene, recent events, live story threads, key character
states.

It's refreshed by a background LLM call every N messages and injected every
single turn, so the model always opens with a sense of place. Injection position,
depth and role are configurable, and both the injection header and the update
instructions can be overridden if you want it phrased your way. Lives in
`chat_metadata` — per chat, never leaks between them.

### 🎭 **Narrative Conditionals** *(Conditional Channels)*

Put a condition tag in an entry's keywords and the sidecar judges it against the
actual scene during retrieval — not against whether the literal word appeared. An
entry can be held back until the scene genuinely fits.

Eight condition types are supported:

| Tag | Asks |
|-----|------|
| `[emotion:grief]` | Is this emotion present in recent messages? |
| `[mood:tense]` | Does the scene have this overall atmosphere? |
| `[timeOfDay:night]` | Is it this time of day in the fiction? |
| `[location:the underground]` | Are the characters at or in this place? |
| `[weather:storm]` | Are these weather conditions present? |
| `[activity:travelling]` | Are the characters doing this? |
| `[relationship:rivals]` | Is this the dynamic between the active characters? |
| `[freeform:…]` | Any condition in plain language, judged by the LLM |

### 📚 **Multi-Lorebook Support** *(Multiple Channels, One Remote)*

Got multiple lorebooks active? TunnelVision handles them:

| Mode | Behavior |
|------|----------|
| 📡 **Unified** (default) | All lorebooks merged into one channel guide. AI sees everything as a single knowledge base. |
| 📖 **Per-Book** | AI sees each lorebook as a separate network and picks which one to browse. |

### 🔐 **Per-Lorebook Permissions & Injection Modes**

Each lorebook gets its own rules, set right under **Lorebook Selection**:

| Permission | Effect |
|-----------|--------|
| **Read + Write** *(default)* | Full access |
| **Read Only** | Search works, every write is blocked — right for a character's own lore |
| **Write Only** | No search, but writes land — a pure destination book |

And how entries reach the prompt:

| Injection Mode | Effect |
|---------------|--------|
| **Sidecar** *(default)* | TunnelVision suppresses keyword triggers and injects what it retrieved |
| **Native** | SillyTavern handles injection at its own positions and outlets; TunnelVision's tools can still read and write, they just don't gate delivery |

Native mode is the escape hatch when a lorebook depends on ST's positioning and
you don't want TunnelVision in the middle of it.

**Constant entries are never touched** by any autonomous write path. Anything you
marked constant is authored reference material, and background automation leaves
it alone.

---

*✍️ Building and maintaining the memory*

### 🏷 **Tracker Entries** *(Your AI's Notebook)*

This is one of TunnelVision's most powerful features. A **tracker** is a lorebook entry that contains whatever structured information you want the AI to maintain, and the AI will actively check and update it every turn.

**What can you track?** Literally anything:
- 👗 **Clothing & appearance**: what characters are wearing right now
- 💭 **Mood & emotional state**: how characters feel in this scene
- 🎒 **Inventory & equipment**: what characters are carrying
- 💕 **Relationship status**: how characters feel about each other
- 📍 **Position & location**: where everyone is physically
- 📊 **Stats & health**: HP, mana, conditions, whatever your system uses
- 📋 **Quest progress**: objectives, completed steps, current goals

**How it works:** You create a lorebook entry and mark it as tracked — click the
crosshairs button on its row in the tree editor, or simply title it
`[Tracker] Something`, which TunnelVision recognises on its own. Either way its
name is injected into the Search and Update tool descriptions, so the AI is
*constantly reminded* the tracker exists and should be checked or updated when
relevant.

**Schema collaboration:** You don't have to design your tracker format alone.
There's no separate command for this — use `!remember` and say what you're after.
If your wording contains *design*, *schema*, *tracker*, *template*, *format* or
*structure*, TunnelVision switches the tool into collaboration mode: the AI
proposes a structured schema, you refine it together, and it saves the result as
your tracker entry. Example:

```
You: !remember design a mood and relationship tracker for Sable and Ren

AI creates a structured entry like:

[Tracker: Character States]
## Sable
- Mood: cautious, curious
- Trust toward Ren: 6/10 (growing)
- Current concern: the ritual site discovery
- Physical state: minor fatigue, left arm bruised

## Ren
- Mood: protective, conflicted
- Trust toward Sable: 8/10 (strong)
- Current concern: keeping the party safe
- Physical state: healthy, alert
```

Then you flag that entry as tracked. From that point on, the AI checks and updates it every turn. Moods shift as conversations happen, trust changes as characters interact, physical states update after combat. **The AI maintains it autonomously.** 📓

### 🔄 **Auto-Summary** *(The DVR)*

Configure an interval (e.g., every 20 messages) and TunnelVision will automatically tell the AI "you MUST summarize now." The AI creates a summary of recent events without you lifting a finger.

*Your story's DVR never runs out of space. Events from 50 messages ago are still on the record.* 📼

### 🔧 **Post-Turn Processor** *(The Night Shift)*

> **Off by default.**

Runs after each AI response and does the memory admin your chat model shouldn't
be distracted by:

1. **Extract facts + detect scene transitions** — one call, both jobs
2. **Archive the scene** — when a transition is detected, summarize the scene
   that just ended (an event-driven alternative to interval Auto-Summary)
3. **Update trackers** — find trackers for whoever was mentioned, refresh them

Each step toggles independently, and a cooldown keeps it from firing on every
single message.

### ♻ **Memory Lifecycle** *(Defragmenting the Archive)*

> **Off by default.**

Long stories bloat lorebooks. This is periodic maintenance, running far less
often than the post-turn processor and making bigger structural changes:

- **Consolidate** — merge entries that are really about the same thing
- **Compress** — shorten verbose entries while keeping the facts
- **Reorganize** — rebalance the tree as it grows lopsided

Think memory defrag. Each of the three toggles separately.

### 📖 **Narrative Arcs** *(Season Organization)*

Summaries can be grouped into **arcs**, named narrative threads under the Summaries channel. Think of them as seasons of your story.

The AI handles this **autonomously**. When it writes a summary, it can decide on its own that a new story thread has started and create a new arc for it. It can assign summaries to existing arcs when it recognizes they belong together. It can even use the Reorganize tool to move older summaries into an arc after the fact, if it realizes several loose summaries are actually part of the same plotline. You don't have to manage any of this. The AI organizes its own event history by narrative thread, automatically.

### 🧩 **Trigram Dedup** *(Rerun Detection)*

When the AI tries to Remember something, TunnelVision checks it against existing entries. If something similar already exists, it tells the AI: *"Hey, this looks like a rerun. Maybe just update the existing entry instead."*

Two things have changed since this was only a trigram check. With an **Embedding Sidecar** configured it compares by meaning instead of character overlap, which catches a duplicate that was reworded; trigrams are the fallback. And **On duplicate** now has two modes — *Warn, save anyway* (the default, non-blocking as described) or *Decline, tell the AI to update instead*, which does block the write and hands back the matching UIDs.

### 🤫 **SECRET Tags** *(Dramatic Irony)*

Prefix an entry's content with `[SECRET — known to: Elena, the King]` and the AI
treats it as narrator-only knowledge: only the listed characters may reveal, act on
or acknowledge it; everyone else behaves as if they don't know. When only one or two
characters are in the dark, `[SECRET — hidden from: Marcus]` works the other way
round. The older `[SECRET — Marcus is unaware]` form is still understood.

The write tools apply the tag themselves when the chat shows who knows something,
add names as characters find out, and **remove it** once it's no longer a secret.

> ⚠️ **This is a storytelling device, not access control.** Tagged content is
> still sent to the model and to your API provider in full. It shapes how the
> character behaves; it does not hide anything from anyone.

### 🌐 **Output Language**

Set a language and everything TunnelVision generates — entries, summaries,
trackers, world state — is written in it, regardless of what language the
conversation is in. Left empty, it matches the conversation.

---

*🛡️ Staying in control*

### ↩ **Undo on Delete & Swipe** *(The Rewind)*

Autonomous memory has an obvious failure mode: the AI saves something off the
back of a reply you then delete, and the lorebook keeps it forever.

TunnelVision snapshots every entry a turn is about to touch. Delete that message
or swipe it away and the writes are reversed — entries created that turn are
deleted, entries updated that turn are restored to their previous content, and
the tree structure is put back. Reverts show up in the Activity Feed so you can
see it happen.

Snapshots persist into chat metadata, so this survives a page reload or a chat
switch, and the last 20 turns are kept. Deletions that slip past SillyTavern's
events — `/cut`, or a delete while the extension wasn't loaded — are caught the
next time the chat loads.

### 💬 **OOC Asides** *(Commercial Break)*

A message marked as out-of-character still gets full lorebook retrieval — it's a
question *about* the story — but it can't write. Write tools are stripped from the
request, the mandatory-tool instruction is withheld, and every post-turn writer
skips the turn.

**Recognised OOC markers:** `OOC: ...`, `(OOC: ...)`, `((OOC: ...))`,
`[OOC: ...]`, `<OOC> ...`, `**OOC** ...` — the literal word must be the first
token. A bare `[ ... ]` or `(( ... ))` is *not* treated as OOC, since those are
ordinary action beats and sound effects.

### 🎚 **Token Housekeeping**

Several settings exist purely to keep TunnelVision's own footprint down:

- **Compact Tool Prompts** *(on)* — registers one guide tool plus one-line
  descriptions instead of eight full schemas every turn
- **Ephemeral Tool Results** *(on)* — clears old TunnelVision results out of
  context so they don't pile up turn after turn
- **Selective Retrieval** *(on)* — shows the AI entry names first and lets it
  pick, rather than dumping whole entries
- **Total Injection Budget** — one character cap across the mandatory, world
  state, smart context and notebook prompts combined
- **Hide Tool-Call Messages** *(off)* — keeps the tool chatter out of your chat
  log entirely

---

*🖥️ Interface and tooling*

### 📊 **Activity Feed** *(What's Broadcasting Right Now)*

A floating widget that shows you exactly what TunnelVision is doing in real-time:
- Which tool calls fired this turn
- Which entries got retrieved
- What the AI remembered/updated/forgot
- Timestamps for everything

*No more wondering "did it even use my lorebook?" Now you can watch the broadcast live.* 👀

### ⚡ **User Commands** *(The Remote Control)*

Type commands directly in the chat box to force specific actions:

| Command | What It Does |
|---------|-------------|
| `!search [query]` | Force a lorebook search for the given query |
| `!remember [content]` | Force the AI to save something to memory |
| `!summarize [title]` | Force a scene summary with that title |
| `!forget [name]` | Force the AI to forget/disable an entry |
| `!merge [entries]` | Force a merge of related entries |
| `!split [entry]` | Force splitting a bloated entry |
| `!ingest` | Bulk-import recent chat messages into the lorebook (no generation) |

The prefix is configurable (default `!`). These strip from your message and inject a forced instruction. The AI has no choice but to comply. 😤

The same actions are registered as **slash commands**, if you'd rather use
SillyTavern's own command bar: `/tv-search`, `/tv-remember`, `/tv-summarize`,
`/tv-forget`, `/tv-merge`, `/tv-split`, `/tv-ingest`, and `/tv-dedupe` —
which batch-merges every near-duplicate in a lorebook in one pass.

#### 📥 Chat Ingest

Ingest also has a panel in settings with a message range and an **Include hidden
messages** toggle. Messages carrying a ghost icon in chat are hidden from the
prompt, so ingest skips them by default — turn it on when older messages were
hidden to save context and you want them read anyway. Images and videos are
skipped either way.

### 📱 The tree editor on mobile

Three things were in the way, and only the first was a missing feature.

**Assignment needed a non-drag path.** Every entry row now has a **Move to…**
button that opens a flat, indented list of every category; tap one and the entry
moves. It shows on desktop too, where it beats dragging across the panel on a
deep tree. Drag-and-drop is untouched for anyone who prefers it.

**The layout fought the screen.** The sidebar and the main panel were stacked,
so every move meant tapping a node at the top, scrolling past the whole tree to
reach its entries, then scrolling back up. The main panel was already a
drill-down navigator — the breadcrumb walks up, the child cards walk down — so
the sidebar is now hidden below 768px and the panel gets the full height with a
single scroll region. Unassigned entries, previously reachable only from the
sidebar, appear as a card on the root.

**The mobile stylesheet had never actually applied.** A media query adds no
specificity, so its rules only win by coming later in the file — and this block
sat *above* almost everything it targeted. 33 declarations were silently losing
to the very rules they existed to override: the sidebar never hid, inputs stayed
at 13px (so iOS zoomed on every tap and never zoomed back), and none of the
enlarged touch targets were real. Moving the block to the end of `style.css`
fixed all of them at once, which is why it now carries a comment saying it has to
stay there.

---

### 🎨 **Color Themes** *(Adjusting the Picture)*

Under **Appearance**, TunnelVision's panels can keep their original pink, follow
whatever SillyTavern theme is active, or be pinned to any one installed
SillyTavern theme independently of the rest of your UI.

### 🩺 **Built-In Diagnostics** *(Signal Check)*

One-click diagnostic panel that checks **everything**:
- Are your lorebooks actually active? ✅
- Do your trees have valid structures? ✅
- Are entry UIDs still valid (not stale)? ✅
- Is your API connected and supporting tool calls? ✅
- Are all tools properly registered? ✅
- Settings corrupted? Auto-fixed. ✅
- Orphaned trees from deleted lorebooks? Found. ✅
- 60+ checks in total, about a dozen of which repair the problem themselves

*When someone says "it's not working," run diagnostics first. It finds most
configuration problems, and fixes the safely-repairable ones for you.* 🔧

---

## 🚀 Installation & Setup

### Prerequisites

- **SillyTavern** (latest version recommended)
- **An API that supports tool calling** (Claude, GPT-4, Gemini, etc.) — required
  for the tool-driven loop that is TunnelVision's main event

If your chat model *can't* do tool calls, TunnelVision isn't useless: the
[Sidecar LLM](#-sidecar-llm-a-second-set-of-eyes), [Smart Context](#-smart-context-the-pre-roll)
and [Rolling World State](#-rolling-world-state-the-station-ident) paths all inject
through ordinary prompt text and never touch the chat model's tool support. You
lose the AI browsing the guide itself, which is the point of the thing, so treat
that as a fallback rather than the intended setup.

### Step 1: Install 📥

Paste this URL into SillyTavern's "Install Extension" input:

```
https://github.com/mozophe/TunnelVision.git
```

### Step 2: Set Up a Chat 📡

1. **🔧 Enable Master Toggle**: Switch on **Enable TunnelVision** in Extension Settings.
2. **🪄 Create Chat Lorebook**: Open a chat and click **Create Chat Lorebook**
   under *Lorebook Selection*. It suggests a name (`TV - <character>`, then
   `TV - <character> 2`, …), creates the lorebook, attaches it to this chat, turns
   TunnelVision on for it and selects it. Every memory TunnelVision saves in
   this chat goes here. The button is greyed out if the chat already has a chat
   lorebook, since SillyTavern allows only one.
   When it's done, a **"TV - &lt;character&gt; is ready"** toast confirms the
   setup and lists any Character Lore it switched on (step 3). In a chat that
   already has messages, the toast stays open with a **Next steps** list for
   step 4 until you close it.
3. **📖 Character Lore** *(only if the character has lorebooks linked via the
   globe button, e.g. an embedded lorebook you imported)*: the same popup
   offers to use them with TunnelVision as well. Leave them ticked — they're set to
   **Read Only**, so the AI can search the character's lore but never writes chat
   events into it.

   A **Build Tree Index** dropdown appears only if at least one of these lorebooks
   has never had a tree built. Your choice applies only to those lorebooks — a lorebook
   that already has a tree (say, from an earlier chat) is marked **(has a
   tree)**, keeps it, and is never rebuilt here. The dropdown is greyed out
   unless a ticked lorebook still needs a tree:
   - **With LLM**: sorts entries into categories with summaries (better retrieval, costs tokens)
   - **From Metadata**: groups entries by their existing groups and keys (instant, no LLM calls)
   - **Later**: select the lorebook in TunnelVision's lorebook list and use its **Build Tree Index** section yourself
   
   The tree is saved per lorebook, so later chats with the same character reuse it.
4. **📥 Existing chat?** With the new lorebook selected, click **Ingest Messages**
   under **Chat Ingest** to pull facts out of the chat so far. Then, under
   **Build Tree Index**, click **From Metadata** (free) or **With LLM** (better
   categories, costs tokens).
   A brand-new chat needs neither — its lorebook starts with an empty tree and fills
   up as you play.
5. **✅ Run Diagnostics**: Click "Run Diagnostics" to verify everything is green.

**Doing it by hand:** attach any lorebook to the chat with SillyTavern's
passport icon in the character panel (click it and pick the lorebook; once a lorebook
is attached, a plain click opens it and shift-click or long-press changes it),
click the lorebook in TunnelVision's lorebook list, switch on **Enable for this lorebook**,
and use **Build Tree Index**.
*Tip:* set **Advanced → Lorebooks & Tree Building → Auto-Detect Lorebooks** to
`TV - {{char}}` and any lorebook whose name contains `TV - <character>` is
switched on automatically — you only have to attach it.

### Step 3: Set Up the Sidecar 🧩 *(recommended, optional)*

Skip this and everything still works. Without a sidecar, TunnelVision's own
background LLM calls (tree building, summaries, ingest) go through your current
SillyTavern API, which means your chat model. A sidecar sends them to a cheaper,
faster model instead, and it's needed for auto-retrieve and auto-write.

1. **🔌 Connect**: Under **Advanced → Sidecars → Sidecar LLM**, switch on
   **Enable Sidecar LLM**. Enter the endpoint, pick the format (OpenAI-compatible,
   Anthropic or Google), and add the API key and model name. Then click
   **Test Connection**.
2. **📡 Pick its jobs**: Enabling the sidecar only sets up the connection. Switch on
   **Auto-Retrieve Before Generation** and **Auto-Write After Generation** to
   give it work. See [Sidecar LLM](#-sidecar-llm-a-second-set-of-eyes).
3. **🧬 Embedding Sidecar** *(optional)*: Under **Advanced → Sidecars → Embedding
   Sidecar**, enter an embeddings endpoint and click **Test Connection**. Duplicate
   detection then compares entries by meaning instead of by trigrams.

### Step 4: Start Chatting 💬

That's it. TunnelVision registers its tools automatically. Your AI will start using Search, Remember, Summarize, etc. as the conversation flows.

---

## ⚙ Settings Reference

### Main Panel

| Setting | Default | What It Does |
|---------|---------|-------------|
| 🔧 Enable TunnelVision | ✅ On | Master kill switch for everything |
| 🎭 Enable Narrative Conditionals | ✅ On | Evaluate `[emotion:…]`-style keyword tags against the scene |
| 🎨 Appearance → Color Theme | TunnelVision Pink | Original palette, follow the active SillyTavern theme, or pin one installed theme |
| 📖 Access Permission *(per lorebook)* | Read + Write | Read + Write, Read Only, or Write Only |
| 💉 Injection Mode *(per lorebook)* | Sidecar | Sidecar (TV injects) or Native (ST injects at its own outlets) |
| 📥 Include hidden messages *(Chat Ingest)* | ❌ Off | Let ingest read messages hidden from the prompt |

### Lorebooks & Tree Building

| Setting | Default | What It Does |
|---------|---------|-------------|
| 🔎 Auto-Detect Lorebooks | *(empty)* | Name pattern to enable automatically; supports `{{char}}` |
| 📚 Multi-Lorebook Mode | Unified | One merged guide, or per-book navigation |
| 🧠 LLM Build Detail | Lite | How much entry content the LLM sees while building the tree |
| 🌳 Tree Granularity | Auto | How aggressively entries get split into categories |
| 📏 LLM Chunk Size | 30,000 | Characters per LLM chunk during tree building |

### Retrieval

| Setting | Default | What It Does |
|---------|---------|-------------|
| 🔍 Search Mode | Traversal | Traversal (drill down) or Collapsed (whole guide at once) |
| 📋 Selective Retrieval | ✅ On | Show entry names first and let the AI pick, instead of dumping content |
| 🔢 Collapsed Depth | 2 | Levels visible in collapsed mode |

### Prompt Injection

| Setting | Default | What It Does |
|---------|---------|-------------|
| 🎚️ Total Injection Budget | 0 *(unlimited)* | Combined character cap across mandatory / world state / smart context / notebook |
| ⚡ Mandatory Tool Calls | ❌ Off | Force at least one tool call every turn (position, depth, role and text all configurable) |
| 📌 Constant Entry Passthrough | ✅ On | Let constant entries bypass TunnelVision's gating |
| 🔑 Keyword Trigger Passthrough | ❌ Off | Allow traditional keyword triggers on TV-managed lorebooks |

### Tools

| Setting | Default | What It Does |
|---------|---------|-------------|
| 🛠️ Per-tool toggles | All on | Search, Remember, Update, Forget, Summarize, Reorganize, Merge/Split, Notebook |
| ✋ Tool Call Confirmation | All off | Ask before the AI creates, updates, forgets, summarizes, reorganizes or merges |
| ✏️ Tool Prompt Overrides | *(empty)* | Replace any tool's description with your own wording |
| 🔄 Tool Call Recursion Limit | 5 | Max recursive tool calls per generation |
| 🫥 Hide Tool-Call Messages | ❌ Off | Keep tool chatter out of the visible chat |
| 🧹 Ephemeral Tool Results | ✅ On | Clear old TunnelVision results from context (per-tool list) |
| 📦 Compact Tool Prompts | ✅ On | One guide tool + one-line descriptions instead of eight full schemas |

### Slash Commands

| Setting | Default | What It Does |
|---------|---------|-------------|
| 💬 Commands Enabled | ✅ On | Allow `!command` syntax in chat |
| ❗ Command Prefix | `!` | Character that triggers command parsing |
| 💬 Context messages | 50 | How much chat a command sees |

### Memory & Summarisation

| Setting | Default | What It Does |
|---------|---------|-------------|
| 🔄 Auto-Summary | ❌ Off | Inject a summary instruction every N messages |
| 📊 Auto-Summary Interval | 20 | Messages between triggers |
| 🛑 Exclude newest | 2 | Recent messages a summary leaves alone (minimum 1) |
| 🎬 Summarize opening messages | ❌ Off | Fold greetings into summaries too |
| 🫥 Auto-hide summarized messages | ✅ On | Collapse covered messages behind their summary |
| 🔍 Duplicate Detection | ❌ Off | Similarity check on Remember |
| 📊 Embedding threshold | 0.85 | Cosine similarity — same meaning |
| 📊 Trigram threshold | 0.6 | Character overlap — nearly the same string; wants a lower value than the embedding threshold |
| ⚖️ On duplicate | Warn | Warn and save anyway, or decline and tell the AI to update |

### Sidecars *(off by default)*

| Setting | Default | What It Does |
|---------|---------|-------------|
| 🧩 Enable Sidecar LLM | ❌ Off | Endpoint, key, model and format (OpenAI-compatible / Anthropic / Google) |
| 🌡️ Temperature / Max Tokens | 0.3 / 1000 | Sampler settings for the sidecar |
| 📡 Auto-Retrieve Before Generation | ❌ Off | Sidecar picks relevant nodes before your chat model runs |
| 💬 Chat Context / Max Injection | 10 msgs / 4,000 tokens | Retrieval budget |
| ✍️ Auto-Write After Generation | ❌ Off | Sidecar decides what to remember/update/summarize after each reply |
| 💬 Writer context / Max Operations | 15 msgs / 5 | Writer budget |
| 🧬 Enable Embedding Sidecar | ❌ Off | Separate endpoint for semantic similarity |
| 📝 Background LLM Instructions | *(empty)* | Extra standing instructions for every background call |
| ⏱️ Background LLM Call Timeout | 120s | Per-call timeout for tree building, world state, smart context, lifecycle, post-turn |

### Language

| Setting | Default | What It Does |
|---------|---------|-------------|
| 🌐 Output Language | Auto | Force all generated content into one language |

### Rolling World State *(off by default)*

| Setting | Default | What It Does |
|---------|---------|-------------|
| 🌍 Enable Rolling World State | ❌ Off | Maintain a living story-state document |
| 🔄 Update Interval | 10 | Messages between refreshes |
| 📏 Max Injection | 3,000 chars | Size cap on the injected document |
| 📍 Position / Depth / Role | In Chat / 2 / System | Where it lands in the prompt |
| ✏️ Header & Update Overrides | *(empty)* | Rewrite the injection header or the update instructions |

### Smart Context *(off by default)*

| Setting | Default | What It Does |
|---------|---------|-------------|
| 🎯 Enable Smart Context | ❌ Off | Inject entries your recent messages mention |
| 👀 Lookback | 6 | Messages scanned for mentions |
| 🔢 Max Entries / Max Injection | 8 / 4,000 chars | Selection and size caps |
| 🌲 Depth | 3 | How deep in the tree matching reaches |
| 📍 Position / Role | In Chat / System | Where it lands in the prompt |

### Memory Lifecycle *(off by default)*

| Setting | Default | What It Does |
|---------|---------|-------------|
| ♻️ Enable Memory Lifecycle | ❌ Off | Periodic structural maintenance |
| ⏲️ Base Interval | 30 | Messages between runs |
| 🔗 Consolidate / Compress / Reorganize | All on | Which maintenance steps run |

### Post-Turn Processor *(off by default)*

| Setting | Default | What It Does |
|---------|---------|-------------|
| 🔧 Enable Post-Turn Processor | ❌ Off | Background agent after each reply |
| ⏲️ Cooldown | 1 | Messages between runs |
| 📋 Update Trackers | ✅ On | Refresh trackers for mentioned entities |
| 🔬 Extract Facts | ✅ On | Pull new facts out of the turn |
| 🎬 Archive Scene on Transition | ✅ On | Summarize a scene when it ends |

---

## 🔧 Common Issues

_**Run diagnostics first. Seriously — it finds most configuration problems.**_ 🩺

### "The AI isn't using any tools!" 😤

1. Is TunnelVision **enabled**? (Master toggle in settings)
2. Is your **API connected** and does it **support tool calling**? (Not all models do)
3. Do you have at least one lorebook with TunnelVision **enabled** AND **active** in the current chat?
4. Did you **build a tree** for that lorebook?
5. Run **diagnostics**. It will tell you exactly what's wrong

### "Tools are registered but AI ignores them!" 😭

- Turn on **Mandatory Tools**. This forces the AI to use at least one tool per turn
- Some models are lazy about tool calls unless explicitly prompted. Mandatory mode fixes this.
- Check your **recurse limit**. If it's 1, the AI can only make one tool call per turn, which may not be enough for traversal mode

### "My lorebook entries are firing twice!" 💢

TunnelVision automatically **suppresses normal keyword scanning** for its managed lorebooks. If you're seeing double-injection:
- Make sure the lorebook has TunnelVision **enabled** (not just active in ST)
- Your ST version may be too old. The `WORLDINFO_ENTRIES_LOADED` event is required for suppression
- Run diagnostics. It checks for this specifically

### "Tree building is taking forever / costing too much!" 💸

- Use **Quick Build** (metadata-only) instead of LLM build. It's instant and free
- If using LLM build, lower the **LLM Build Detail** to "Lite" or "Names"
- Increase **Chunk Size** to send more entries per LLM call (fewer calls total)
- LLM build is a one-time cost. You don't need to rebuild unless your lorebook structure changes significantly

### "The AI keeps saving duplicate entries!" 🔁

- Enable **Dedup Detection** in Advanced Settings
- Lower the **threshold** if it's not catching similar entries (try 0.7)
- Use the `!merge` command to consolidate duplicates the AI already created

### "Auto-summary isn't firing!" ⏰

- Is Auto-Summary **enabled** in Advanced Settings?
- The counter is per-chat and counts user+AI messages. Check the counter in the UI.
- Auto-summary only triggers when there's at least one active TunnelVision lorebook
- The instruction fires on the NEXT generation after hitting the threshold. If you haven't sent a message since the threshold was hit, it hasn't triggered yet
- If the **Post-Turn Processor** is on with *Archive Scene on Transition*, you have
  two summary systems running. It archives on detected scene changes, Auto-Summary
  on a message count. Nothing stops both, so pick one

### "I configured the sidecar but nothing happens!" 🧩

Enabling the sidecar does nothing on its own — it's just a connection. You also
have to switch on the job you want:

- **Auto-Retrieve Before Generation** for retrieval, **Auto-Write After Generation**
  for writing. Both are separate toggles under *Sidecars*, both off by default
- Use the **connection test** button next to the endpoint. A wrong `format`
  (OpenAI-compatible vs Anthropic vs Google) fails even with a valid key
- The endpoint is a base URL (`https://api.openai.com/v1`), not a full path
- Three consecutive failures open a circuit breaker that pauses sidecar calls for
  five minutes. It clears itself after that, on the next success, or immediately
  when you run the connection test — no reload needed
- Check the **Activity Feed** — sidecar calls appear there, including failures

### "World State / Smart Context never inject anything!" 🌍

- Both are **off by default** and each has its own enable toggle
- World State updates every N messages and only *then* has something to inject.
  A fresh chat has an empty document until the first update fires
- Smart Context only injects entries whose titles or keys actually match something
  in the last few messages. If nothing matched, it injects nothing — that's working
  as designed, not a failure
- Check **Total Injection Budget**. If it's set low, these get trimmed first
- Both are per-chat and live in chat metadata, so they start empty in a new chat

### "The AI can't write to my lorebook!" 🔐

- Check **Access Permission** for that lorebook. *Read Only* blocks every write —
  and the Create Chat Lorebook flow sets Character Lore to Read Only on purpose
- **Constant** entries are never modified by any autonomous path, by design
- If the entry is a static/constant one, write tools skip it and report it skipped
- In a chat with **Injection Mode: Native**, tools can still write — it only
  changes who handles injection

### "My lorebook changes disappeared!" ↩

That's probably the undo working. Deleting or swiping a message reverses the
lorebook writes that turn caused — entries created are deleted, entries updated
are restored. Reverts are logged in the Activity Feed, so check there first.
Only the last 20 turns are snapshotted.

---

## 🏗 Architecture (For the Curious)

TunnelVision is modular by design. The index is lean, just the orchestrator wiring everything together:

```
index.js          : Init, events, wiring (lean orchestrator)
tree-store.js     : Tree data structure, CRUD, settings, serialization
tree-builder.js   : Auto-build trees from lorebook metadata or LLM
tree-categories.js: Category inference and node consolidation
tool-registry.js  : ToolManager registration for all 8 tools
entry-manager.js  : Lorebook CRUD shared by all memory tools
entry-protection.js: Guards that keep automation off constant entries
entry-scoring.js  : Relevance scoring shared by retrieval paths
ui-controller.js  : Settings panel, tree editor, drag-and-drop + move picker
diagnostics.js    : 60+ failure checks, ~12 with auto-repair
commands.js       : !command and /tv-* syntax interceptor
auto-summary.js   : Interval-based summary injection
summary-runner.js : Executes a summary pass
summary-hierarchy.js : Act and story-level summary roll-ups
summary-collapse.js  : Hides messages behind their summary
arc-tracker.js    : Narrative arc grouping for summaries
message-identity.js  : Stable per-message IDs for snapshots and trackers

--- retrieval & injection ---
smart-context.js  : Mention-driven pre-generation injection
sidecar-retrieval.js : Pre-gen tree navigation via the sidecar LLM
prompt-injection-service.js : Prompt assembly and installation
conditions.js     : [emotion:…]-style conditional trigger evaluation
world-state.js    : Rolling living story-state document
embedding-cache.js: Cached embeddings + cosine scoring (IndexedDB)

--- autonomous maintenance ---
sidecar-writer.js : Post-generation writer, snapshots and undo
post-turn-processor.js : Fact extraction, scene archiving, tracker updates
memory-lifecycle.js    : Periodic consolidate / compress / reorganize
turn-classification.js : OOC and turn-type detection
background-events.js   : Background task feed events
world-info-attribution.js : Scopes WI activation to its true cause

--- infrastructure ---
llm-sidecar.js    : Self-contained sidecar transport + circuit breaker
agent-utils.js    : Retry, chat excerpts, shared agent helpers
shared-utils.js   : SECRET-tag definitions and common helpers
constants.js      : Shared limits and magic numbers
theme.js          : Color theme resolution and application
theme-presets.js  : Reads SillyTavern's installed themes
theme-entry.js    : Wires up the Color Theme select
activity-feed.js  : Real-time tool call visibility widget
feed-state.js / feed-views.js / feed-helpers.js / feed-ui/ : Feed internals

tools/
  ├── search.js      : Channel navigation and entry retrieval
  ├── remember.js    : Create new entries (with dedup + schema design)
  ├── update.js      : Edit existing entries
  ├── forget.js      : Disable/delete entries
  ├── summarize.js   : Scene/event summaries with arcs
  ├── reorganize.js  : Move entries, create channels
  ├── merge-split.js : Merge or split entries
  └── notebook.js    : Private AI scratchpad (per-chat metadata)
```

Most modules have a single responsibility, and the common failure points have
diagnostic checks. It is not spotless — `feed-ui/` and its siblings are a
refactored feed that was written but never wired up, so the live feed in
`activity-feed.js` duplicates some of it. 🧹

---

## 🤝 Compatibility

- **🥕 BunnyMo**: Fully compatible. TunnelVision can manage BunnyMo lorebooks. Your character tags and psychological profiles get retrieved via reasoning instead of keywords.
- **🥕 CarrotKernel**: Works alongside CarrotKernel. They handle different things: CarrotKernel does character injection, TunnelVision does lorebook retrieval.
- **Any Lorebook**: TunnelVision works with ANY lorebook format. It doesn't care what's inside the entries. It just organizes and retrieves them intelligently.

---

## 🤲 Contributing

Issues and pull requests are welcome at
[mozophe/TunnelVision](https://github.com/mozophe/TunnelVision).

A few things worth knowing before you open one:

- `npm test` runs the suite (Vitest). Some existing failures are unrelated to your
  change — check whether they also fail on a clean `main` before chasing them.
- `feed-ui/` and its siblings are a refactored activity feed that was written but
  never wired up. It isn't dead code to delete, and it isn't live either. Ask
  before touching it.
- Autonomous write paths must never modify **constant** entries. `entry-protection.js`
  holds that guard — keep new write paths going through it.

## 🙌 Credits

TunnelVision was created and maintained by
**[Coneja-Chibi](https://github.com/Coneja-Chibi)** as a RoleCall project — the
concept, the architecture and the voice of these docs are theirs.

It grew collaboratively from there:

- **[mozophe](https://github.com/mozophe)** — Create Chat Lorebook, the mobile
  tree editor, per-chat lorebook selection, the self-contained sidecar and
  embedding config, snapshot undo, OOC handling, and the swipe and deletion fixes.
- **[tobitus](https://github.com/tobitus)** — the summary system: collapsing
  summarized messages behind their summary, writing summaries as constant entries,
  keeping the opening and live scene out of them, and summarizing without host
  function calling.
- **[DrMagisto](https://github.com/DrMagisto)** — exposed the rolling world state,
  smart context, memory lifecycle and post-turn processor settings in the UI, plus
  staging-compat fixes to swipe detection, snapshotting and background-task
  lifecycle.
- **[J3tze](https://github.com/J3tze)** — the whole Color Themes feature.
- **[erratos](https://github.com/erratos)** — a batch of eight fixes across
  `tool_choice`, slash commands, the post-turn processor, imports and auto-hide,
  and skipping tool-format conversion on SillyTavern's native Claude backend.
- **[phampyk](https://github.com/phampyk)** — floating-button viewport and
  stylesheet fixes.
- **[aobmax](https://github.com/aobmax)** — the Anthropic tool format conversion
  layer.

**And others.** Pull requests to the original repository were squash-merged, which
records the person who merged them as the author — and since it was Coneja-Chibi's
repository, that was always Coneja-Chibi. Some of the work git credits to
Coneja-Chibi is very likely someone else's. If that someone is you, open an issue
and it gets fixed.

`git shortlog -sn` gives the current commit breakdown, but don't read it as a
credit list: J3tze's theme work and aobmax's conversion layer were both brought
across by cherry-pick and lost their authorship, and squash-merged pull requests
are recorded against Coneja-Chibi, who merged them.

## 📄 License

GPL-3.0. See [LICENSE](LICENSE).

---

*TunnelVision: Because your AI deserves better than Ctrl+F.* 📺🐰

*Built with ❤️ and way too much caffeine and sugar to be healthy.*
