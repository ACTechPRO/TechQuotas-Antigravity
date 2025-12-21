# TechQuotas Antigravity

<p align="center">
  <img src="assets/logo.png" width="128" alt="TechQuotas Logo">
</p>

<p align="center">
  <strong>The Ultimate Quota Monitor for Antigravity IDE</strong><br>
  Interactive Dashboard • Instant Reordering • Premium Status Bar
</p>

---

**TechQuotas Antigravity** is a premium extension designed to give you total control and visibility over your AI model quotas in the Antigravity IDE. Featuring a sleek dashboard, customizable status bar, and real-time visual feedback, it ensures you never run out of credits unexpectedly.

## ✨ Key Features

### 🚀 Interactive Dashboard
Manage your quotas from a beautiful, dedicated control panel:
- **Visual Gauges:** Circular progress charts for every model group.
- **Instant Reorder:** Use **▲ / ▼** arrows to rearrange models. Changes apply **instantly** to the Status Bar.
- **Pinning Controls:** Toggle switches to show/hide specific models in the status bar.
- **Access:** Click the Rocket icon `$(rocket)` in the status bar or run `TechQuotas: Open Dashboard`.

### 💎 Premium Status Bar
A redesigned status bar experience focused on clarity and aesthetics:
- **Unified Visuals:** All models use a consistent circle icon (`●`) for a clean, pro look.
- **Smart Coloring:** Icons change color based on remaining quota:
  - 🟢 **Green** (>50%)
  - 🟡 **Yellow** (20-50%)
  - 🔴 **Red** (<20%)
- **Split-Item Design:** 
  - **Static Icon:** The colored ball acts as a pure status indicator.
  - **Clickable Text:** The model label (e.g., "Anthropic 75%") works as a button to open the menu.
- **Smart Toggle:**
  - If **no models** are pinned, a Rocket icon appears.
  - If **models are shown**, the Rocket hides to save space.

### 📝 Rich Tooltips
Hover over any model to see detailed statistics:
- **Markdown Rendering:** Icons (`●`) are correctly rendered inside the tooltip.
- **Group Details:** See exactly which sub-models (e.g., High/Low) belong to a group.
- **Reset Times:** Precise countdown to your next quota reset.

### ⚡ Automatic Process Detection
- Automatically finds the Antigravity process and connects securely.
- Works flawlessly even in `D:\` root workspaces (Custom Fix).

---

## 🛠️ Installation

### From VSIX (Recommended)
1. Download `TechQuotas Antigravity.vsix`.
2. Open Antigravity IDE.
3. Press `Ctrl+Shift+P` → "Extensions: Install from VSIX...".
4. Select the file.

### From Source
```bash
git clone https://github.com/moacirbcj/TechQuotas-Antigravity.git
cd TechQuotas-Antigravity
npm install
npm run compile
npx vsce package
```

---

## ⚙️ Configuration

Customize behavior in Settings (`Ctrl+,` > "TechQuotas"):

| Setting | Description |
|---------|-------------|
| **techquotas.enabled** | Enable/disable monitoring. |
| **techquotas.pollingInterval** | Refresh rate in seconds (Default: 120s). |
| **techquotas.showGauges** | Show the visual icons in status bar. |
| **techquotas.pinnedModels** | List of model IDs to show in status bar. |
| **techquotas.groupOrder** | Custom order of model groups (Managed via Dashboard). |

---

## 🎮 Commands

Access via Command Palette (`Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `TechQuotas: Open Dashboard` | Open the main visual dashboard. |
| `TechQuotas: Refresh Now` | Force a manual update of quota data. |
| `TechQuotas: Reconnect` | Re-scan for the Antigravity process. |
| `TechQuotas: Show Debug Log` | View detailed connection logs. |

---

## 👥 Credits

- **Developed by**: [AC Tech](https://github.com/ac-tech-pro)
  - Moacir Costa ([@moacirbcj](https://github.com/moacirbcj))
  - Vinicyus Abdala ([@vinzabdala](https://github.com/vinzabdala))
- **Based on**: [AG Quota](https://github.com/Henrik-3/AntigravityQuota) by Henrik Mertens

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

<p align="center">
  Made with ❤️ by <a href="https://ac-tech.pro">AC Tech</a>
</p>
