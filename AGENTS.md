# Repository Notes

## Server Structure

- `server/src/api`: HTTP helpers and route matching. Keep request parsing and response formatting here.
- `server/src/projects`: project naming, validation, create/update/delete/touch logic.
- `server/src/content`: uploaded content, image/video import, thumbnails, media paths, and file responses.
- `server/src/colmap`: COLMAP settings, job state, process commands, pipeline, and result parsing.
- `server/src/gaussian-splat`: Gaussian Splatting settings, trainer discovery/bootstrap, runtime env, pipeline, and result lookup.

Import domain code from the domain folders directly, for example `server/src/content/index.ts`,
`server/src/colmap/index.ts`, or `server/src/gaussian-splat/index.ts`. Do not add top-level
single-export wrapper files for new domains.

## Client Structure

- `client/src/api`: browser API client for backend requests.
- `client/src/app`: workspace controller hooks and app-level orchestration helpers.
- `client/src/projects`: project navigation, empty state, and project modals.
- `client/src/content`: image/video upload UI, gallery, lightbox, and content settings.
- `client/src/reconstruction`: COLMAP and Gaussian Splatting controls and pipeline display.
- `client/src/logs`: log viewer UI.
- `client/src/results`: result viewer modal composition.
- `client/src/styles`: CSS split by UI responsibility.
- `client/src/viewer`: Three.js/gsplat renderers.

Keep `client/src/App.tsx` as a composition layer. Put request logic in `api`, state orchestration in
`app`, and feature UI inside the relevant domain folder.

## 3DGS Viewer Coordinate Guardrail

- The 3DGS viewer intentionally reuses the COLMAP viewer space for COLMAP points and camera models.
  COLMAP points/cameras must keep matching the regular COLMAP viewer.
- Gaussian splat PLY data stays in native exported PLY space. Do not transform loaded `SPLAT.Splat`
  objects for display alignment and do not call post-load `applyScale`, `applyRotation`,
  `applyPosition`, or `recalculateBounds` for this bridge.
- `server/src/gaussian-splat/modelTransform.ts` returns coupled values: `modelToColmap` aligns splat
  centers to COLMAP, while `splatCoverageScale` keeps gaussian footprints dense after robust scaling.
  If one changes, verify the other or the splat model can become thin and gappy.
- `client/src/viewer/gaussianSplatCamera.ts` is the space bridge: only the gsplat render camera crosses
  from COLMAP viewer space into native splat space.
- `client/src/viewer/gaussianSplatLoader.ts` applies `splatCoverageScale` by patching PLY
  `scale_0/1/2` before `gsplat` loads the file. Do not replace this with post-load typed-array
  mutation; it previously caused detached/out-of-bounds buffer errors.

## Refactoring Guardrail

Before large server refactors, run:

```bash
npm run check:large-files:server
```

Before large client refactors, run:

```bash
npm run check:large-files:client
```

Use `npm run check:large-files` when you need the full repository scan. Both commands report source
files over 450 lines. Treat those files as candidates for splitting by responsibility before adding
more behavior.

## Verification

For server-only changes, run:

```bash
npm run build --workspace server
```
