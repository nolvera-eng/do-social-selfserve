# Social Templates: DigitalOcean

A self-serve tool for DigitalOcean social posts: event, model launch and partnership designs.
Pick a template and a layout, fill in the copy, add partner logos or speaker photos, and
download a 1080 × 1080 (square) or 1920 × 1080 (landscape) PNG or a looping video.

| Template     | Layouts                               |
|--------------|---------------------------------------|
| Event        | Cohosts, One speaker, Two speakers    |
| Model launch | List, Spotlight                       |
| Partnership  | Side by side, Stacked, Promo          |

Partner and cohost marks are always logos (library logos as placeholders), each with a **Logo size**
slider (50–150%). For either, **Choose logo** picks one of the
272 white logos in `logos/` (exported from the shared Logos library in Figma, listed in `logos.js`), or
**Upload logo** takes your own SVG or PNG.

The background is a terrain drawn in code (Static); Animated flies slowly over it or turns it on a turntable
(`terrain-gl.js`, WebGL), and **Download MP4** records one clip (5–25 seconds) in real time (WebM in
browsers that can't record MP4). Speed sets how fast the terrain moves; over the last seconds of the
clip it crossfades into the frames just before the start, so the video loops
seamlessly.

**Text animation** (Fade in or Slide up) brings the logo, lines, pills and marks in one after another. With
the animated terrain the video starts with the entrance; with a still background the video is a short
clip of it. **Replay** plays it again in the preview; the PNG is always the finished post.

## Run

    python3 -m http.server 8020

Then open http://localhost:8020. Link to a layout directly with `#template/layout`,
like `#event/speakers`. Add `?solo` to see just the post at full size.

## Change the design

Everything lives at the top of `app.js`: colors in `COLOR`, fonts in `SANS` and `MONO`,
templates and the fields each layout uses in `TEMPLATES`, default copy in `DEFAULT_COPY`,
terrain shape in `TERRAIN`. Each layout is one function in `LAYOUTS`, with positions in pixels
on the 1080 × 1080 post.
