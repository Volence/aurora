# Owner feedback — Effects facet, 2026-08-26 (evening)

Given in session after the layer guides (item 43 pt 1), the column fix (item 45 tail)
and the band lens (item 43 pt 2) landed the same day. **Recorded close to verbatim,
untriaged, so the session that acts on it works from his words and not a paraphrase.**
The owner switched sessions immediately after giving it; nothing below was answered.

Screenshots he attached are in the session image cache (`6.png`..`9.png`), not the repo.

## The points, in his order

1. **Camera-size view.** "We should definitely have like a view to have the size of the
   view on camera on screen right? Like I have no idea what you can see from this."
   (Image 6: the map at a zoom where the 320x224 game window is not indicated anywhere.)

2. **Drawing IN a band / an accidental candidate he cannot remove.** "Is there a way to
   currently draw in a band? I double clicked and the animation tile popped up, which I
   don't know how to remove." (Image 7: the *candidate* lens lit at slots 183..184 — the
   click-to-seed gesture from the band lens fired on his double-click and he found no way
   to clear the candidate.) Also: "Is there a way to add these bands?"

3. **Left toolbar is bare.** "I think we need more tooling for this on the left, right
   now we only have the 'view' button."

4. **The 8-layer cap.** "Why can we have a max of 8 layers if they go well beyond what's
   viewable on screen. It should be 8 per what's drawn right?" (Layers are a world-Y
   division of the whole act; he expected the cap to be per-screen.)

5. **Terminology.** "What is plane a packed scroll factor vs plane b packed scroll
   factor?" (`fa`/`fb` and the packed-factor UI are unexplained on the surface.)

6. **The bands tool is confusing.** "First these purple tiles indicating animation don't
   like say what they do at all, draw left to right? rotate? draw in new tile?" (Image 8:
   the lens says WHICH cells animate but nothing about HOW — direction, mechanism, what
   'phase' means.)

7. **Curved scroll.** "Side note, how are we doing the curved scroll? I don't see what's
   setting it." (The `ojz_act1_depth` scene is named "curved horizon" and nothing in the
   form visibly carries the curve.)

8. **The actual authoring goal.** "If I wanted to do the thing where the trees here draw
   over the bg behind it with animation, how do I go about doing that with this tooling?"
   (Image 9: the four orange trunks boxed — he wants trunks in front of an animated
   background behind them. This is a priority/plane question plus band aiming, and it is
   the same subject fable's dark-filler ruling pointed at.)

9. **Vertical parallax.** "Do we have any vertical parallax in tooling yet?"

## What the recording session noted before switching (facts only, no rulings)

- Point 2's "animation tile" is the band lens's CANDIDATE highlight (seeded by click-to-
  aim, `From tile 183` in the New band form). Whether there is a clear affordance was not
  checked; if there is none, that is a defect in the parcel that landed today.
- Point 6 is the purple-boxes lesson a second time: the lens now says WHAT is highlighted
  and still does not say what the animation DOES.
- Points 4, 5, 7, 9 are engine-model questions as much as UI ones; several answers live
  in `empyrean/docs/AURORA_EFFECTS_SCHEMA.md` and should be cited from there.
- Point 8 is the one that describes what he is actually trying to make. Triage the rest
  toward it.
