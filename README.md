# Opus — A Symphony of Light

A browser-based **orchestral / classical music visualizer**. Offer a recording and its
voices become rivers of light: a curl-flow field of glowing particles around a living,
morphing core. Everything is analysed **entirely in your browser** — no audio is uploaded.

Built with vanilla JavaScript, the HTML5 **Canvas 2D** API and the **Web Audio API**.
No visualization libraries. Bundled with [Vite](https://vitejs.dev) for a dev server and a
tiny static build (~7 KB gzipped).

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Then click **Choose a recording** (or **Hear a demo**, or drag any audio file onto the page).

> Open it in **Chrome** for the most reliable Web Audio behaviour.

## Build

```bash
npm run build    # → dist/  (static, deploy anywhere)
npm run preview  # serve the production build locally
```

## Deploy to GitHub Pages

**Live site:** https://blackjacket1403.github.io/opus/

This repo deploys via the **`gh-pages` branch** (Pages → Source: *Deploy from a branch* →
`gh-pages` / root). To re-deploy after changes:

```bash
npm run build
git subtree push --prefix dist origin gh-pages   # or push dist/ to gh-pages by your preferred means
```

`vite.config.js` sets `base: './'`, so the build works under any Pages URL
(`https://<user>.github.io/<repo>/`), a custom domain, or local preview — no path tweaks needed.

> Prefer auto-deploy on push? See `deploy-workflow.example.yml` — move it to
> `.github/workflows/deploy.yml` (requires a token with the `workflow` scope) and switch
> Pages Source to *GitHub Actions*.

## Controls

| Action | |
|---|---|
| **Space** | play / pause |
| **F** | fullscreen |
| **H** | hide / show the interface |
| **Q** | cycle render quality (Low / Med / High) |
| drag & drop | load an audio file |

## Performance

Opus auto-tunes to your machine: an FPS governor scales the pixel ratio and particle count
across quality tiers, particle bloom is drawn from pre-baked glow sprites (no per-particle
canvas shadow), rendering pauses on a hidden tab, and `prefers-reduced-motion` starts at a
calmer tier. Press **Q** to override the automatic quality.

## The voices

Six instrument registers are mapped to frequency bands and shown in the legend:
Contrabass · Violoncello · Viola · Violino · Flauto · Ottavino. Note that true
per-instrument separation from a stereo mix is not possible — this is an *informed
approximation* using instrument frequency ranges, not exact stem isolation.

## Credits

Demo recording: **Vivaldi — *The Four Seasons*, "Spring", Mvt. 1 (Allegro)**, performed by
John Harrison with the Wichita State University Chamber Players, via Classicals.de —
licensed **CC BY-SA 3.0**.
