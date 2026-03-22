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
- expect GitHub Actions to run the same build and Rust checks on pull requests
- keep changes focused and easy to review
- avoid committing generated artifacts like `dist/`, `node_modules/`, or `src-tauri/target/`

## Scope Notes

Good areas for contribution include onboarding polish, packaging and release automation, broader desktop platform support, and UI refinements such as new project metadata or accessibility improvements.
