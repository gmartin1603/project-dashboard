# Release Checklist

- update versions in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`
- run `npm run build`
- run `cargo check` in `src-tauri/`
- run `npm run tauri build`
- test the `.deb` install on a clean-ish machine or user session
- verify tray behavior, launch-on-login, and configurable project root
- add or refresh screenshots in the README
- push the updated release commit to the `release` branch to trigger the GitHub release workflow
- update `CHANGELOG.md`
