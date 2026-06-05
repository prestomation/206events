# Image display: banners and the lightbox

How venue/source and event photos are rendered in the redesigned web UI
(`web/src/redesign/`). Two problems motivated this, and two shared atoms solve
them.

## Problem 1 — banners were arbitrarily cropped

Banner photos (the venue/source header on `ChannelDetail`, and the event photo
on `EventDetail`) were a single `<img>` at a fixed height with
`object-fit: cover`. `cover` fills the box by **center-cropping**, so a logo or
wordmark that doesn't sit dead-center loses its edges — e.g. the "Ballard Brood"
wordmark showed only its middle.

### Solution: blurred-backdrop "contain" (`BannerImage`)

`BannerImage` (`web/src/redesign/atoms.jsx`) renders the image **whole** with
`object-fit: contain` so nothing is cropped, over a blurred, scaled copy of the
**same image** (`object-fit: cover`) that fills the box. The letterboxing then
reads as an intentional treatment rather than empty gaps. This works for both
photos (a brewery interior fills richly) and logos (a wordmark shows in full)
with no per-source configuration.

CSS lives under the `.app206` scope in `web/src/index.css`
(`.a-banner`, `.a-banner-bg`, `.a-banner-fg`).

## Problem 2 — event images couldn't be read

Event images appeared only as small squares (56px thumbnails in channel rows,
120px in map popups) and a 200px cover-cropped banner. Posters frequently *are*
the information (lineups, set times, fine print) and that detail was unreadable.

### Solution: click-to-zoom lightbox (`Lightbox` + `openLightbox`)

A single `Lightbox` instance is mounted at the App206 root and opened from
anywhere via `app.openLightbox(src, alt)`. It shows the full image at natural
size (`object-fit: contain`, capped to the viewport) on a dark backdrop, and is
dismissed by clicking the backdrop, the close button, or pressing `Escape`. Body
scroll is locked while open.

Every image surface routes into it:

| Surface | Component / handler |
|---|---|
| Venue/source banner (`ChannelDetail`) | `BannerImage` |
| Event banner (`EventDetail`) | `BannerImage` |
| Event row thumbnail (`ParsedEventRow`) | `EventThumb` (stays `cover` at 56px; click enlarges) |
| Map popup photo (`EventsMap.renderPopupHtml`) | delegated click listener in `App206` on `.map-popup-image` |

The map popup is hand-built DOM (outside React, to keep `react-dom/server` out
of the client bundle), so its photo is wired to the lightbox with a single
delegated `click` listener on `document` rather than a per-popup React handler.

## State

`App206` owns `lightbox` (`null` | `{ src, alt }`) with `openLightbox` /
`closeLightbox`, exposed on the app model context. The components are pure leaf
atoms in `atoms.jsx`; tests live in `web/src/redesign/imageViewer.test.jsx`.

Images remain links only — the app never stores image bytes. Source `imageUrl`
plumbing (schema → `venues.json` → channel view-model) is unchanged.
