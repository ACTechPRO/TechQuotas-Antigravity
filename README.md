<div align="center">

<img src="assets/TechQuotas Antigravity.png" alt="TechQuotas Hero" width="100%" />

# TechQuotas Antigravity
### Precision Analytics & Quota Management for the Antigravity IDE.

![VS Code](https://img.shields.io/badge/VS%20Code-1.96%2B-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Version](https://img.shields.io/badge/v1.1.14-blue?style=for-the-badge)
![Downloads](https://img.shields.io/badge/Downloads-10K+-green?style=for-the-badge)

</div>

---

## 📊 The Missing Piece of Antigravity

**TechQuotas Antigravity** is the premier flight instrument for your AI-powered development workflow. It bridges the gap between the Antigravity IDE's powerful AI agents and your usage limits, providing **real-time telemetry** on token consumption and quota resets.

> "A pilot never flies without gauges. A developer shouldn't code without quotas."

---

## 📸 Feature Deep Dive

### 1. The Interactive Dashboard
Stop guessing. Open the dashboard to see exactly where you stand with every model provider (Anthropic, Google, OpenAI).

<img src="assets/modal.png" alt="Dashboard View" width="800" />

*   **Visual Gauges**: Color-coded circular indicators showing remaining capacity.
*   **Drag-and-Drop Power**: Want to prioritize Gemini? Drag it to the top. The status bar layout syncs instantly.
*   **Toggle Visibility**: Hide models you don't use (e.g., OpenAI) to declutter your workspace.

### 2. The Premium Status Bar
Designed to be informative yet unobtrusive. It sits quietly in your IDE footer.

<img src="assets/taskbar.png" alt="Status Bar Preview" width="600" />

*   **Smart Coloring**:
    *   🟢 **Green**: > 50% Quota remaining.
    *   🟡 **Yellow**: 20% - 50% Warning zone.
    *   🔴 **Red**: < 20% Critical levels.
*   **Rich Tooltips**: Hover over any item to see the exact numeric % and the time until the next reset (e.g., "Resets in 4h 12m").

---

## ⚙️ Advanced Configuration

You can fine-tune the behavior in your `settings.json`.

| Setting ID | Default | Description |
| :--- | :--- | :--- |
| `techquotas.enabled` | `true` | Master switch to turn the extension on/off. |
| `techquotas.pollingInterval` | `120` | How often (in seconds) to check for quota updates. Lower values = fresher data but more CPU. |
| `techquotas.showGauges` | `true` | Renders the colorful circle icon (`●`) in the status bar. Set to false for text-only mode. |
| `techquotas.pinnedModels` | `[]` | **(Advanced)** Manual override for which model IDs are visible. We recommend using the **Dashboard UI** to manage this instead. |

---

## 🔧 Under The Hood & Troubleshooting

### How it works
TechQuotas connects directly to the local **Antigravity Node.js process**. It securely queries the internal state management system to retrieve the same quota data the IDE uses internally, but exposes it in a human-readable format.

### Common Issues

**🔴 Issue: "Antigravity Process Not Found"**
*   **Reason**: The extension cannot locate the main PID of the IDE.
*   **Solution**:
    1.  Ensure you have an active Antigravity workspace open.
    2.  Run Command: `TechQuotas: Reconnect`.
    3.  If you are running the IDE as Admin, VS Code must also be Admin.

**🟡 Issue: "Gauges are Grey/Unknown"**
*   **Reason**: The API has not yet returned data for that model.
*   **Solution**: Trigger a comprehensive prompt (e.g., ask the AI something) to force a quota refresh, then click the refresh icon in the TechQuotas dashboard.

---

## 📥 Installation Guide

### Option A: VS Code Marketplace (Recommended)
1.  Open **Extensions** sidebar (`Ctrl+Shift+X`).
2.  Search for `TechQuotas Antigravity`.
3.  Click **Install**.

### Option B: Manual VSIX
Download the latest [Release](https://github.com/ACTechPRO/TechQuotas-Antigravity/releases).
```bash
code --install-extension techquotas-antigravity-1.1.14.vsix
```

---

<div align="center">

**Engineered by AC Tech Solutions**

[🌐 Website](https://ac-tech.pro) • [🐙 GitHub](https://github.com/ACTechPRO)

</div>
