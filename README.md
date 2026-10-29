# Sizzle Lab · A little kitchen break

A small, unhurried browser cooking prototype. Slide golden potato pieces around a pan, toss to turn them, adjust the heat and listen to the sizzle change. There is no timer, burning or losing. Plate up whenever you like.

## Play

1. Open `index.html` and click **Add potatoes**. This deliberate tap also requests browser audio playback.
2. Drag inside the pan to tilt it. Release to level the pan.
3. Tap **Flip** to toss the potatoes and cook their other sides. Space also flips when focus is not on a control.
4. Adjust **Heat**. Higher heat cooks faster and makes frying louder. Off stops cooking and frying.
5. **Plate up** serves the batch at any point. Both sides golden is a soft goal, not a requirement.
6. Pause, start fresh, or cook another batch. Sound and volume are independent of heat.

## Phone motion

Use an HTTPS page, ideally directly in Safari or Chrome rather than an embedded social-app browser. Tap **Enable motion**, grant permission if asked, and wait for the sensor check. **Calibrate** records a comfortable holding angle. Tilt from that position to slide food; a gentle flick may trigger a toss. No large shakes are required.

Tilt uses `deviceorientation`; toss detection uses the magnitude of acceleration, with a gravity-filtered fallback. The flick detector is a prototype threshold, not precise gesture recognition: sideways shaking may also trigger it. Tossing has a cooldown and cannot repeat in midair. Sensor readings are processed locally, not recorded or transmitted.

Permissions, sensor availability, units and browser behavior vary. A successful permission result does not prove sensor data is arriving. The page waits 3.5 seconds and reports absent or partial data. Denial, missing sensors, or HTTP never prevent using drag and the Flip button. **Disable motion** switches back to pointer control. Browser permissions can be changed in browser/site settings.

## Running / publishing

No dependencies, installation, build, API keys, microphone, model or server are required for pointer play. Keep `index.html`, `style.css` and `app.js` together. Double-click `index.html` to play locally; actual phone sensors should be tested through HTTPS.

To publish on GitHub Pages, select this repository's **Settings → Pages → Deploy from a branch → main → /(root)**. The published URL is shown by GitHub after deployment. Source files are prepared for this; a source commit alone does not confirm Pages is enabled.

## Input → response → feedback

| Input | Response | Feedback |
|---|---|---|
| Drag / phone tilt | Apply force to pieces inside the pan | Sliding food and a gently tilting pan |
| Flip / phone flick | Toss, then switch the face in contact with heat | Airborne rotation; quieter frying in the air, a sizzle on landing |
| Heat slider | Change cooking rate and audio intensity | Bubbles, steam, browning and changing sound |
| Plate up | Stop cooking and present the batch | Serving plate and a short summary |

## Interruptions and limitations

- Leaving the page or window automatically pauses. Cooking and the toss animation freeze; audio is muted. Resume explicitly.
- Audio failures leave the simulation usable; sound is synthesized filtered noise, not a cooking recording.
- Potatoes have two simplified browning values. Heat has immediate effect; pan thermal inertia, real fluid physics and full food rotations are not modeled.
- Progress measures both sides. Without flipping it stops at 50%. Golden pieces never burn.
- This is an initial prototype; physical phone sensor feel and speaker quality need user trials. Automated checks cannot establish them.
- There is no saved progress, account, tracking, external font, image download or third-party runtime.
- Buttons are keyboard accessible and Flip has a space shortcut. Canvas tilting has no full non-pointer keyboard equivalent yet.

## Files and credits

Optional developer checks: with Node.js installed, run `node tests.cjs`. No packages are needed. Checks use a simulated browser for cooking, physics bounds, cooldown, reset, pause, motion permission fallbacks and master mute. They do not replace browser visual checks or physical phone/audio testing.

- `index.html`: interface and accessible controls.
- `style.css`: responsive warm kitchen layout.
- `app.js`: simulation, Canvas art, audio and optional sensor input.
- `PROCESS.md`: design decisions, AI use and pending actual user trial.

Concept direction: the author proposed phone-based pan tossing and relaxing frying sounds. OpenAI Codex assisted with implementation and documentation. Artwork is drawn in Canvas; frying sounds are synthesized with Web Audio. No cooking recordings, image packs or borrowed tutorial source are included.
