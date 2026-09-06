# What a shared object-type vocabulary has to carry — Aurora's ask

**2026-09-06 · aurora · for the hub's `OBJECT-TYPE-VOCAB` row, LIVE-OBJECTS**

The hub's row starts the day this ask is an in-tree artifact rather than a
sentence in mail. This is that artifact. It states what Aurora needs and why,
**measured from Aurora's two object models rather than reasoned from the
project note**, and it deliberately does not propose a schema — the shape is the
contract repo's to choose.

## 0. Why this exists

`LIVE-OBJECTS` wants a spawn that happened in the running game to become a
placement in the level. Aurora's half of that is **one wire**: an inbound event
into an `add-object` command that already exists (`src/core/editing/commands.ts`
`AddObjectCommand`, applied at `history.ts:294-299`, persisted by
`src/core/project/aeon/save.ts:206-212`). Nothing publishes the event yet, and
when something does, **it has to name an object type in words both sides mean
the same way.** That naming is the vocabulary.

## 1. The two models, measured

**Aeon — `ObjectPlacement`** (`src/core/model/s4-types.ts:113-125`):

| field | type | note read from source |
|---|---|---|
| `x`, `y` | number | **Section-LOCAL pixels, 0..$7FF.** The exporter hard-fails outside that range. |
| `typeId` | **string** | |
| `subtype` | number | |
| `xflip`, `yflip` | boolean, **optional** | Absent reads back undefined and exports as unflipped; every act saved before they existed omits them. |

**Classic — `S1ObjectEntry`** (`src/core/formats/classic/s1-objpos.ts:24-36`):

| field | type | note read from source |
|---|---|---|
| `x`, `y` | number | 6-byte packed entry; **`y` is 12 bits** (`Y_MASK = 0x0fff`). |
| `id` | **number** | |
| `subtype` | number | |
| `xflip`, `yflip`, `respawn` | boolean, **required** | |

## 2. What the vocabulary must settle, in order of how much it costs to get wrong

### 2.1 Identity is a string on one side and a number on the other

This is the whole reason a vocabulary is needed rather than a field. Aeon names a
type with `typeId: string`; classic names it with `id: number`, which is the byte
that reaches the ROM. **A publisher saying "an object of type T spawned" has to
say T in a form both can resolve**, and neither existing spelling is that form:
a number is meaningless to aeon, and a string has no ROM encoding in classic.

**Aurora's ask: the vocabulary carries the type identity itself, and each game's
mapping to its own spelling is stated somewhere a tool can read.** Aurora does
not need them unified — it needs the correspondence to exist and be readable, so
a spawn published in one game's terms is not silently accepted in the other's.

⚠ **Nothing today refuses a wrong-game identity.** `typeId` is an unvalidated
string on the aeon side. If a publisher sends a numeric id and something coerces
it, Aurora will store a placement whose type is a number-as-string and export it
as an unknown type. **Whatever the vocabulary is, Aurora wants an identity it can
REFUSE**, not merely one it can store.

### 2.2 Whose coordinate space is a published spawn in

Aeon's `x`/`y` are **section-local and bounded at $7FF with a hard export
failure**; a spawn observed in a running game is a **world** position. So a
publisher's coordinates cannot be written through unconverted, and the conversion
is the section grid — which Aurora holds and the publisher may not.

**Aurora's ask: the event says which space its coordinates are in, explicitly, as
a field rather than by convention.** If it is world, Aurora converts and can
refuse a position outside the act. If it is already section-local, it must also
name the section, because "local" without an origin is not a position.

This is the one item where getting it wrong is silent: an unconverted world
coordinate is a perfectly valid section-local number for any world position under
$7FF, so the failure lands as an object in the wrong place rather than as an
error. **A unit without its frame is not a measurement** — the same defect this
lane fixed twice today on byte figures.

### 2.3 Fields one side has and the other does not

`respawn` exists in classic and not in aeon. The flips are required in classic
and optional in aeon **with a documented meaning for absence**.

**Aurora's ask: the vocabulary says what happens to a field the receiving game
has no place for — dropped, refused, or carried opaquely — and says it per
field rather than as a general rule.** Aurora currently round-trips unknown keys
in some formats and refuses them in others; it should not be guessing which
applies here.

## 3. What Aurora does NOT need, stated so the ask is not read as larger

- **No unified type namespace.** Two games with different objects is fine.
- **No schema for the spawn event's transport.** That is oracle's and the
  contract repo's.
- **No palette content.** The spawnable-object palette is a separate blocked row
  and does not gate this one.
- **No decision about permanence.** The owner ruled spawn is debug/throwaway and
  that permanent rings stay level editing in Aurora; nothing here reopens it.

## 4. What this ask is NOT evidence for

- **Nobody has published a spawn event**, so none of this is measured against a
  real payload. Every claim above is about Aurora's two models and what a
  publisher would have to say to reach them.
- **No emulator was run and no ROM was built** for this document.
- The classic side is included because the vocabulary is shared. **Whether
  LIVE-OBJECTS ever reaches classic is not Aurora's call** and is not assumed
  here.
