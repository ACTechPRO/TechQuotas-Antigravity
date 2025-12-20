# TechQuotas Antigravity - Project Rules

## Project Overview
**TechQuotas Antigravity** is an advanced quota monitoring extension for the Antigravity IDE, developed by AC Tech. It provides real-time visual quota tracking with circular gauge indicators for each AI model.

## Quick Reference

| Item | Value |
|------|-------|
| **Name** | TechQuotas Antigravity |
| **Publisher** | ac-tech-pro |
| **Repository** | https://github.com/ac-tech-pro/TechQuotas-Antigravity |
| **Directory** | `D:\TechQuotas Antigravity` |
| **Language** | TypeScript |
| **Framework** | VS Code Extension API |

## Build Commands

```powershell
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (for development)
npm run watch

# Package as VSIX
npx vsce package

# Lint code
npm run lint
```

## Project Structure

```
D:\TechQuotas Antigravity\
├── src/
│   ├── extension.ts          # Main entry point
│   ├── core/
│   │   ├── config_manager.ts # Settings management
│   │   ├── process_finder.ts # Language server detection (D:\ fix)
│   │   ├── quota_manager.ts  # API communication
│   │   └── platform_strategies.ts
│   ├── ui/
│   │   └── status_bar.ts     # Visual gauge display
│   └── utils/
│       ├── logger.ts
│       └── types.ts
├── assets/
│   └── logo.png              # Extension icon
├── package.json              # Extension manifest
├── tsconfig.json            # TypeScript config
└── PROJECT_RULES.md         # This file
```

## Key Features

1. **D:\ Root Fix**: Uses `spawn` with `{shell: false}` to avoid quote escaping issues
2. **Circular Gauge Icons**: Visual indicators (○◔◑◕●) showing usage percentage
3. **Per-Model Tracking**: Individual status bar items for each AI model
4. **Color Coding**: Green (>50%), Yellow (20-50%), Red (<20%)
5. **Rich Tooltips**: Detailed quota info on hover

## Configuration Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `techquotas.enabled` | boolean | true | Enable monitoring |
| `techquotas.pollingInterval` | number | 120 | Refresh interval (seconds) |
| `techquotas.showGauges` | boolean | true | Show visual gauge icons |
| `techquotas.pinnedModels` | array | [] | Models to show in status bar |
| `techquotas.showPromptCredits` | boolean | false | Show prompt credits |

## Commands

| Command | Title |
|---------|-------|
| `techquotas.refresh` | TechQuotas: Refresh Now |
| `techquotas.reconnect` | TechQuotas: Reconnect |
| `techquotas.show_logs` | TechQuotas: Show Debug Log |

## Development Guidelines

1. **Commit Messages**: Use emoji prefixes in Portuguese (pt-BR)
   - `✨ Adiciona novo recurso`
   - `🐛 Corrige bug`
   - `📝 Atualiza documentação`

2. **Version Numbering**: Semantic Versioning (MAJOR.MINOR.PATCH)

3. **Testing**: Always test with workspace at `D:\` root to verify the spawn fix

## Credits

- **Original Base**: AG Quota by Henrik Mertens (henrikdev)
- **Fork & Enhancements**: AC Tech (Moacir Costa & Vinicyus Abdala)
- **License**: MIT
