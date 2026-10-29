# Process — prototype 1

## Intention

The author wanted to explore a separate project while preserving the completed Graveyard Rush game: using phone movement to imitate tossing a pan, with soothing frying sound. The prototype is a small interaction study rather than a full cooking simulator.

## Decisions

- One pan and one ingredient keep the interaction focused.
- Start with deliberate Add potatoes input; audio begins only after user interaction.
- Drag and Flip provide the same cooking loop without sensors. Motion is optional and checked using actual incoming data.
- Tilt slides food; a thresholded acceleration flick triggers a scripted toss. The threshold and gesture quality need device testing.
- Frying noise responds continuously to heat and contact. Tossing lowers it; landing triggers an extra burst.
- Both sides need cooking, but there is no failure timer or burn penalty. The author emphasized relaxation.
- Pause on leaving the page; do not let food silently cook in the background.

## AI assistance

OpenAI Codex generated substantial HTML, CSS and JavaScript, synthesized-noise audio logic, Canvas art and these document drafts. This is an AI-assisted prototype, not entirely hand-written work. The project author supplied the core concept and will evaluate and direct revisions.

Suggestion kept: motion and sound form a direct loop, with the frying sound quieter while food is airborne. Scope limited: do not build a full recipe game or require motion hardware; one ingredient and a pointer fallback are enough to test the idea.

## Actual user trial — pending

No completed participant trial is claimed. Test on an actual phone before drawing conclusions about sensor feel or sound quality.

- Date / device / browser: to record.
- Can the tester start and hear audio without explanation? To observe.
- Can they understand drag, Flip and the two-sided browning progress? To observe.
- Does motion permission work, and do tilt and gentle toss feel reliable? To observe.
- Does audio feel pleasant? Does the landing sound match the action? To observe.
- One observed hesitation and the resulting change or decision to keep the design: to record.

Do not identify the participant or publish recordings without permission. Preserve real commits as development proceeds.
