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
