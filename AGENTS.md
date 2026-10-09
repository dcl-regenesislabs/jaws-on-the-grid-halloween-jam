# Horror game jam — October 9

One day. Small playable Decentraland scene, published to our World. Enjoy making it.
This is not a Creator Success proposal. This frame overrides the skills' proposal
workflow, including on resume and handoff.

## Use skills before starting

**Choose by the task; don't wait for the user to name a skill.**
- Brainstorm, develop or resume an idea → `dcl-gdd`.
- Build, tune or playtest a mechanic, atmosphere or scene → `dcl-prototype`, before changes.

Claude: invoke Skill. Codex: read the discovered skill's full SKILL.md.
Use that copy's references as needed; don't mix versions. Report an unavailable skill.
Reuse instructions already loaded in this chat; don't reload unchanged files every turn.
At a task switch, load the relevant skill if not loaded. Don't load both by default.

## Work together

- Human leads. Hear the idea across messages before narrowing. Ask if there's more.
  Offer alternatives without pushing your favourite; welcome detours and changes.
- Warm, playful, concise. Natural, clear language. One useful question at a time.
  Follow the intended feeling; comedy and one-time stories count.
- Treat installed skills as references. Update only when asked. Creator Hub is not used
  in this project (see Project rules below).
- Offer a small playable try early; no finished GDD needed. Reuse the scene and build chat.
  Leave time to play, fix and publish.
- Use prototype's existing routes: explore freely to find a promising version; use its
  Hypothesis Log and experiment record to test a specific design or technical claim.
  Agree what would answer the question before testing; don't invent numeric thresholds.
  Maintain the records yourself, not as an owner questionnaire. Don't turn every tweak
  into an experiment or treat one failed method as proof that the goal is impossible.
- Use available tools/assets. Verify uncertain SDK capabilities. Include enough
  atmosphere for the question being explored. A build pass is not a playtest.

## Explorer preview

Reuse the open client and hot reload. Check the running instance before launching;
MCP disconnection does not mean it is closed. For stale/glitched preview, follow prototype's
preview lifecycle: close the test instance before reopening; coordinate with an active owner.
Multiple clients need an explicitly arranged multiplayer test.

## Keep it light and honest

- No required section completion, quotas, scores, funding interview or submission gates.
  Retention and social: only when requested or relevant to the build. Mobile-first is
  required (see Project rules below).
  Don't revive deferred topics as obligations. Offer cuts when time gets tight.
  A GDD is optional, not forbidden; help write one if requested.
- Reuse the skills' files and recording rules: `ideas.md`, `decisions.md`, `references.md`,
  implementation notes, and hypothesis/experiment records where applicable. Keep observations
  with their test or exploratory try. Use `notes.md` only for context that has no existing home;
  link to the relevant records instead of duplicating them. Create files only when needed.
  Keep records brief: no full session changelog or rationale for every tweak. Preserve
  authorship, uncertainty and whether the next step is chosen or only suggested.
  No HTML/deck unless requested.
- Keep runtime assets in `assets/`; `skills/` and `design/` stay excluded from deployment.
- Separate your proposals from author decisions, observations from explanations, inspiration
  from permission to use assets. No invented evidence, links or "IP check passed".
  Save before saying saved; leave a clear next step and read it on resume.

Game details belong in `design/` and scene files.

---

# Project rules (this repo)

Decentraland SDK7 scene, `@dcl/sdk` latest via `@dcl/sdk-commands` 7.30+.
Repo: github.com/dcl-regenesislabs/manu-kuruk-halloween-jam. Windows dev PC.
`CLAUDE.md` only imports this file; keep all guidance here.

## CLI only

- No Creator Hub. It is installed on this PC but we never launch it, never read or edit its
  shared SDK cache, and never install into Hub-managed folders. The SDK is this repo's
  `node_modules`. `npm run start` / `build` / `deploy` are the whole toolchain.

## Mobile-first

- Primary target: the Decentraland mobile app (Android, Google Play, package
  `org.decentraland.godotexplorer`) on the Motorola Edge 60 Pro, plus the same client built on
  the PC from `decentraland/godot-explorer` (`release` branch) in phone-emulation mode.
  The desktop Explorer is secondary and gets the same scene, never a different one.
- Design for touch: move, look and tap only. Nothing required to play may depend on keyboard
  shortcuts, hover, right-click or `IA_ACTION_3`–`IA_ACTION_6`. Critical UI stays inside the
  safe area (`screenInset`) and is sized for touch. Branch with `isMobile()` only when desktop
  genuinely needs something different.
- Before the first build, read docs.decentraland.org → Build for Mobile (Input on mobile,
  Mobile safe area, UI best practices, Optimize Performance, Missing Features) and record what
  applies in `design/decisions.md`. Use the docs' performance checklist; don't invent thresholds.

## Commands

- Build and type-check: `npm run build`
- Preview for the phone: `npm run start -- --mobile --no-browser`
  Serves on `0.0.0.0:8000` and prints the deep link
  `decentraland://open?preview=http://<PC LAN IP>:8000&position=0,0`.
- Open it on the USB-connected phone (verified 2026-10-09; phone on the same Wi-Fi as the PC):
  `adb shell "am start -W -a android.intent.action.VIEW -d '<deep link from server output>' org.decentraland.godotexplorer"`
  Copy the link from the server output every time; the LAN IP and port can change.
  If the phone is already in the scene, file changes hot-reload; no need to resend the link.
- Mobile client on the PC (phone emulation), from the `godot-explorer` checkout on `release`:
  `cargo run -- run -- --skip-lobby --realm http://127.0.0.1:8000 --preview`
  Add `--emulate-android` for the Android layout (iOS layout is the default). These are the same
  args as that repo's own VS Code "Launch" config. Needs the preview server running.
- Desktop Explorer: `npm run start` (opens it through the `decentraland://` handler).
- Server only, no client: `npm run start -- --no-client`.
- Deploy: CI does it (below). Manual fallback:
  `npm run deploy -- --target-content https://worlds-content-server.decentraland.org`.

## Test loop

- Per playtest: phone → mobile client on PC → desktop Explorer. Fix for the phone first.
- Keep one preview server and one client open; the server watches files and hot-reloads.
  Before starting a server, check port 8000 is free; the CLI silently moves to the next free
  port, which changes the deep link.
- A build pass is not a playtest.

## Deploy / CI

- `.github/workflows/deploy.yml` deploys to our World on every push to `main` and on manual
  dispatch. It needs `worldConfiguration.name` in `scene.json` and the repository secret
  `DCL_PRIVATE_KEY` (a dedicated wallet that owns the NAME or was granted deploy permission on
  the World). `.github/workflows/ci.yml` builds every other branch and PR.
- Never write keys into files or commit them. Never paste the key into a shell command locally.

## Project structure

- `src/index.ts` is the entry; all scene code must be reachable from the exported `main()`.
  SDK7 ECS: entities are ids, components are pure data, logic lives in systems added with
  `engine.addSystem()`.
- `scene.json`: parcels, spawn points, permissions, `worldConfiguration`.
- `assets/`: runtime content only. `design/`: ideas, decisions, references, hypothesis and
  experiment records. `skills/`, `design/`, `agent/` and `skills-lock.json` are in `.dclignore`.
- Scene limits (triangles, materials, textures) scale with parcel count.

## Skills

- Game design: `dcl-gdd` and `dcl-prototype` live at user scope (`~/.claude/skills`,
  `~/.codex/skills`). Don't copy them into the repo.
- SDK patterns: the official `decentraland/sdk-skills` (`sdk-scenes` is the index). If they are
  not in your skills list, install at user scope with `npx skills add decentraland/sdk-skills --all -g`;
  never into the project.
- Docs: https://docs.decentraland.org · AI workflow:
  https://docs.decentraland.org/creator/scenes-sdk7/getting-started/vibe-coding
