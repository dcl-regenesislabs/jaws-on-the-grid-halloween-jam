# HUD cleanup - 2026-10-10

Admin access follow-up (2026-10-10, owner request): removed the visible ADMIN
launcher. Tapping the scene minimap opens the panel only after the existing
admin wallet check; CLOSE appears only while open. Server authorization remains
in place. Build/type-check and diff check passed. Next: verify minimap taps with
admin and non-admin accounts on the phone; this change has not been playtested.

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

Follow-up: extracted movement to its own screenInset: 'device' renderer, with
left: 0 and bottom: 0 and no wrapper padding. Preserved mobile-only, scoreboard,
guest, connection and death visibility gates. Build/type-check and diff check
pass. Phone was on the login welcome screen, so this correction has not yet
been visually checked in-game. Next: verify left-thumb reach on the phone.

Phone follow-up completed (2026-10-10): Motorola, signed-in Kuruk, client
v1.15.0.2229-92bedbd-staging, existing local preview. Device-inset arrows now
start at the device left edge, visibly left of the interactable stats column;
no extra wrapper padding. Native emote button is below-left, outside arrow
hitboxes. [Layout](ui-device-test.png). Real ADB taps at native screenshot
coordinates filled both move pips and highlighted two leftward tiles
([planned](ui-device-tap.png)); execution moved the player two cells on the
raft ([moved](ui-device-moved.png)). GO had no red wash. Phone left on the raft
for the owner's reach/comfort check. This verifies left-arrow input and layout,
not every direction/item or subjective thumb comfort. The existing supervised
server was reused after stopping an accidentally started duplicate server.
