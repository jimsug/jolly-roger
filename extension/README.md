# Jolly Roger Browser Extension

## Project Structure

- src: TypeScript source files
- public: static files
- dist/chrome: output Chrome Extension directory
- dist/firefox: output Firefox Extension directory
- dist/{browser}/js: Generated JavaScript files

## Setup

```
npm install
```

## Build for production

```
npm run build
```

Builds take their version from `package.json`, except in
`build-extension.yml`, where a `v1.2.3` tag builds version 1.2.3.

## Build for development (in watch mode)

```
npm run watch
```

## Lint

```
npm run lint
```

This runs oxlint, ESLint and Biome with the root's configs and packages (run
`meteor npm install` at the top level first), then `tsc` and knip.

## Load extension to browser

Load manifest.json from the appropriate `dist` subdirectory (`chrome` or `firefox`)
