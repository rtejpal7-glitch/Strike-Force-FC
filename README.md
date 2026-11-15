# Strike Force FC — First-Person Football Combat

A browser-based 3D first-person game built with **Three.js + React**. You auto-run and dribble from your own
goal to the opponent's goal. Each defender who closes in stops you and starts a fight. Pick a weapon, take them
down, beat the goalkeeper boss, and score.

## Goal celebrations with your own music 🎶

Put audio clips (MP3, WAV, OGG, M4A, AAC, FLAC, WebM, Opus) in **`celebration-audio/`**. After you score, the
celebration screen lists every clip in that folder. Pick one and your player dances to its beat (beats are detected
from the audio live). The dance runs until the track ends or you press Stop, and the camera, crowd, confetti and
flame jets all follow the music. The file name becomes the title, so `my-goal-song.mp3` shows as "My Goal Song".

New files appear automatically: the game reads a live list of the folder, re-checked every 3 seconds while the screen
is open, so you don't need to change any code or restart. This needs the game to run through its local server:

```bash
npm run play     # no build step: serves play.html at http://localhost:8080
npm run dev      # development server
```

If you open `play.html` by double-clicking, browsers won't let a page read folders. Use **Load folder** or
**Add files** on the celebration screen, or drag and drop clips onto it. A built-in anthem is always there too.

**If a clip won't play:** the game first streams the file. If the browser refuses, it automatically decodes the whole
file instead. If both fail, a red card explains why: still copying, damaged, copy-protected (iTunes or Apple Music) or an
unsupported format like WMA. Converting the file to a standard MP3 fixes almost every case.

## Quick play (no install)

Run **`npm run play`** (needs only Node, no install) and open http://localhost:8080. You can also double-click **`play.html`**. It's a self-contained build that runs straight from your disk; it needs an internet
connection the first time so it can load Three.js and the fonts from a CDN.

> Opening `index.html` directly shows a blank page. That file is the Vite development entry and only works through
> `npm run dev` below.

## Run it from source

```bash
npm install
npm run dev        # opens http://localhost:5173
npm run build      # production build in dist/
```

Requires Node 18+ and a WebGL-capable browser.

## Controls

| Action | Input |
| --- | --- |
| Aim / fire | Mouse / left click (hold for the assault rifle), or Space |
| Switch weapon | 1–4, mouse wheel, Q (last weapon), or click the HUD icons |
| Reload | R (auto-reloads when the magazine is empty) |
| Zoom (sniper scope) | Right mouse button |
| Pause / mute | Esc or P / M |
| Voice commentary on/off | C |

## Gameplay

- You auto-run and dribble the whole time. There are no movement keys.
- Four defenders, then the goalkeeper. Each one is harder than the last: more HP, faster strafing, shorter tackle
  wind-ups, and a growing chance to side-step your shots.
- **Tackles:** a red **!** shows a slide tackle is coming. Deal enough damage during the wind-up to stagger the
  defender. If you don't, you lose *ball control*. Lose all of it and the move is over.
- **Goalkeeper (final boss):** 700 HP. He dives sideways and throws balls at you, which you can shoot out of the air.
  Below 50% HP he becomes ENRAGED and attacks faster. Hits on his gloves do half damage.
- Every defender you beat gives back 25 ball control and restocks ammo.
- Headshots deal 2× damage (2.5× with the sniper rifle). Shotgun damage drops off with distance.

## Broadcast features

- **Live commentary:** two commentators react to everything that happens, in GenZ slang. The lines show in a
  broadcast-style feed (bottom left) and are spoken with your browser's built-in voices. Press **C** or the 🎙 button
  to turn the voices on or off; the text feed always stays.
  Every line has a **mood** (hype, scream, shock, tense, sarcastic, sad). The line is split into phrases, and pitch,
  speed and volume change phrase by phrase: the voice climbs through big moments, punches shouted words and drops for
  sad ones. Big moments get an exclamation, a reaction from the co-commentator and a matching crowd "ooh" or groan.
  Pick each commentator's voice under *Commentator voices* on the start screen or in the pause menu. Microsoft Edge's free
  "Natural" voices sound far more human and are chosen automatically when they're available.
- **Replay cam:** when a defender goes down, a picture-in-picture window plays a slow-motion replay of the knockdown
  from a cinematic orbiting camera, then cuts to a crowd cam.
- **The crowd goes wild:** after every knockdown the crowd roars, claps, does a Mexican wave, raises its arms and
  fires off phone flashes, and flame jets go up at the corners. Beating the keeper and scoring also set off fireworks.
- **Graphics:** HDR bloom, MSAA, a broadcast colour grade (vignette, film grain, a speed blur at the edges while you
  sprint, and a red chromatic flash when you get hit), floodlight beams, and grass bump detail.

## Graphics settings & performance

Choose **Auto / High / Medium / Low** on the start screen or in the pause menu (the choice is remembered).

- **High:** bloom, the colour grade and 2048px shadows.
- **Medium:** standard rendering with shadows.
- **Low:** no shadows, lower resolution and a thinner crowd.

**Auto** starts on High and steps down if the frame rate stays under ~34 FPS. If the post-processed image ever comes out
black, it switches to standard rendering by itself. Press **F** to show an FPS counter.
If the 3D view stays black on every setting, turn on hardware acceleration in your browser
(Chrome: Settings → System → *Use graphics acceleration when available*).

## Project structure

```
src/
  App.jsx                    React root: mounts the engine and switches between screens
  styles.css                 HUD and menu styling
  ui/                        React HUD, menus, weapon icons, store hook
  game/
    GameEngine.js            renderer, main loop, phase state machine, HUD sync
    core/                    config & roster tuning, observable store, input
    environment/             stadium, pitch texture, goals with rippling nets, instanced crowd
    player/                  first-person camera controller, visible legs
    football/                dribbling and shot physics
    opponents/               procedural footballer model + AI state machine
    weapons/                 weapon stats, first-person models, ammo/reload/switch logic
    combat/                  raycast hit detection, keeper projectiles, visual effects
    audio/                   Web Audio synthesised SFX and crowd ambience (no asset files)
    commentary/              commentary lines + event-driven commentary engine (speech synthesis)
    replay/                  pose recorder and picture-in-picture replay / crowd cam
    celebration/             clip library (live folder manifest), beat tracker, dance moves, celebration camera
celebration-audio/           ← drop your celebration clips here
vite-plugin-celebration-audio.js   serves the live clip list in dev/build
serve.js                     zero-dependency server for play.html + the clip folder (npm run play)
    rendering/               post-processing (bloom, grade, vignette, grain)
```

All models and sounds are generated in code, so the project has no binary 3D or sound assets.
Characters come from `opponents/HumanBuilder.js`. It builds muscle-shaped limbs and torso, a sculpted head
(eye sockets, cheekbones, jaw and brow), eyeballs with irises and eyelids, a nose, lips and ears, and hair and beards
grown from the scalp (short, buzz, fade, long, curly, mohawk). It also builds hands with fingers, studded boots,
and fabric kits with a knit texture and printed names and numbers. Each player's look (skin, hair, eyes, jaw, nose,
brows, facial hair, height and build) is set in `core/config.js`.
Most tuning (opponent HP, tackle timings, weapon damage and so on) is in `src/game/core/config.js` and
`src/game/weapons/weaponDefs.js`.
