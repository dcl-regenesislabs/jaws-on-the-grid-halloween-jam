# HUD cleanup - 2026-10-10

Owner request: full interactable area without extra margins; score must not sit
under PICK A MOVE; remove the GO red wash. Follow-up restores movement to the
left and gear to the right.

Implemented in src/client/ui.tsx (hud-2): one gameplay inset, three header columns,
360-unit stats/contracts boxes, borderless stats and turn cards, aqua GO, no
phase-triggered screen wash. Existing explosion/cinematic effects remain.
Pickup/boost notices moved upward; shortened raft hint fixes observed wrapping.

Phone smoke: Motorola signed-in local preview, real ADB screenshot and left-arrow
tap. [GO capture](ui-after.png) shows separated header, left movement controls,
and untinted ocean during execution. A subsequent capture showed the raft/player
position shifted after the tap. No gear was held, so item buttons on the right
are code-checked only. The preview reload icon partially covers the coin icon;
this is not the score/turn overlap. No owner readability verdict yet.

Concurrent changes to gameplay/raft files triggered more hot reloads during this
pass; those changes are outside this UI work. Known headless-server stale-lock
failure interrupted preview and was recovered once. Later reloads may require
that same existing server recovery. No PC emulation/desktop pass or deployment.

Validation: build/type-check passed before the final layout follow-up; final
validation is recorded below. Next: check a held item on the right, then PC
layouts after the concurrent scene changes settle.

Final validation: npm run build and type-check passed after the control swap.
