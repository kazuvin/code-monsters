# One-on-one duel design

## Product constraint

Code Monsters is designed around one programmable unit versus one authored rival. Only `volt`, `bastion`, and `relay` require combat animation. Builds are defined by skills and their order, not by a separate equipment layer.

## Run loop

1. Inspect the next rival's body and program summary.
2. Configure Volt's ordered normal program and one interrupt reaction.
3. Fight a deterministic one-on-one battle. Each fighter winds up independently, and impacts at the same timestamp resolve from one shared snapshot.
4. Spend the reward on one of four direct skill offers.
5. Complete five protocols, ending in a mirror match against Volt.

There is no equipment, unit recruitment, bench, formation order, partner targeting, or unit resale.

## Close-range counterplay

Close-range builds win by crossing projectile lanes and converting proximity into reliable damage:

- `vector-thrust` works on the ground or in the air and stops after an authored 18m burst. It replaces the redundant air-dash skill.
- Direct and homing projectiles have a minimum travel distance. They still move through close space, but cannot hit until armed, creating a real advantage after a successful approach.
- `enemyProjectileNear` can drive a reaction such as thrust, jump, or retreat once per incoming projectile. This lets a build spend its reaction slot on automatic evasive movement.
- `pulse-swipe` is a close circular strike with no knockback, so landing it preserves the range where a melee build is strongest.
- `dive-strike` can start only while descending from sufficient height. Damage is resolved from the actual landing coordinate, turning jump and approach order into an aerial-to-ground combo.

These rules use continuous `x`, `y`, velocity, shapes, and projectile clocks. There is no stored ground/air category.

## Encounter strategy

Every encounter is a complete rival build: one body, an ordered program, an optional reaction, a stat scale, and a reward. The build screen previews the rival program before battle. The five initial protocols cover rushdown, defense and knockback, slow control, corrosion attrition, and an overclocked mirror match.

Future variety should prefer new spatial skills, programs, arenas, and encounter rules before adding an animated unit or another parallel build system.

## Art production boundary

Character animation is hand-authored and processed by the deterministic sprite pipeline for QA, approval, Web export, and Unity clip generation. AI generation is used for mostly static assets such as backgrounds, skill icons, portraits, effects, and props.
