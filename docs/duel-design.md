# One-on-one duel design

## Product constraint

Code Monsters is designed around one programmable unit versus one authored rival. Only `volt`, `bastion`, and `relay` require combat animation. This keeps the animation workload realistic for a solo developer while allowing the same bodies to create visibly different opponents through hardware and behavior.

## Run loop

1. Inspect the next rival's body, three equipped parts, and program summary.
2. Configure Volt's ordered normal program and one interrupt reaction. Every instruction has an independent cooldown. When Volt's short action lock opens, ready instructions are evaluated from the top and only the first matching normal action executes.
3. Equip exactly one frame, weapon, and logic chip.
4. Fight a deterministic one-on-one battle.
5. Spend the reward on one of two unowned equipment offers or two instruction offers.
6. Complete five protocols, ending in a mirror match against Volt.

There is no unit recruitment, bench, formation order, partner targeting, or unit resale.

## Loadout strategy

| Slot | Primary decision | Examples |
| --- | --- | --- |
| Frame | durability versus mobility | heavy armor adds HP and defense but loses speed; a light frame does the opposite |
| Weapon | range, damage profile, and action package | impact, long-shot, corrosion, and cryo cores each replace the tactical toolkit |
| Logic chip | reaction and program identity | follow-up, repair, guard, overclock, and redline packages |

Equipment uses authored stat tradeoffs rather than random affixes. A part may grant actions or a default reaction, but the equipment registry does not duplicate unit stats. Replacing a part removes instructions that are no longer owned so saved programs cannot execute unavailable actions.

## Encounter strategy

Every encounter is a complete rival build: one body, three equipment IDs, an ordered program, an optional reaction, a stat scale, and a reward. The build screen previews the rival package before battle. This makes losses legible and turns preparation into a matchup decision rather than a blind power check.

The five initial protocols cover rushdown, defense and knockback, slow control, corrosion attrition, and an overclocked mirror match. Future variety should prefer new equipment, new programs, arenas, and encounter rules before adding an animated unit.

## Art production boundary

Character animation is hand-authored and processed by the existing deterministic sprite pipeline for QA, approval, Web export, and Unity clip generation. AI generation is used for mostly static assets such as backgrounds, equipment icons, portraits, effects, and props. This division protects frame-to-frame anatomy and pixel-cluster quality while preserving automation where temporal consistency is not required.
