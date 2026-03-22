# Contributing

Thanks for considering a contribution.

## Local Setup

```bash
npm install
./install-linux-deps.sh
npm run tauri dev
```

## Before Opening a PR

- run `npm run build`
- run `cargo check` from `src-tauri/`
- keep changes focused and easy to review
- avoid committing generated artifacts like `dist/`, `node_modules/`, or `src-tauri/target/`

## Scope Notes

The current app still assumes a fixed local code root. If you want to work on open-source usability, configurable roots and onboarding are good next areas.
