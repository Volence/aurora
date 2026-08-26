// THE GAME SCREEN, in pixels — Aurora's one statement of it.
//
// DERIVED, NOT TYPED. These mirror aeon's own constants:
//
//     /home/volence/sonic_hacks/aeon/engine/system/constants.emp
//         pub const SCREEN_WIDTH  = 320
//         pub const SCREEN_HEIGHT = 224
//
// which `engine/level/camera.emp:14` imports (`use engine.constants.{...,
// SCREEN_WIDTH, SCREEN_HEIGHT, ...}`) and clamps the camera against
// (`camera.emp:312` "[0, level_width − SCREEN_WIDTH]", `:430` for Y). So a
// rectangle of this size at the camera's unbiased top-left IS what the player
// sees — the H40 mode, 224-line NTSC frame.
//
// Aurora never imports aeon at runtime (this is an editor, aeon is a sibling
// checkout that may be absent). The agreement is enforced instead by
// `__tests__/screen.test.ts`, which reads that file from the sibling path and
// asserts equality — and SKIPS WITH A MESSAGE when the checkout is missing,
// never silently green. `SCREEN_CONSTANT_SOURCE` below is what that test reads,
// so the citation in this docblock and the thing being checked are one record.

export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 224;

/** Where the numbers above come from, as the test reads them. */
export const SCREEN_CONSTANT_SOURCE = {
  /** Relative to the aeon checkout root. */
  file: 'engine/system/constants.emp',
  width: 'SCREEN_WIDTH',
  height: 'SCREEN_HEIGHT',
} as const;
