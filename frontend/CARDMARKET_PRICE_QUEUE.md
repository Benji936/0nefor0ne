# Cardmarket price-resolution queue

Generated from live Supabase and YGOPRODeck data on 2026-08-28.

This queue contains 260 actionable card groups:

- 69 LOB groups need version and rarity identity first.
- 191 groups have verified identity but still need collector numbers.

Run every command from `frontend`. The scripts write each completed group immediately, so stopping for a CAPTCHA or terminal interruption does not discard earlier work. Japanese expansions are excluded.

## 1. Resolve LOB identities first

Run this command repeatedly until it says `complete; no unresolved sibling identities`:

```bash
node --env-file=.env scripts/cardmarket-sweep.mjs \
  --targeted --include-attempted \
  --expansion 1064 --group-limit 10
```

LOB identity groups currently missing:

```text
Fireyarou
Fissure
Flame Ghost
Flame Manipulator
Flower Wolf
Forest
Gaia The Fierce Knight
Gaia the Dragon Champion
Giant Soldier of Stone
Goblin's Secret Remedy
Green Phantom King
Hard Armor
Hinotama Soul
Kagemusha of the Blue Flame
King Fog
Kumootoko
Laser Cannon Armor
Left Arm of the Forbidden One
Left Leg of the Forbidden One
Legendary Sword
Lesser Dragon
Machine Conversion Factory
Man Eater
Man-Eater Bug
Meda Bat
Metal Dragon
Misairuzame
Monster Egg
Monster Reborn
Mystical Moon
Nemuriko
Petit Dragon
Raigeki
Raise Body Heat
Ray & Temperature
Reaper of the Cards
Red Medicine
Red-Eyes Black Dragon
Remove Trap
Right Arm of the Forbidden One
Right Leg of the Forbidden One
Root Water
Silver Bow and Arrow
Silver Fang
Skull Red Bird
Sogen
Sparks
Spike Seadra
Spirit of the Harp
Steel Ogre Grotto #1
Stop Defense
Succubus Knight
Swords of Revealing Light
Terra the Terrible
The 13th Grave
The Furious Sea King
Trap Hole
Tripwire Beast
Turtle Tiger
Two-Mouth Darkruler
Two-Pronged Attack
Tyhone
Umi
Uraby
Vile Germs
Violet Crystal
Wasteland
Witty Phantom
Yami
```

## 2. Backfill collector numbers

Use this command template. Replace `<ID>` and `<COUNT>` with a row from the table:

```bash
node --env-file=.env scripts/cardmarket-sweep.mjs \
  --targeted --collector-numbers --include-attempted \
  --expansion <ID> --group-limit <COUNT>
```

For rows larger than 10, use `--group-limit 10` and repeat the command until the script reports no repeated rarities missing collector numbers. Smaller rows can use their exact count.

| ID | Set | Expansion | Missing | Suggested runs |
|---:|:---|:---|---:|---:|
| 1051 | SDY | Starter Deck: Yugi | 42 | 5 × 10 |
| 1055 | SDK | Starter Deck: Kaiba | 45 | 5 × 10 |
| 1064 | LOB | Legend of Blue Eyes White Dragon | 27 | 3 × 10, after identity phase |
| 1255 | TKN1 | Token set | 1 | 1 × 1 |
| 1459 | LC04 | Legendary Collection 4: Joey's World | 1 | 1 × 1 |
| 1505 | NECH | The New Challengers | 14 | 2 × 10 |
| 1520 | SECE | Secrets of Eternity | 14 | 2 × 10 |
| 1674 | YGLD | Yugi's Legendary Decks | 13 | 2 × 10 |
| 1709 | YS16 | Starter Deck: Yuya | 1 | 1 × 1 |
| 2355 | LEHD | Legendary Hero Decks | 1 | 1 × 1 |
| 2391 | SS01 | Speed Duel: Destiny Masters | 1 | 1 × 1 |
| 2496 | SS03 | Speed Duel: Ultimate Predators | 1 | 1 × 1 |
| 3029 | SS04 | Speed Duel: Match of the Millennium | 1 | 1 × 1 |
| 4399 | SGX1 | Speed Duel GX: Duel Academy Box | 2 | 1 × 2 |
| 4687 | VS15 | Duelist Entry Deck VS | 7 | 1 × 7 |
| 5180 | SGX3 | Speed Duel GX: Duelists of Shadows | 2 | 1 × 2 |
| 5316 | SBC1 | Speed Duel: Streets of Battle City | 2 | 1 × 2 |
| 5420 | STAS | 2-Player Starter Set | 1 | 1 × 1 |
| 5563 | BLC1 | Battles of Legend: Chapter 1 | 1 | 1 × 1 |
| 5670 | BLTR | Battles of Legend: Terminal Revenge | 4 | 1 × 4 |
| 5909 | SDWD | Structure Deck: Blue-Eyes White Destiny | 1 | 1 × 1 |
| 6370 | L5DD | Legendary 5D's Decks | 1 | 1 × 1 |
| 6489 | L26D | Legendary Modern Decks 2026 | 3 | 1 × 3 |
| 6660 | LAVD | Legendary Arc-V Decks | 5 | 1 × 5 |

Copy and paste one command at a time:

```bash
node --env-file=.env scripts/cardmarket-sweep.mjs --targeted --collector-numbers --include-attempted --expansion 3029 --group-limit 1
node --env-file=.env scripts/cardmarket-sweep.mjs --targeted --collector-numbers --include-attempted --expansion 4399 --group-limit 2
node --env-file=.env scripts/cardmarket-sweep.mjs --targeted --collector-numbers --include-attempted --expansion 4687 --group-limit 7
node --env-file=.env scripts/cardmarket-sweep.mjs --targeted --collector-numbers --include-attempted --expansion 5180 --group-limit 2
node --env-file=.env scripts/cardmarket-sweep.mjs --targeted --collector-numbers --include-attempted --expansion 5316 --group-limit 2
node --env-file=.env scripts/cardmarket-sweep.mjs --targeted --collector-numbers --include-attempted --expansion 5420 --group-limit 1
node --env-file=.env scripts/cardmarket-sweep.mjs --targeted --collector-numbers --include-attempted --expansion 5563 --group-limit 1
node --env-file=.env scripts/cardmarket-sweep.mjs --targeted --collector-numbers --include-attempted --expansion 5670 --group-limit 4
node --env-file=.env scripts/cardmarket-sweep.mjs --targeted --collector-numbers --include-attempted --expansion 5909 --group-limit 1
node --env-file=.env scripts/cardmarket-sweep.mjs --targeted --collector-numbers --include-attempted --expansion 6370 --group-limit 1
node --env-file=.env scripts/cardmarket-sweep.mjs --targeted --collector-numbers --include-attempted --expansion 6489 --group-limit 3
node --env-file=.env scripts/cardmarket-sweep.mjs --targeted --collector-numbers --include-attempted --expansion 6660 --group-limit 5
```

### SDY — expansion 1051

```text
Ancient Elf
Ansatsu
Baron of the Fiend Sword
Book of Secret Arts
Card Destruction
Castle Walls
Celtic Guardian
Change of Heart
Claw Reacher
Curse of Dragon
Dark Hole
Dark Magician
De-Spell
Dian Keto the Cure Master
Doma The Angel of Silence
Dragon Capture Jar
Dragon Zombie
Fissure
Gaia The Fierce Knight
Giant Soldier of Stone
Great White
Last Will
Magical Ghost
Man-Eater Bug
Monster Reborn
Mystic Clown
Reinforcements
Remove Trap
Reverse Trap
Silver Fang
Sorcerer of the Doomed
Soul Exchange
Sword of Dark Destruction
The Stern Mystic
Trap Hole
Trap Master
Two-Pronged Attack
Ultimate Offering
Waboku
Wall of Illusion
Witty Phantom
Yami
```

### SDK — expansion 1055

```text
Ancient Telescope
Battle Ox
Castle Walls
D. Human
Dark Assailant
Dark Energy
Dark Hole
Dark Titan of Terror
De-Spell
Destroyer Golem
Fissure
Gyakutenno Megami
Invigoration
Judge Man
Just Desserts
Kojikocy
Koumori Dragon
La Jinn the Mystical Genie of the Lamp
Lord of D.
Master & Expert
Monster Reborn
Mysterious Puppeteer
Mystic Clown
Mystic Horseman
Ogre of the Black Shadow
Reinforcements
Remove Trap
Reverse Trap
Rogue Doll
Rude Kaiser
Ryu-Kishin
Ryu-Kishin Powered
Skull Red Bird
Sogen
Swordstalker
Terra the Terrible
The Flute of Summoning Dragon
The Inexperienced Spy
The Wicked Worm Beast
Trap Hole
Trap Master
Two-Pronged Attack
Ultimate Offering
Unknown Warrior of Fiend
Uraby
```

### LOB — expansion 1064

Run only after the identity phase completes.

```text
Aqua Madoor
Armaill
Armed Ninja
Armored Starfish
Basic Insect
Celtic Guardian
Charubin the Fire Knight
Curse of Dragon
Dark Gray
Dark Hole
Dark King of the Abyss
Dark Magician
Darkfire Dragon
Darkworld Thorns
Dissolverock
Dragon Capture Jar
Drooling Lizard
Electro-Whip
Enchanting Mermaid
Exodia the Forbidden One
Fiend Reflection #2
Final Flame
Firegrass
Gravedigger Ghoul
Mystical Elf
Polymerization
Skull Servant
```

### Remaining expansions

- **1255 TKN1:** Sheep Token
- **1459 LC04:** Sheep Token
- **1505 NECH:** 1st Movement Solo; CXyz Barian Hope; Edge Imp Sabres; El Shaddoll Fusion; Fire Lake of the Burning Abyss; First of the Dragons; Herald of the Arc Light; Lancephorhynchus; Machina Megaform; Number 39: Utopia Beyond; Qliphort Carrier; Qliphort Helix; Rescue Hamster; Taotie, Shadow of the Yang Zing
- **1520 SECE:** El Shaddoll Wendigo; Good & Evil in the Burning Abyss; Infernoid Antra; Jinzo - Jector; Lightning Rod Lord; Qliphort Cephalopod; Satellarknight Rigel; Skilled Blue Magician; Superheavy Samurai Flutist; Superheavy Samurai Trumpeter; Superheavy Samurai Warlord Susanowo; Thunderclap Skywolf; Void Launch; Void Seer
- **1674 YGLD:** Buster Blader; Dark Magician Girl; Jack's Knight; King's Knight; Kuriboh; Magical Hats; Mirror Force; Monster Reborn; Monster Recovery; Multiply; Polymerization; Queen's Knight; Swords of Revealing Light
- **1709 YS16:** Hippo Token
- **2355 LEHD:** Monster Reborn
- **2391 SS01:** Rogue Doll
- **2496 SS03:** White Elephant's Gift
- **3029 SS04:** Polymerization
- **4399 SGX1:** Polymerization; Reinforcement of the Army
- **4687 VS15:** Call of the Haunted; Dust Tornado; Malevolent Nuzzler; Mystical Space Typhoon; Negate Attack; Rush Recklessly; Trap Hole
- **5180 SGX3:** Different Dimension Gate; Foolish Burial
- **5316 SBC1:** Magician of Faith; Polymerization
- **5420 STAS:** Mannadium Fearless
- **5563 BLC1:** Cyber Dragon
- **5670 BLTR:** Genex Ally Birdman; Medallion of the Ice Barrier; Ritual Beast Ulti-Cannahawk; Void Imagination
- **5909 SDWD:** Blue-Eyes White Dragon
- **6370 L5DD:** Called by the Grave
- **6489 L26D:** Called by the Grave; Triple Tactics Talent; Triple Tactics Thrust
- **6660 LAVD:** Ash Blossom & Joyous Spring; Called by the Grave; Effect Veiler; S:P Little Knight; Triple Tactics Talent

## 3. Resolve RA05 with the anomaly-safe mode

RA05 is deliberately excluded from normal sweeps because its expansion listing
and exact-name search can return fewer rows than Cardmarket actually has. The
dedicated mode follows every returned placeholder to its own product detail
page and writes a printing only when all local products are uniquely accounted
for. Under-returned groups remain untouched.

Run the full unresolved set once:

```bash
node --env-file=.env scripts/cardmarket-sweep.mjs --ra05 --group-limit 150
```

Completed groups are written immediately, so the command is safe to rerun after
a CAPTCHA or interruption. To verify behavior without writing, add `--dry-run`.

## 4. Why some ranges will remain

These commands resolve missing Cardmarket rarity, version, and collector-number identities. A range can remain when Cardmarket has several artwork products with the same set, rarity, and collector number. Blue-Eyes, Dark Magician, and Red-Eyes have many such products. The current data cannot select one artwork product honestly, so the website keeps the range.

The site displays trend price when available and low price otherwise.
