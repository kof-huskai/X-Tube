# Contributing

1. Fork and clone the repo.
2. Open `chrome://extensions`, enable Developer mode, **Load unpacked** and select the repo root.
3. Edit, then press Reload on the extension card.
4. Open a pull request describing the change.

No build step: plain JavaScript (Manifest V3). Never commit API keys.

## Releasing (maintainers)
1. Bump `version` in `manifest.json` and add an entry to `CHANGELOG.md`.
2. `git commit -am "Release x.y.z" && git tag vx.y.z && git push && git push origin vx.y.z`
3. The GitHub Action builds the zip and publishes the release.
