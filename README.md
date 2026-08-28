# Detention Timer

A simple timer board for running detention with late students, styled to match
[class.avendano.xyz](https://class.avendano.xyz).

- Add each student with preset minute chips (5/10/15/20) or a custom length.
- Big Fragment Mono countdown digits, readable across the room.
- Timestamp-based timers with localStorage persistence — refreshing or closing
  the page loses nothing, and background-tab throttling can't cause drift.
- When time expires the card flips to a green "Free to go" state with a
  WebAudio chime (no external sound files) that repeats until dismissed.
- Screen wake lock while timers run, so a projected screen stays awake.

Static site — no build step. Open `index.html` or serve the folder.

Deployed on Vercel with `vercel deploy --prod`.
