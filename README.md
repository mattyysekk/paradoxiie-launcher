# Paradoxiie Launcher

One place to install, play and update Matt's games: **Hullbreak 3D** and **Enemy Skies**.

**Get it:** download **paradoxiie-launcher-…-setup.exe** from the [latest release](https://github.com/mattyysekk/paradoxiie-launcher/releases/latest)
and run it. It installs without admin rights, puts a shortcut on the desktop and keeps itself up to date.

- **Install / Play / Update** for each game, with the newest version's notes.
- **Update by itself**: on for each game unless you switch it off. A game that's running updates when you close it.
- Hullbreak installs exactly where its own installer puts it, so a copy you already have is found and kept.
  Enemy Skies goes in `%LOCALAPPDATA%\Paradoxiie Launcher\Games`.

## How it works

- `games.json` (this repo, `main`) is the library. The launcher reads it on every start, so adding a game here
  shows it to everyone without a launcher update. Each game points at a public releases repository:
  - `kind: "nsis"`: the release has a setup .exe (Hullbreak, from `mattyysekk/hullbreak-releases`). The launcher runs it
    silently and finds the installed game through Windows' installed-apps list.
  - `kind: "zip"`: the release has a `…windows.zip` (Enemy Skies, from `mattyysekk/enemy-skies-releases`). The launcher
    unzips it into its Games folder.
- **Small updates:** a release can also carry a `.pack` and a `.chunks.json` (made by `.github/paradoxiie/pack.mjs` in
  the game's releases repository): the built game cut into pieces where its content says. To update, the launcher cuts
  the copy on this PC the same way, keeps every piece it has and downloads only the missing ones (ranges of the pack),
  so an update costs about what changed (a megabyte or two) instead of the whole game. Every piece is checked against
  its hash; if anything doesn't add up, or most of the game changed, it falls back to the full download. Hullbreak is
  patched in place (only the changed files, its uninstaller stays); Enemy Skies is rebuilt beside the old copy and
  swapped in. The cutting in `src/main/delta.ts` and in `pack.mjs` must stay the same.
- The newest release of each game comes from GitHub's API (no sign-in), checked on start, every 30 minutes and when the
  window comes back after a while.
- Releasing the launcher: raise `version` in `package.json` and push. The workflow builds the installer and publishes
  the release; everyone's launcher updates itself.

## Developing

```
npm install
npm run dev      # run it
npm run build    # typecheck + build
```

Testing switches (environment variables): `PARADOXIIE_API` (a stand-in for api.github.com), `PARADOXIIE_CATALOG`
(a games.json path or URL), `PARADOXIIE_GAMES` (the Games folder), `PARADOXIIE_ANY_OS=1` (allow installs off Windows),
`PARADOXIIE_NO_SELF_UPDATE=1`.
