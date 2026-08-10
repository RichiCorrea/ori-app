# Drum sample licenses

Factory-bundled drum samples and their source. Do not add audio to this
folder unless it's CC0, or original material Richi recorded/produced
himself (no third-party rights involved).

| File | Source | License | Notes |
|---|---|---|---|
| `dead_drum/kick.wav` | Recorded/produced by Richi | Owned, no restriction | |
| `dead_drum/snare.wav` | Recorded/produced by Richi | Owned, no restriction | |
| `dead_drum/hat.wav` | Recorded/produced by Richi | Owned, no restriction | |
| `lofi_percusion/kick.wav` | Purchased commercial sample pack (Richi) | Purchased, cleared by Richi | |
| `lofi_percusion/snare.wav` | Purchased commercial sample pack (Richi) | Purchased, cleared by Richi | |
| `lofi_percusion/hat.wav` | Purchased commercial sample pack (Richi) | Purchased, cleared by Richi | |
| `funk_br/kick.wav` | Freesound, "BrazilianFunk Kick-Trepadeira Maldita" (CAT-FOX_ALEX, pack "Ultimate Brazilian Funk/Phonk Kits Vol.2") | CC0 | https://freesound.org/s/864119/ |
| `funk_br/snare.wav` | Recorded/produced by Richi (`REF/Snare-BRAZIL.wav`) | Owned, no restriction | |
| `funk_br/perc.wav` | Freesound, "SYT-Synthetic Perc 1" (CAT-FOX_ALEX, pack "Native Percussions of CAT-FOX ALEX Sample Pack") | CC0 | https://freesound.org/s/850157/ |

Funk BR's hat is still synthesized (no bundled sample) — see `drumKits.funk_br` in
`src/music-data.js`. All three funk_br files were downloaded from Freesound in
original quality (FLAC/WAV, 24/32-bit, 44.1kHz), converted to 16-bit WAV with
a short safety fade at the tail — no other processing.

Note: most commercial packs license the sounds for use *in your own
productions*, not for redistributing the raw files inside a shipped app —
worth a quick check of the pack's EULA specifically for that case before
a public release, since that's a different use than what most packs cover.
