# CCUsage - Claude Code Usage Monitor

A VS Code / Cursor extension that displays your Claude Code token usage and costs directly in the status bar.

Built on top of [ccusage](https://github.com/ryoppippi/ccusage) by [@ryoppippi](https://github.com/ryoppippi).

## Status Bar

The extension adds a single compact item to your status bar:

```
✦ D: 5.2M $3.40 | W: 45.2M $28.50 | M: 180.5M $112.30
```

- **D** — Today's usage
- **W** — Current week (Monday to Sunday)
- **M** — Current month

Hover over it for a detailed tooltip with quick action links.

## Commands

Open the command palette (`Ctrl+Shift+P`) and search for:

| Command | Description |
|---|---|
| `CCUsage: Show Daily Usage` | Detailed daily breakdown in a webview panel |
| `CCUsage: Show Monthly Usage` | Monthly breakdown |
| `CCUsage: Show 5-Hour Blocks Usage` | 5-hour billing window breakdown |
| `CCUsage: Refresh Usage Stats` | Force refresh the status bar |

## Configuration

| Setting | Default | Description |
|---|---|---|
| `ccusage.refreshInterval` | `300` | Auto-refresh interval in seconds |
| `ccusage.showCost` | `true` | Show cost (USD) in the status bar |
| `ccusage.showTokens` | `true` | Show token count in the status bar |

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- `npx` available in your PATH (comes with Node.js)
- Claude Code usage data in `~/.claude/projects/`

The extension runs `npx ccusage@latest` under the hood — no global install needed.

## Installation

### From VSIX

```bash
# Build the VSIX
npm install
npm run compile
npx vsce package --allow-missing-repository

# Install in Cursor / VS Code
cursor --install-extension ccusage-cursor-extension-0.0.1.vsix
# or
code --install-extension ccusage-cursor-extension-0.0.1.vsix
```

### From source

```bash
git clone https://github.com/Evaneos/ccusage-cursor-extension.git
cd ccusage-cursor-extension
npm install
npm run compile
```

Then press `F5` in VS Code/Cursor to launch the Extension Development Host.

## Credits

This extension is powered by [ccusage](https://github.com/ryoppippi/ccusage), a CLI tool for analyzing Claude Code token usage and costs from local JSONL files. All the heavy lifting (parsing, cost calculation, model detection) is done by ccusage.

## License

[MIT](LICENSE)

## Supply chain protection

This repo pins npm installs to packages published before a fixed date via the `before` directive in `.npmrc`, as a mitigation against npm supply chain attacks (ref INC-227).

**If you need to upgrade dependencies**, update the `before` date in `.npmrc` to a value at most today minus 7 days. This 7-day delay leaves time for the community and automated scanners to detect and unpublish compromised packages before they reach our install.
