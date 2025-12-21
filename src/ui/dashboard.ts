/**
 * TechQuotas Antigravity - Dashboard Webview Panel
 * Full-featured dashboard with circular progress charts and toggle controls
 */

import * as vscode from 'vscode';
import { quota_snapshot } from '../utils/types';

export class DashboardPanel {
	public static currentPanel: DashboardPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];
	private _lastSnapshot: quota_snapshot | undefined;

	public static createOrShow(extensionUri: vscode.Uri, snapshot?: quota_snapshot) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If panel exists, reveal it
		if (DashboardPanel.currentPanel) {
			DashboardPanel.currentPanel._panel.reveal(column);
			if (snapshot) {
				DashboardPanel.currentPanel.update(snapshot);
			}
			return;
		}

		// Create new panel
		const panel = vscode.window.createWebviewPanel(
			'techquotasDashboard',
			'TechQuotas Dashboard',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'assets')],
			}
		);

		DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, snapshot);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, snapshot?: quota_snapshot) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._lastSnapshot = snapshot;

		// Set initial HTML content
		this._updateWebview();

		// Handle messages from webview
		this._panel.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'toggleGroup':
						await this._toggleGroup(message.groupId);
						break;
					case 'moveGroup':
						await this._moveGroup(message.groupId, message.direction);
						break;
					case 'refresh':
						vscode.commands.executeCommand('techquotas.refresh');
						break;
					case 'openSettings':
						vscode.commands.executeCommand('workbench.action.openSettings', 'techquotas');
						break;
				}
			},
			null,
			this._disposables
		);

		// Handle panel disposal
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
	}

	public update(snapshot: quota_snapshot) {
		this._lastSnapshot = snapshot;
		this._panel.webview.postMessage({
			command: 'updateData',
			snapshot: this._serializeSnapshot(snapshot),
			pinnedGroups: this._getPinnedGroups(),
		});
	}

	private _serializeSnapshot(snapshot: quota_snapshot) {
		// Group models for display
		const groups = this._groupModels(snapshot.models);
		return {
			timestamp: snapshot.timestamp.toISOString(),
			groups: groups,
			promptCredits: snapshot.prompt_credits,
		};
	}

	private _groupModels(models: any[]) {
		const groups: Map<string, any[]> = new Map();

		for (const m of models) {
			const label = m.label.toLowerCase();
			let groupId: string;
			let groupName: string;

			if (label.includes('claude') || label.includes('opus')) {
				groupId = 'anthropic';
				groupName = 'Anthropic';
			} else if (label.includes('gemini') && label.includes('pro')) {
				groupId = 'gemini_pro';
				groupName = 'Gemini Pro';
			} else if (label.includes('gemini') && label.includes('flash')) {
				groupId = 'gemini_flash';
				groupName = 'Gemini Flash';
			} else {
				groupId = m.model_id;
				groupName = m.label;
			}

			if (!groups.has(groupId)) {
				groups.set(groupId, []);
			}
			groups.get(groupId)!.push({ ...m, groupId, groupName });
		}

		// Convert to array with aggregated data
		const result: any[] = [];
		for (const [groupId, groupModels] of groups) {
			const lowest = groupModels.reduce((min, m) =>
				(m.remaining_percentage ?? 100) < (min.remaining_percentage ?? 100) ? m : min
			);

			result.push({
				groupId,
				groupName: groupModels[0].groupName,
				remainingPercentage: lowest.remaining_percentage ?? 0,
				timeUntilReset: lowest.time_until_reset_formatted,
				resetTime: lowest.reset_time,
				isExhausted: groupModels.some((m: any) => m.is_exhausted),
				models: groupModels.map((m: any) => ({
					label: m.label,
					remainingPercentage: m.remaining_percentage ?? 0,
					timeUntilReset: m.time_until_reset_formatted,
				})),
			});
		}

		const customOrder = this._getGroupOrder();

		return result.sort((a, b) => {
			// Apply custom order if specified
			if (customOrder.length > 0) {
				const aIndex = customOrder.indexOf(a.groupId);
				const bIndex = customOrder.indexOf(b.groupId);
				if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
				if (aIndex >= 0) return -1;
				if (bIndex >= 0) return 1;
			}

			// Fallback: sort by remaining percentage
			return a.remainingPercentage - b.remainingPercentage;
		});
	}

	private _getPinnedGroups(): string[] {
		const config = vscode.workspace.getConfiguration('techquotas');
		return config.get<string[]>('pinnedModels') || [];
	}

	private async _toggleGroup(groupId: string) {
		const config = vscode.workspace.getConfiguration('techquotas');
		const pinned = [...(config.get<string[]>('pinnedModels') || [])];

		const index = pinned.indexOf(groupId);
		if (index >= 0) {
			pinned.splice(index, 1);
		} else {
			pinned.push(groupId);
		}

		await config.update('pinnedModels', pinned, vscode.ConfigurationTarget.Global);

		// Update webview with new pinned state
		this._panel.webview.postMessage({
			command: 'updatePinned',
			pinnedGroups: pinned,
		});
	}

	private _getGroupOrder(): string[] {
		const config = vscode.workspace.getConfiguration('techquotas');
		return config.get<string[]>('groupOrder') || [];
	}

	private async _moveGroup(groupId: string, direction: 'up' | 'down') {
		const config = vscode.workspace.getConfiguration('techquotas');

		// Get current order, or build default from current groups
		let order = [...this._getGroupOrder()];

		// If no custom order, build from current snapshot groups
		if (order.length === 0 && this._lastSnapshot) {
			const groups = this._groupModels(this._lastSnapshot.models);
			order = groups.map(g => g.groupId);
		}

		const index = order.indexOf(groupId);
		if (index < 0) {
			// Group not in order, add it
			order.push(groupId);
			return;
		}

		if (direction === 'up' && index > 0) {
			// Swap with previous
			[order[index - 1], order[index]] = [order[index], order[index - 1]];
		} else if (direction === 'down' && index < order.length - 1) {
			// Swap with next
			[order[index], order[index + 1]] = [order[index + 1], order[index]];
		}

		await config.update('groupOrder', order, vscode.ConfigurationTarget.Global);

		// Refresh data to show new order
		this._panel.webview.postMessage({
			command: 'updateOrder',
			groupOrder: order,
		});

		// Trigger a refresh to update the status bar
		vscode.commands.executeCommand('techquotas.refresh');
	}

	private _updateWebview() {
		this._panel.webview.html = this._getHtmlContent();

		// Send initial data if available
		if (this._lastSnapshot) {
			setTimeout(() => {
				this._panel.webview.postMessage({
					command: 'updateData',
					snapshot: this._serializeSnapshot(this._lastSnapshot!),
					pinnedGroups: this._getPinnedGroups(),
				});
			}, 100);
		}
	}

	private _getHtmlContent(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
	<title>TechQuotas Dashboard</title>
	<style>
		:root {
			--bg-primary: #1e1e1e;
			--bg-secondary: #252526;
			--bg-card: #2d2d30;
			--text-primary: #cccccc;
			--text-secondary: #858585;
			--accent-green: #4ec9b0;
			--accent-yellow: #dcdcaa;
			--accent-red: #f14c4c;
			--accent-blue: #569cd6;
			--border-color: #3c3c3c;
		}

		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: var(--bg-primary);
			color: var(--text-primary);
			padding: 20px;
			min-height: 100vh;
		}

		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 24px;
			padding-bottom: 16px;
			border-bottom: 1px solid var(--border-color);
		}

		.header h1 {
			font-size: 24px;
			font-weight: 600;
			display: flex;
			align-items: center;
			gap: 12px;
		}

		.header-actions {
			display: flex;
			gap: 8px;
		}

		.btn {
			padding: 8px 16px;
			border: 1px solid var(--border-color);
			background: var(--bg-secondary);
			color: var(--text-primary);
			border-radius: 4px;
			cursor: pointer;
			font-size: 13px;
			transition: all 0.2s;
		}

		.btn:hover {
			background: var(--bg-card);
			border-color: var(--accent-blue);
		}

		.btn-primary {
			background: var(--accent-blue);
			border-color: var(--accent-blue);
			color: white;
		}

		.cards-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
			gap: 16px;
		}

		.card {
			background: var(--bg-card);
			border-radius: 8px;
			padding: 20px;
			border: 1px solid var(--border-color);
			transition: all 0.2s;
		}

		.card:hover {
			border-color: var(--accent-blue);
		}

		.card-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 16px;
		}

		.card-title {
			font-size: 16px;
			font-weight: 600;
		}

		.toggle-switch {
			position: relative;
			width: 44px;
			height: 24px;
		}

		.toggle-switch input {
			opacity: 0;
			width: 0;
			height: 0;
		}

		.toggle-slider {
			position: absolute;
			cursor: pointer;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background-color: var(--bg-secondary);
			transition: 0.3s;
			border-radius: 24px;
			border: 1px solid var(--border-color);
		}

		.toggle-slider:before {
			position: absolute;
			content: "";
			height: 18px;
			width: 18px;
			left: 2px;
			bottom: 2px;
			background-color: var(--text-secondary);
			transition: 0.3s;
			border-radius: 50%;
		}

		.toggle-switch input:checked + .toggle-slider {
			background-color: var(--accent-blue);
			border-color: var(--accent-blue);
		}

		.toggle-switch input:checked + .toggle-slider:before {
			transform: translateX(20px);
			background-color: white;
		}

		.progress-ring-container {
			display: flex;
			justify-content: center;
			margin: 16px 0;
		}

		.progress-ring {
			position: relative;
			width: 140px;
			height: 140px;
		}

		.progress-ring svg {
			transform: rotate(-90deg);
		}

		.progress-ring-bg {
			fill: none;
			stroke: var(--bg-secondary);
			stroke-width: 8;
		}

		.progress-ring-fill {
			fill: none;
			stroke-width: 8;
			stroke-linecap: round;
			transition: stroke-dashoffset 0.5s ease;
		}

		.progress-ring-text {
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			text-align: center;
		}

		.progress-percentage {
			font-size: 32px;
			font-weight: 700;
		}

		.progress-label {
			font-size: 12px;
			color: var(--text-secondary);
		}

		.card-footer {
			display: flex;
			justify-content: space-between;
			margin-top: 16px;
			padding-top: 12px;
			border-top: 1px solid var(--border-color);
			font-size: 12px;
			color: var(--text-secondary);
		}

		.status-badge {
			padding: 2px 8px;
			border-radius: 4px;
			font-size: 11px;
			font-weight: 600;
		}

		.status-normal {
			background: rgba(78, 201, 176, 0.2);
			color: var(--accent-green);
		}

		.status-warning {
			background: rgba(220, 220, 170, 0.2);
			color: var(--accent-yellow);
		}

		.status-critical {
			background: rgba(241, 76, 76, 0.2);
			color: var(--accent-red);
		}

		.loading {
			text-align: center;
			padding: 60px;
			color: var(--text-secondary);
		}

		.model-list {
			font-size: 12px;
			color: var(--text-secondary);
			margin-top: 8px;
		}

		.model-list-item {
			display: flex;
			justify-content: space-between;
			padding: 4px 0;
		}

		.card-controls {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.order-btn {
			width: 24px;
			height: 24px;
			border: 1px solid var(--border-color);
			background: var(--bg-secondary);
			color: var(--text-secondary);
			border-radius: 4px;
			cursor: pointer;
			font-size: 10px;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: all 0.2s;
		}

		.order-btn:hover:not(:disabled) {
			background: var(--bg-card);
			border-color: var(--accent-blue);
			color: var(--accent-blue);
		}

		.order-btn:disabled {
			opacity: 0.3;
			cursor: not-allowed;
		}
	</style>
</head>
<body>
	<div class="header">
		<h1>
			<span>🚀</span>
			TechQuotas Dashboard
		</h1>
		<div class="header-actions">
			<button class="btn" onclick="refresh()">⟳ Refresh</button>
			<button class="btn" onclick="openSettings()">⚙ Settings</button>
		</div>
	</div>

	<div id="content">
		<div class="loading">Loading quota data...</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		let currentData = null;
		let pinnedGroups = [];

		function getColor(percentage) {
			if (percentage <= 20) return '#f14c4c';
			if (percentage <= 50) return '#dcdcaa';
			return '#4ec9b0';
		}

		function getStatusClass(percentage) {
			if (percentage <= 20) return 'status-critical';
			if (percentage <= 50) return 'status-warning';
			return 'status-normal';
		}

		function getStatusText(percentage) {
			if (percentage <= 20) return 'Critical';
			if (percentage <= 50) return 'Warning';
			return 'Normal';
		}

		function renderCards(groups) {
			const content = document.getElementById('content');
			
			if (!groups || groups.length === 0) {
				content.innerHTML = '<div class="loading">No quota data available</div>';
				return;
			}

			const cardsHtml = groups.map((group, index) => {
				const pct = group.remainingPercentage;
				const color = getColor(pct);
				const circumference = 2 * Math.PI * 58;
				const offset = circumference - (pct / 100) * circumference;
				const isPinned = pinnedGroups.includes(group.groupId);
				const modelCount = group.models.length;
				const isFirst = index === 0;
				const isLast = index === groups.length - 1;

				return \`
					<div class="card" data-group-id="\${group.groupId}">
						<div class="card-header">
							<span class="card-title">\${group.groupName}\${modelCount > 1 ? ' (' + modelCount + ')' : ''}</span>
							<div class="card-controls">
								<button class="order-btn" \${isFirst ? 'disabled' : ''} onclick="moveGroup('\${group.groupId}', 'up')" title="Move up">▲</button>
								<button class="order-btn" \${isLast ? 'disabled' : ''} onclick="moveGroup('\${group.groupId}', 'down')" title="Move down">▼</button>
								<label class="toggle-switch">
									<input type="checkbox" \${isPinned ? 'checked' : ''} onchange="toggleGroup('\${group.groupId}')">
									<span class="toggle-slider"></span>
								</label>
							</div>
						</div>
						
						<div class="progress-ring-container">
							<div class="progress-ring">
								<svg width="140" height="140">
									<circle class="progress-ring-bg" cx="70" cy="70" r="58"></circle>
									<circle class="progress-ring-fill" cx="70" cy="70" r="58"
										stroke="\${color}"
										stroke-dasharray="\${circumference}"
										stroke-dashoffset="\${offset}">
									</circle>
								</svg>
								<div class="progress-ring-text">
									<div class="progress-percentage" style="color: \${color}">\${pct.toFixed(1)}%</div>
									<div class="progress-label">remaining</div>
								</div>
							</div>
						</div>

						\${modelCount > 1 ? \`
							<div class="model-list">
								\${group.models.map(m => \`
									<div class="model-list-item">
										<span>\${m.label}</span>
										<span>\${m.remainingPercentage.toFixed(0)}%</span>
									</div>
								\`).join('')}
							</div>
						\` : ''}

						<div class="card-footer">
							<span>Resets: \${group.timeUntilReset}</span>
							<span class="status-badge \${getStatusClass(pct)}">\${getStatusText(pct)}</span>
						</div>
					</div>
				\`;
			}).join('');

			content.innerHTML = '<div class="cards-grid">' + cardsHtml + '</div>';
		}

		function toggleGroup(groupId) {
			vscode.postMessage({ command: 'toggleGroup', groupId: groupId });
		}

		function refresh() {
			vscode.postMessage({ command: 'refresh' });
		}

		function openSettings() {
			vscode.postMessage({ command: 'openSettings' });
		}

		function moveGroup(groupId, direction) {
			vscode.postMessage({ command: 'moveGroup', groupId: groupId, direction: direction });
		}

		window.addEventListener('message', event => {
			const message = event.data;
			
			switch (message.command) {
				case 'updateData':
					currentData = message.snapshot;
					pinnedGroups = message.pinnedGroups || [];
					renderCards(currentData.groups);
					break;
				case 'updatePinned':
					pinnedGroups = message.pinnedGroups || [];
					if (currentData) {
						renderCards(currentData.groups);
					}
					break;
			}
		});
	</script>
</body>
</html>`;
	}

	public dispose() {
		DashboardPanel.currentPanel = undefined;
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}
}
