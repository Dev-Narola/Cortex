# UI-UX.md — Cortex

**Supersedes `UI-Design.md`.** Companion to `Architecture.md`, `cortex-prd.md`, and `cortex-engineering-blueprint.md`. Backend is complete and live on EC2 — this is the full front-end identity and UX pass built for that reality: the complete first-visit-to-power-user journey, the visual system underneath it, and every screen and component needed to build it.

### What changed from v1, and why

`UI-Design.md` was written before a single real user had touched the product — a calm, dark, restrained instrument, which was the right call for a pre-launch internal spec. Now that there's a live backend and this is becoming a real front door, three deliberate shifts anchor this version:

1. **Hybrid base** — bright, energetic public site (landing, sign up, log in) → calm, dark authenticated workspace (everything past onboarding). Different jobs, different visual registers.
2. **Gradient-driven palette** — two vivid anchor hues, blended, replacing v1's flat duotone blocks — brighter, warmer, more alive, while still tracing directly back to v1's amber/teal logic rather than discarding it.
3. **Bold-hero, calm-in-app motion** — the marketing site is a scroll-driven, animated story designed to hold attention; the product itself stays fast, quiet, and out of the way the moment someone's doing real work.

Everything below — color, type, logo, motion, every screen, every component — is built from those three decisions.

---

## 1. Brand & Design Direction

**The feeling to hit:** the moment scattered information clicks into one understood shape. Not a chatbot skin. Not a beige enterprise dashboard. Not a moody hacker-terminal AI tool. Cortex's actual subject — documents becoming a connected, reasoning graph of knowledge — is still where the visual identity comes from, same as v1. What changes here is the register: v1 whispered it, this version says it with real energy, because a marketing site has about ten seconds to convince someone who has already looked at four other "chat with your PDFs" products today.

**What this deliberately avoids, even while going bold and colorful:**
- The warm-cream-background-plus-terracotta-serif look, and the near-black-plus-single-neon-accent look. Both are current AI-generated-design defaults — "vibrant" doesn't mean either of them.
- The purple → blue → pink hero gradient nearly every AI product reaches for. Avoided on purpose. The signature gradient here runs **orange → teal** (Section 2) — a warmer, rarer pairing in this category, and, not incidentally, a direct, more saturated evolution of v1's amber/teal duotone rather than an unrelated new palette. Someone who saw v1 and sees this next should recognize it as the same brand turned up, not a rebrand.
- Gradient as wallpaper. The gradient carries a specific meaning here — it's the visual language for *a signal moving along a connection*, which is literally what the product does: a query traversing the graph, two search methods fusing into one ranked list, raw text becoming a reasoned, cited answer. It shows up at meaningful moments, not painted across every surface.

**Why hybrid, not one theme everywhere:** the public site and the product have different jobs, used in completely different ways. The landing page gets fifteen seconds from someone deciding whether to trust a stranger's backend with their documents — it should be confident and alive. The chat panel, the documents table, the graph explorer get stared at for an hour at a stretch by someone doing real work — that needs to stay calm and low-glare or it gets fatiguing fast (this was v1's whole argument for darkness, and it still holds — it just now only applies once someone's actually inside). The two contexts don't compete for the same attention budget, so they don't need the same visual register. The switch from light to dark happens exactly once, at one specific, designed moment (Section 7, Stage 4) — not an inconsistency, a threshold.

---

## 2. Color System

Two palettes, one shared logic. Marketing surfaces run light; the authenticated app runs dark. Both draw from the same two accent hues so the brand reads as one system, not two.

### Marketing / public-site palette (light)

| Token | Hex | Role |
|---|---|---|
| **Cloud** | `#F7F8FA` | Primary background — a barely-there cool neutral, not warm cream |
| **Ink** | `#0E1016` | Primary text, headlines — also doubles as the dark app's background below, which is what makes the light→dark transition feel like one continuous brand rather than two |
| **Ember** | `#FF6A3D` | Primary accent — warmth, energy, primary CTAs, one gradient anchor |
| **Volt** | `#0BE3C4` | Secondary accent — structure, links, active states, second gradient anchor |
| **Mist** | `#68707D` | Secondary/body text, muted labels |
| **Error** | `#F23D5E` | Destructive actions, failed states — kept clearly out of Ember's hue family on purpose, so a warning is never mistaken for brand color |
| **Success** | `#1FD988` | Completed/positive states |

### App / authenticated-workspace palette (dark)

| Token | Hex | Role |
|---|---|---|
| **Void** | `#0B0D12` | Primary background — near-black, cool undertone |
| **Slate** | `#161A22` | Elevated surfaces — cards, panels, modals, sidebar |
| **Paper** | `#F2F3F5` | Primary text, headlines |
| **Mist (dark)** | `#8B93A1` | Secondary/body text, muted labels |
| **Ember / Volt** | same hex as above | Same two accents — but in-app they read as glows, gradient borders, and small fills rather than large flat blocks. Vibrancy shows up in *where light hits*, not in recoloring the whole surface — that's what keeps a dark screen calm through a long session |
| **Error / Success** | same hex as above | Unchanged — one meaning across both themes |

### The signature gradient — "Spark"

```
Spark:       linear-gradient(135deg, #FF6A3D 0%, #0BE3C4 100%)
Spark Glow:  radial-gradient(circle, #FF6A3D26 0%, #0BE3C426 45%, transparent 75%)
```

Used for: the hero headline's text-fill (once, on the single most important phrase — never the whole headline, never body copy), primary buttons, the active/streaming state of a chat message, the "agent is thinking" indicator, and the pulse that travels along a graph edge when a query traverses it. **Spark Glow** is the low-opacity ambient version — ambient backdrop behind the hero visual, and behind an actively-streaming message bubble in dark mode.

**Build note:** a plain RGB linear-gradient between an orange and a teal can go muddy/gray through the middle — they're near-complementary hues. Interpolate in OKLCH (`linear-gradient(135deg in oklch, ...)`) rather than plain RGB, or, if that's not in the target browser matrix, add a lightened bridge stop around the midpoint. Check this in a real browser before shipping — don't assume the naive two-stop version looks right.

**Rationing rule:** at most one Spark-gradient moment per screen. Everywhere else, Ember and Volt are used as flat, solid accents (buttons, links, icons) — the gradient is reserved for the handful of places listed above, which is what keeps it feeling like a signature rather than a background texture.

---

## 3. Typography

| Role | Typeface | Notes |
|---|---|---|
| **Display** | **Bricolage Grotesque** (variable) | Expressive, slightly warped grotesque with real personality at large sizes — deliberately not Inter/Poppins/Manrope, the three faces every "modern SaaS" site currently reaches for. Free, self-hostable via Google Fonts. Headlines and marketing display only, used with restraint |
| **Body** | **General Sans** | Clean humanist grotesque, excellent legibility at small UI sizes, warm enough not to fight the accent colors, neutral enough to disappear when it should. Carries all UI copy, labels, paragraph text, app headings |
| **Mono / utility** | **JetBrains Mono** | Citations, API keys, MCP tokens, code blocks, timestamps — unchanged from v1, still the right tool for anything that's literally data |

### Marketing type scale (bigger, more dramatic — public pages only)

| Style | Size / line-height | Weight | Use |
|---|---|---|---|
| Hero Display | 72px / 1.0 | 650 (variable) | Landing hero headline. The one line — or key phrase within it — eligible for the Spark gradient text-fill |
| Section Display | 44px / 1.1 | 600 | Section titles down the scroll ("Search that actually understands your documents," etc.) |
| Feature Heading | 28px / 1.2 | 600 | Individual feature-block headings within a section |
| Marketing Body | 18px / 1.6 | 400 | Section body copy — larger than in-app body on purpose; marketing pages need breathing room, not density |

### App type scale (denser, calmer — everywhere past login)

| Style | Size / line-height | Weight | Use |
|---|---|---|---|
| Page Title | 28px / 1.25 | 600 | Dashboard, Settings, Graph Explorer page headers |
| Heading | 20px / 1.3 | 600 | Card titles, modal titles |
| Body L | 16px / 1.6 | 400 | Chat messages, primary reading text |
| Body M | 14px / 1.55 | 400 | Table rows, form labels, secondary UI text |
| Caption | 12px / 1.4 | 500 | Timestamps, status badges, helper text |
| Mono | 13px / 1.5 | 400 | Keys, citations, code |

**Gradient text rule:** the Spark text-fill is a marketing-only device, used once per page at most. It never appears in-app — app copy is always a flat, readable color (Paper or Mist on dark), because gradient text at 14–16px against long paragraphs is a readability problem, not a brand moment.

---

## 4. Logo & Icon System

**Concept:** the mark does two jobs at once — it's a lowercase "c," and it's a graph fragment. An open, thick-stroked arc (rounded terminals, matching the UI's own corner-radius language) curls into the shape of a "c." At each open terminal of the arc sits a small filled circle — a node. The arc connecting them carries the Spark gradient. Read one way, it's a letterform; read the other way, it's the simplest possible knowledge graph: two nodes, one connection. That double-reading is the whole idea — a logo that's *about* connection, rather than one that just sits next to a company name that happens to mean connection.

```
      ╭──────╮
     ●        │        ← node (filled circle, Ink)
     │  Spark  
     │  gradient
     │  arc     
     ●        ╱         ← node (filled circle, Ink)
      ╰──────╯
```

**Wordmark:** "cortex," lowercase, set in Bricolage Grotesque, medium-bold, tight tracking. Lowercase is deliberate — it reads as contemporary infrastructure (the register of Linear, Vercel, Stripe) rather than enterprise-software formality.

**Color variants:**

| Context | Treatment |
|---|---|
| Marketing / light backgrounds | Full-color: Spark-gradient arc, Ink-filled nodes |
| In-app (sidebar, small UI) | Flattened to solid **Volt** — a full gradient stops reading correctly under ~24px, so small-scale usage simplifies to one color rather than cramming the gradient in |
| Dark backgrounds, general | Solid **Paper** (white) or solid Volt — same small-scale logic |
| Monochrome (legal, invoices, print) | Solid **Ink** or solid white, no exceptions |

**Rules:** minimum digital size 20px (icon alone) / 88px (full lockup with wordmark); clear space on all sides equal to one node's diameter; never stretch, skew, rotate, or recolor outside the variants above; never place on a background that drops contrast on either the nodes or the arc.

**Favicon / app icon:** icon mark only, no wordmark, simplified further to flat two-color (Volt arc + Ink nodes) — a gradient at 16–32px reads as noise, not a gradient.

---

## 5. Imagery & Iconography

**No stock photography.** Zero people-smiling-at-laptops, zero generic-office imagery — the fastest way to undercut "distinctive" is a stock photo, and it's a mismatch for infrastructure software anyway. Two sources of imagery instead:

1. **Real product screenshots** — once screens exist, marketing pages should show actual UI: a real streamed answer, a real citation click, a real graph traversal. This is a stronger, more credible pattern for developer-facing infrastructure than photography (the same instinct behind how Linear, Vercel, and Stripe market — the product is the image).
2. **Abstract generative graphics** — gradient-mesh textures and node-network renders (the same visual language as the hero's Living Graph, Section 8) used as section backgrounds and dividers on the marketing site. Always abstract, never literal illustrations of "a brain" or "a robot" — both are on-the-nose for an AI-adjacent, brain-named product and read as generic the moment they appear.

**Icon set:** Lucide, kept from v1 — comprehensive, consistent, no reason to fragment it. Stroke width bumped slightly to 1.75px (from v1's 1.5px) to match the more confident overall energy; 18–20px in-app (nav, toolbars, buttons), up to 24px on marketing feature icons.

**Custom duo-tone icons:** for the four core-capability moments on the marketing site specifically (Hybrid Search, Knowledge Graph, Agents + MCP, Citations/Trust) — small custom icons filled with the Spark gradient, used only in that one feature section. Everywhere else, including every functional in-app icon, stays plain Lucide. This keeps the gradient-icon treatment special rather than diluting it across the whole icon set.

**Illustration style for empty states:** unchanged in spirit from v1 — the single-unconnected-node motif for "no documents yet" and similar states, now rendered in Volt with a faint Spark Glow rather than flat teal.

---

## 6. Motion & Animation System

**The split:** bold, orchestrated, story-driven on the marketing site; restrained, fast, purposeful in the app. Same philosophy as v1's "spend the boldness where it's earned" — the earning criteria just moved. In v1, boldness was earned by the hero and the graph explorer specifically. Now it's earned by the entire public site (whose job is to hold attention and convert) while the *product* keeps v1's original restraint almost unchanged, because that reasoning — long focused sessions need calm, not spectacle — never stopped being true.

### Marketing site (bold)

| Moment | Treatment |
|---|---|
| Page load | One orchestrated ~1.4s sequence: ambient gradient-mesh/node field fades in first (0–0.4s) → headline reveals word-by-word via mask-wipe (0.3–0.9s) → subhead fades up (0.6–1.0s) → CTA buttons scale+fade in (0.9–1.2s) → hero visual's idle loop begins. One story, one direction — not staggered element confetti |
| Scroll-triggered sections | Each feature section animates *as what it's explaining*, not a generic fade-up: the hybrid-search section visually merges two result lists into one as it enters view; the knowledge-graph section draws nodes and connects them live; the agent section auto-plays a miniature step trace. Each plays once per session, no re-triggering on scroll-back |
| Interactive live demo | A real (or realistically simulated) mini "ask a question" box mid-page — pick a sample question, watch a streamed answer with a citation chip appear, click the citation. The single highest-value animated moment on the site: it demonstrates the product instead of describing it, aimed directly at the "nobody trusts AI answers" doubt the PRD names for the Priya persona |
| Stat counters | If used, numbers count up once when scrolled into view, not on every scroll pass |
| Hover / cursor | Buttons and cards lift 2–3px with the border brightening; the hero visual can subtly parallax-tilt toward cursor position for an "alive" feel |
| Final CTA | Mirrors the hero's entrance in reverse-emphasis — quieter motion, because by this point the page has made its case; the CTA should feel like an easy next step, not another spectacle |

### In-app (calm — carried over from v1, largely unchanged)

| Moment | Treatment |
|---|---|
| General state changes | 150–250ms opacity/transform only. No parallax, no floating shapes, no per-element stagger — those read as AI-generated, not designed |
| Streaming chat | Tokens fade in per chunk; Spark Glow breathes gently behind the active message bubble, settles flat the moment generation completes |
| Ingestion status | Badge cross-fades between states; a thin progress line (not a spinner) tracks `pending → indexed` |
| Graph explorer | Slow continuous node drift; a Spark-gradient pulse travels along an edge the instant a query traverses it — the one place the signature gradient's "signal moving along a connection" meaning becomes literal and functional, not just decorative |
| Theme transition (light → dark) | The one intentional exception to "no big animation in-app," because it only happens once per session, at the workspace-boot moment (Section 7, Stage 4) — a ~600ms cross-fade/morph, not a hard cut |

**Reduced motion:** both hero and graph explorer swap continuous motion for a single static frame; all transitions drop to near-zero; the demo box and streaming text still function, just without the decorative motion layer.

---

## 7. The Complete User Journey — Search to Power User

The full behavioral walkthrough: what a person is thinking, deciding, and doing at each point, from before they've heard of Cortex through becoming a daily user who's invited their team. `Architecture.md`'s client flow is the screen inventory; this is the psychology underneath it.

### Stage 0 — Discovery, before they land
Realistic entry points: organic search ("RAG backend for internal docs," "chat with your documents API," "knowledge graph AI platform"), a shared portfolio/GitHub link, word of mouth, a direct link. Whoever arrives here — especially from search — has almost certainly already looked at two or three competing "chat with your PDFs" tools today. **They arrive skeptical, not curious.** That has one direct consequence: the page title and meta description need to lead with what's actually differentiated (hybrid search + a real knowledge graph + agentic tool-calling + native MCP access), not generic "AI-powered knowledge assistant" copy — exactly what the other nine open tabs already say.

### Stage 1 — The first three seconds
The hero resolves (Section 6's load sequence), the headline lands, the subhead gives one concrete reason to keep reading. This is the "hero is a thesis" moment — the visitor is forming a snap judgment: *generic AI wrapper, or something real?* Confident motion plus a specific, checkable claim in the subhead (not "understand your documents," but something a skeptic can picture verifying, like the interactive demo one scroll away) is what earns the next action: scroll, or bounce.

### Stage 2 — The scroll-driven story
In order: the problem, stated plainly (knowledge scattered across docs, no way to trust an answer without checking it yourself) → the solution, one sentence → four feature beats, each animated as what it does (Section 6) → the live interactive demo → a technical-credibility strip aimed squarely at the Sam persona (Postgres + pgvector, streamed over WebSocket, MCP-native, hybrid search with reranking — specific enough that a skeptical engineer recognizes real infrastructure, not a LangChain wrapper) → final CTA → footer.

This is where trust actually gets built, not just attention held. The citations feature matters more here than anywhere else in the funnel, because "nobody trusts the answer enough to skip checking the source" is the exact, named pain point for the primary persona (Priya, per the PRD) — proving a citation is real and clickable, before signup, is the single highest-leverage thing on the page.

### Stage 3 — The signup decision
By the time someone reaches the CTA, they've either been convinced or already left — this stage is about removing friction from a decision already made, not making the case again. Current backend supports email + password (`POST /auth/register`, JWT) — that's what ships. Inline validation exactly as v1 specified: "Email already registered," "Passwords don't match," a live password-strength hint. **Worth flagging as a future add, not part of this spec:** GitHub/Google OAuth would meaningfully cut signup friction for a developer-tool audience — most of Sam's peers expect it — but it's new backend surface area, not something the current auth system exposes, so it's a v1.x candidate, not a UI decision to make today.

### Stage 4 — Onboarding, and the light → dark threshold
Workspace naming, one field, unchanged from v1's spec — still on the light/marketing theme, still a quiet task screen with no distraction. The moment they submit and the workspace finishes provisioning is the one deliberate exception to "no big animation in the app": a "Setting up your workspace…" loading beat that cross-fades/morphs the whole screen from the light theme into dark as the dashboard mounts underneath it. It's a threshold, designed to feel like one — the visual equivalent of walking from a bright lobby into the room where the actual work happens, and the only place in the entire product where the theme itself is allowed to be the animation.

### Stage 5 — Empty dashboard, first upload
The make-or-break setup moment. The empty state needs the next action to be obvious and close to zero-friction — drag-and-drop front and center, "Add from URL" available but secondary, per v1's existing modal spec. Once a file's uploading, the live status badge (`pending → parsing → chunking → embedding → indexed`) is itself doing real trust-building work: the user is *watching* their document become understood, in real time, over a WebSocket connection they'll never see — a genuinely good animated moment already implied by the architecture, worth treating as first-class motion design rather than an incidental status badge.

### Stage 6 — The first question — the actual aha moment
If one screen in the whole product matters most, it's this one. A real answer streams back, token by token, with a citation chip the user can click to see it's grounded in their own document, not invented. Every piece of Sections 6 and 8's attention on the chat screen is really in service of this single moment landing as *"oh — this actually works,"* rather than as one more chatbot response.

### Stage 7 — Multi-turn, agent traces, and the graph explorer as delight
Once basic Q&A is trusted, usage naturally extends into multi-step questions, and the expandable agent trace becomes visible and legible rather than a black box. Independent of that, users tend to open the Knowledge Graph Explorer out of curiosity before they have a functional need for it — the one screen designed to be genuinely impressive on its own, and that's intentional: it's a retention and delight lever, not purely a utility screen.

### Stage 8 — From personal tool to team infrastructure
Inviting teammates, generating scoped API keys, wiring up an MCP connection — this is where behavior shifts from "my research tool" to "our infrastructure." The Team and API Keys empty states should actively invite that expansion ("Invite your team" as a real prompt, not a passive tab waiting to be found) rather than staying purely reactive.

### Stage 9 — What brings them back
Conversation history (reopening a past thread), the Usage & Billing tab (checking cost, especially early when trust in "how much is this costing me" is still being established), and simply the accumulating value of a knowledge base that gets more useful as more gets uploaded — the core retention loop of any RAG product.

### Stage 10 — Behavior under stress (cross-cutting, every screen)
Carried over from v1 and still correct: a rate-limit hit surfaces as a banner/toast, never a silent failure; a viewer-role user never sees a Delete button rather than seeing one and getting rejected server-side; session expiry attempts a silent refresh first and only interrupts the user if that fails. One addition: a failed ingestion or a failed generation states the fact and the fix in the product's own voice (Section 10), never an unexplained spinner that quietly gives up.

---

## 8. Screens

### Marketing site (light theme)

**Hero**
```
┌──────────────────────────────────────────────────┐
│  cortex                        [Log in] [Sign up→]│ ← Cloud bg, Ink nav text
│                                                     │
│      Ask anything.                                 │ ← Hero Display, Ink
│      Answered from YOUR documents.                 │ ← "YOUR" gets Spark gradient fill
│                                                     │
│      Hybrid search. A real knowledge graph.        │ ← Marketing Body, Mist
│      Agents that cite their sources.                │
│                                                     │
│      [ambient node-network render, Ember/Volt glow]│
│                                                     │
│      [ Get started free → ]   [ See it work ↓ ]    │ ← primary Spark button + ghost
└──────────────────────────────────────────────────┘
```
Full-bleed Cloud background, abstract node-network render behind/around the headline (light background here, not full-bleed dark like v1 — glowing nodes read as light sources against it). Two CTAs: primary scrolls to signup, secondary scrolls to the live demo — giving a skeptical-on-arrival visitor a lower-commitment first action than "sign up."

**Problem section:** Section Display headline stating the scattered-knowledge problem plainly, Marketing Body supporting line, no imagery — text is the whole point of this beat, deliberately quiet right after the hero's motion.

**Four feature blocks** (Hybrid Search / Knowledge Graph / Agents + MCP / Citations & Trust): each gets a Feature Heading, 2–3 lines of Marketing Body, a custom Spark-gradient duo-tone icon (Section 5), and its own scroll-triggered animation (Section 6). Alternating left/right image-text layout down the page, not a repeating identical grid — each feature earns its own beat rather than being interchangeable.

**Live demo section:** centered card on Cloud background, a handful of example-question chips above an input, streamed answer appears below with a real citation chip — same visual grammar as the actual in-app chat screen (Body L, Spark Glow while streaming) so it's an honest preview, not a mockup that looks nicer than the real thing.

**Technical credibility strip:** a dense, quiet row of facts (Postgres + pgvector, WebSocket streaming, MCP-native, hybrid BM25+vector, reranked) in Mono/Caption type on plain Cloud — no animation here on purpose, this beat's job is to read as sober and technical after four beats of motion, aimed at the Sam persona specifically.

**Final CTA:** Section Display headline, single primary button, quieter motion than the hero (Section 6).

**Footer:** product, docs, GitHub if public, legal — Mono caption type, Mist text on Cloud.

### Sign Up / Log In / Workspace Setup
Unchanged in structure from v1: centered card, 420px max width, no distraction — recolored onto the light theme. Cloud background, near-white elevated card, Volt-outline focus states on inputs, primary button in Ember. Workspace Setup ends with the light→dark transition (Stage 4).

### Dashboard — empty state (dark, first app screen)
Sidebar (Slate, 240px) + top bar + main panel, Void background. Empty state: single unconnected-node illustration in Volt with a faint Spark Glow, one line of copy, one primary (Spark-gradient) button: "Upload your first document."

### Dashboard — populated / Documents list
Table on a Slate card: Title (Body M) · Type (Mono caption) · Status badge · Uploaded (Mist caption) · Actions. Primary action **"Upload Document"** sits top-right of the table header — the one place a primary button appears outside a modal or empty state. Row hover lifts slightly, border brightens toward Volt.

### Upload modal
Slate modal, 12px radius. Two tabs, File / URL. Drop zone: dashed Volt-at-20%-opacity border, solidifies to full Volt on drag-over. Primary **"Upload"** button bottom-right; **"Cancel"** ghost button immediately to its left.

### Document detail
Slide-over or dedicated view from a table row: extracted chunks, entities pulled from it (once KG extraction has run), **"Reprocess"** (secondary) and **"Delete"** (Error-outline, requires confirm) side by side — Reprocess on the left, Delete on the right, visually separated by spacing so a mis-click can't hit Delete when reaching for Reprocess.

### Chat / Ask
Two-column: conversation (flex-grow) + collapsible citation panel (320px, appears only on citation click). Input pinned to bottom, Slate bar, Volt focus ring. Streaming assistant messages carry Spark Glow, settle to flat Slate once complete. Citation markers: small superscript chips in Ember. Below each completed answer: Copy / Regenerate (ghost icons) and thumbs up/down — all tertiary, none competing with the input itself for attention.

### Agent trace (inline, within chat)
Collapsed: "Agent used 3 steps ▾" as a single quiet line. Expanded: vertical stepper, each step a small card — tool name in Mono, one-line result summary, latency in the corner. No color drama here — this is a trust/transparency device, not a marketing moment, so it stays close to plain Mist/Paper text with just a Volt connecting line between steps.

### Conversation history
Left-hand list, ChatGPT-style, each entry clickable; rename (inline edit) and delete (Error, confirm-on-click, not a full modal — this is a low-stakes, easily-undoable action) available per item.

### Knowledge Graph Explorer
Full-bleed 3D canvas, Void background, floating Slate search bar top-left, node detail card slides in from the right on click. Nodes: Volt default, Ember when part of an active query path — edges pulse Spark gradient on traversal (Section 6). Still the one screen where the graph *is* the interface, not a backdrop.

### Settings (Team / API Keys / MCP / Usage & Billing / Audit Log)
Tabbed Slate panel, left tab list, content right. Team tab's empty/near-empty state carries an active **"Invite your team"** prompt (Stage 8), not just a passive member list. API Keys and MCP tabs: Mono type for key/token display, one-time reveal pattern, copy-to-clipboard icon button. Primary action per tab sits top-right of that tab's content area ("Generate New Key," "Invite by email," "Generate MCP Token") — consistent placement across all four tabs so the pattern only has to be learned once.

### Cross-cutting states
Rate-limit banner: top of viewport, Error-tinted Slate, persists until dismissed or the period resets. Permission boundaries: viewer role never renders a Delete button at all. Session expiry: silent `POST /auth/refresh` attempt first, only redirecting to Log In (light theme) on failure, copy stating the fact plainly: "Your session expired — log in again to continue."
