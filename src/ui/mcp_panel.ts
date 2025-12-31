/**
 * TechQuotas Antigravity - MCP Panel
 * Webview-based UI for managing MCP servers and marketplace
 */

import * as vscode from 'vscode';
import { MCPManager } from '../core/mcp_manager';
import { MCPRegistry } from '../core/mcp_registry';
import { logger } from '../utils/logger';
import { MCPServersCollection, RegistryData } from '../utils/mcp_types';

export class MCPPanel {
	public static currentPanel: MCPPanel | undefined;
	public static readonly viewType = 'techquotasMCP';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	private _mcpManager: MCPManager;
	private _mcpRegistry: MCPRegistry;

	private _currentServers: MCPServersCollection = {};
	private _registryData: RegistryData | null = null;
	private _isInstallerBusy: boolean = false;

	public static createOrShow(
		extensionUri: vscode.Uri,
		mcpManager: MCPManager,
		mcpRegistry: MCPRegistry
	) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it.
		if (MCPPanel.currentPanel) {
			MCPPanel.currentPanel._panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			MCPPanel.viewType,
			'MCP',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'assets')],
			}
		);

		MCPPanel.currentPanel = new MCPPanel(panel, extensionUri, mcpManager, mcpRegistry);
	}

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		mcpManager: MCPManager,
		mcpRegistry: MCPRegistry
	) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._mcpManager = mcpManager;
		this._mcpRegistry = mcpRegistry;

		// Set the webview's initial html content
		this._panel.webview.html = this._getHtmlForWebview();

		// Listen for config changes
		this._mcpManager.on_config_change(async (event) => {
			this._currentServers = event.servers;
			await this._updateWebviewState();
		});

		// Listen for when the panel is disposed
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case 'refresh':
						await this._refreshData();
						break;
					case 'toggleServer':
						await this._mcpManager.toggle_server(message.id, message.enabled);
						vscode.window.showInformationMessage(`MCP Server ${message.id} ${message.enabled ? 'enabled' : 'disabled'}`);
						break;
					case 'installServer':
						await this._installServer(message.repoUrl, message.name);
						break;
					case 'openLink':
						vscode.env.openExternal(vscode.Uri.parse(message.url));
						break;
					case 'editConfig':
						const doc = await vscode.workspace.openTextDocument(this._mcpManager.get_config_path());
						await vscode.window.showTextDocument(doc);
						break;
				}
			},
			null,
			this._disposables
		);

		// Initial load
		this._refreshData();
	}

	private async _refreshData() {
		// Load configured servers
		this._currentServers = await this._mcpManager.get_servers();

		// Load Registry data
		this._panel.webview.postMessage({ command: 'setLoading', value: true });
		this._registryData = await this._mcpRegistry.get_registry_data();
		this._panel.webview.postMessage({ command: 'setLoading', value: false });

		await this._updateWebviewState();
	}

	private async _updateWebviewState() {
		await this._panel.webview.postMessage({
			command: 'updateData',
			servers: this._currentServers,
			registry: this._registryData
		});
	}

	private async _installServer(repoUrl: string, name: string) {
		if (this._isInstallerBusy) return;
		this._isInstallerBusy = true;
		this._panel.webview.postMessage({ command: 'setBusy', busy: true });

		try {
			// Extract simple name from repo URL for basic ID
			// e.g. https://github.com/user/repo -> repo
			const repoName = repoUrl.split('/').pop()?.replace('.git', '') || name.toLowerCase().replace(/\s+/g, '-');
			const id = repoName.replace(/[^a-zA-Z0-9-_]/g, '');

			logger.info('MCPPanel', `Installing ${name} (ID: ${id}) from ${repoUrl}`);

			const config = {
				command: 'npx',
				args: ['-y', repoUrl], // Heuristic: Try running repo directly with npx
				env: {}
			};

			const success = await this._mcpManager.install_server(id, config);

			if (success) {
				vscode.window.showInformationMessage(`Installed ${name}. Please edit config to add required ENV variables.`);
				// Open config for user to edit env vars
				const doc = await vscode.workspace.openTextDocument(this._mcpManager.get_config_path());
				await vscode.window.showTextDocument(doc);
			} else {
				vscode.window.showErrorMessage(`Failed to install ${name}`);
			}

		} catch (e: any) {
			vscode.window.showErrorMessage(`Error installing server: ${e.message}`);
		} finally {
			this._isInstallerBusy = false;
			this._panel.webview.postMessage({ command: 'setBusy', busy: false });
		}
	}

	public dispose() {
		MCPPanel.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _getHtmlForWebview() {
		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>MCP Integration</title>
			<style>
				:root {
					--bg-color: #0d1117;
					--card-bg: #161b22;
					--card-border: #30363d;
					--accent-color: #58a6ff;
					--text-primary: #c9d1d9;
					--text-secondary: #8b949e;
					--success-color: #238636;
					--glass-bg: rgba(22, 27, 34, 0.7);
					--glass-border: rgba(48, 54, 61, 0.5);
				}

				body {
					padding: 0;
					margin: 0;
					font-family: 'Segoe UI', 'Roboto', sans-serif;
					color: var(--text-primary);
					background-color: var(--bg-color);
					background-image: 
						radial-gradient(circle at 10% 20%, rgba(88, 166, 255, 0.05) 0%, transparent 20%),
						radial-gradient(circle at 90% 80%, rgba(35, 134, 54, 0.05) 0%, transparent 20%);
				}

				/* VS Code Scrollbar Styling */
				::-webkit-scrollbar {
					width: 10px;
					height: 10px;
				}
				::-webkit-scrollbar-thumb {
					background: #30363d;
					border-radius: 5px;
				}
				::-webkit-scrollbar-track {
					background: transparent;
				}

				.tabs {
					display: flex;
					background: rgba(13, 17, 23, 0.95);
					padding: 0 20px;
					backdrop-filter: blur(10px);
					position: sticky;
					top: 0;
					z-index: 100;
					border-bottom: 1px solid var(--card-border);
					gap: 20px;
				}

				.tab {
					padding: 16px 4px;
					cursor: pointer;
					border-bottom: 3px solid transparent;
					opacity: 0.6;
					transition: all 0.3s ease;
					font-weight: 600;
					font-size: 14px;
					letter-spacing: 0.5px;
					color: var(--text-secondary);
				}

				.tab:hover {
					opacity: 0.9;
					color: var(--text-primary);
				}

				.tab.active {
					border-bottom-color: var(--accent-color);
					opacity: 1;
					color: var(--accent-color);
				}

				.content {
					padding: 30px;
					max-width: 1200px;
					margin: 0 auto;
					min-height: calc(100vh - 60px);
					animation: fadeIn 0.4s ease-out;
				}

				@keyframes fadeIn {
					from { opacity: 0; transform: translateY(10px); }
					to { opacity: 1; transform: translateY(0); }
				}

				.hidden {
					display: none !important;
				}

				.header-bar {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 30px;
				}

				h2 {
					font-size: 1.5rem;
					font-weight: 300;
					margin: 0;
					color: var(--text-primary);
					letter-spacing: -0.5px;
				}

				/* Card Grid */
				.grid {
					display: grid;
					grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
					gap: 20px;
				}

				.card {
					background: var(--glass-bg);
					border: 1px solid var(--glass-border);
					border-radius: 12px;
					padding: 20px;
					position: relative;
					transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
					backdrop-filter: blur(12px);
					box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
					display: flex;
					flex-direction: column;
				}

				.card:hover {
					transform: translateY(-4px);
					box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
					border-color: var(--accent-color);
				}

				.card-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 12px;
				}

				.card-title {
					font-size: 1.1em;
					font-weight: 600;
					color: var(--text-primary);
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}

				/* Toggle Switch */
				.toggle-container {
					position: relative;
					width: 44px;
					height: 24px;
					cursor: pointer;
				}

				.toggle-chk {
					opacity: 0;
					width: 0;
					height: 0;
				}

				.toggle-track {
					position: absolute;
					top: 0;
					left: 0;
					right: 0;
					bottom: 0;
					background-color: #30363d;
					transition: .4s;
					border-radius: 34px;
				}

				.toggle-track:before {
					position: absolute;
					content: "";
					height: 18px;
					width: 18px;
					left: 3px;
					bottom: 3px;
					background-color: white;
					transition: .4s;
					border-radius: 50%;
				}

				.toggle-chk:checked + .toggle-track {
					background-color: var(--success-color);
				}

				.toggle-chk:checked + .toggle-track:before {
					transform: translateX(20px);
				}

				/* Tags */
				.card-meta {
					display: flex;
					flex-wrap: wrap;
					gap: 8px;
					margin-bottom: 16px;
				}

				.tag {
					background: rgba(88, 166, 255, 0.15);
					color: #79c0ff;
					padding: 4px 10px;
					border-radius: 20px;
					font-size: 0.75em;
					font-weight: 600;
					border: 1px solid rgba(88, 166, 255, 0.2);
				}

				.tag.local { background: rgba(52, 211, 153, 0.15); color: #6ee7b7; border-color: rgba(52, 211, 153, 0.2); }
				.tag.cloud { background: rgba(167, 139, 250, 0.15); color: #c4b5fd; border-color: rgba(167, 139, 250, 0.2); }

				.card-desc {
					font-size: 0.9em;
					line-height: 1.5;
					color: var(--text-secondary);
					margin-bottom: 20px;
					flex-grow: 1;
					display: -webkit-box;
					-webkit-line-clamp: 3;
					-webkit-box-orient: vertical;
					overflow: hidden;
				}

				/* Buttons */
				.actions {
					display: flex;
					gap: 10px;
					margin-top: auto;
				}

				.btn {
					background: var(--accent-color);
					color: white;
					border: none;
					padding: 8px 16px;
					border-radius: 6px;
					cursor: pointer;
					font-weight: 600;
					font-size: 0.9em;
					transition: all 0.2s;
					flex: 1;
					text-align: center;
					text-decoration: none;
				}

				.btn:hover {
					filter: brightness(1.1);
					transform: translateY(-1px);
				}

				.btn.secondary {
					background: transparent;
					border: 1px solid var(--card-border);
					color: var(--text-primary);
				}

				.btn.secondary:hover {
					background: rgba(255, 255, 255, 0.05);
					border-color: var(--text-secondary);
				}

				/* Search */
				.search-container {
					position: relative;
					margin-bottom: 30px;
				}

				.search-box {
					width: 100%;
					padding: 14px 20px;
					background: var(--card-bg);
					border: 1px solid var(--card-border);
					border-radius: 8px;
					font-size: 1rem;
					color: var(--text-primary);
					transition: all 0.3s;
					box-sizing: border-box;
				}

				.search-box:focus {
					outline: none;
					border-color: var(--accent-color);
					box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
				}

				/* Section Dividers */
				.section-title {
					font-size: 1.1rem;
					color: var(--text-secondary);
					margin: 40px 0 20px;
					padding-bottom: 10px;
					border-bottom: 1px solid var(--card-border);
					text-transform: uppercase;
					letter-spacing: 1px;
					font-weight: 600;
				}
				
				/* Loading Overlay */
				.loading-overlay {
					position: fixed;
					top: 0; left: 0; right: 0; bottom: 0;
					background: rgba(13, 17, 23, 0.85);
					backdrop-filter: blur(5px);
					display: flex;
					flex-direction: column;
					justify-content: center;
					align-items: center;
					z-index: 1000;
					opacity: 1;
					transition: opacity 0.3s ease;
				}

				.loading-overlay.hidden {
					opacity: 0;
					pointer-events: none;
					visibility: hidden;
				}

				.spinner {
					width: 50px;
					height: 50px;
					border: 3px solid rgba(88, 166, 255, 0.3);
					border-radius: 50%;
					border-top-color: var(--accent-color);
					animation: spin 1s linear infinite;
					margin-bottom: 20px;
				}

				@keyframes spin {
					to { transform: rotate(360deg); }
				}

				.loading-text {
					font-size: 1.2em;
					color: var(--text-primary);
					font-weight: 300;
					letter-spacing: 1px;
				}
			</style>
		</head>
		<body>
			<div class="tabs">
				<div class="tab active" onclick="switchTab('installed')">Installed Apps</div>
				<div class="tab" onclick="switchTab('marketplace')">Marketplace Registry</div>
			</div>

			<!-- INSTALLED TAB -->
			<div id="installed" class="content">
				<div class="header-bar">
					<h2>Your Active Servers</h2>
					<div class="actions" style="width: auto; gap: 10px;">
						<button class="btn secondary" onclick="sendMessage('refresh')">Refetch</button>
						<button class="btn secondary" onclick="sendMessage('editConfig')">Edit Config</button>
					</div>
				</div>
				<div id="servers-list" class="grid">
					<!-- Servers injected here -->
				</div>
			</div>

			<!-- MARKETPLACE TAB -->
			<div id="marketplace" class="content hidden">
				<div class="header-bar">
					<h2>Discover New Tools</h2>
					<button class="btn secondary" onclick="sendMessage('refresh')" style="flex: 0 0 auto; width: auto;">Refresh Registry</button>
				</div>
				<div class="search-container">
					<input type="text" class="search-box" id="search" placeholder="Search servers by name, description, or tag..." oninput="filterMarketplace()">
				</div>
				<div id="registry-list">
					<!-- Marketplace items injected here -->
				</div>
			</div>

			<div id="loading" class="loading-overlay hidden">
				<div class="spinner"></div>
				<div class="loading-text">PROCESSING</div>
			</div>

			<script>
				const vscode = acquireVsCodeApi();
				let registryData = [];
				let serversData = {};

				function switchTab(tabId) {
					document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
					document.querySelectorAll('.content').forEach(c => c.classList.add('hidden'));
					
					// Find tab by text content approach was brittle, use direct index or clearer selection
					// Actually the onclick in HTML passes the ID, so let's match by that.
					// We need to find the tab element that triggers this.
					const buttons = document.querySelectorAll('.tab');
					if (tabId === 'installed') buttons[0].classList.add('active');
					else buttons[1].classList.add('active');

					document.getElementById(tabId).classList.remove('hidden');
				}

				function sendMessage(command, payload = {}) {
					vscode.postMessage({ command, ...payload });
				}

				function renderServers(servers) {
					serversData = servers;
					const container = document.getElementById('servers-list');
					if (!servers || Object.keys(servers).length === 0) {
						container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; grid-column: 1/-1; padding: 40px;">No servers configured. Visit the Marketplace to install one.</p>';
						return;
					}

					container.innerHTML = Object.entries(servers).map(([id, config]) => {
						const isEnabled = !config.disabled;
						return \`
						<div class="card" style="\${!isEnabled ? 'opacity: 0.7;' : ''}">
							<div class="card-header">
								<span class="card-title">\${id}</span>
								<label class="toggle-container">
									<input type="checkbox" class="toggle-chk" 
										\${isEnabled ? 'checked' : ''} 
										onchange="toggleServer('\${id}', this.checked)">
									<div class="toggle-track"></div>
								</label>
							</div>
							<div class="card-meta">
								<span class="tag">\${config.command}</span>
								\${config.env && Object.keys(config.env).length > 0 ? '<span class="tag cloud">Env Vars</span>' : ''}
							</div>
							<div class="card-desc">
								Running via \${config.command} with arguments: \${config.args.join(' ')}
							</div>
							<div class="actions">
								<button class="btn secondary" onclick="sendMessage('editConfig')">Configure</button>
							</div>
						</div>
					\`}).join('');
				}

				function renderRegistry(data) {
					registryData = data || [];
					filterMarketplace();
				}

				function filterMarketplace() {
					const query = document.getElementById('search').value.toLowerCase();
					const container = document.getElementById('registry-list');
					
					if (!registryData || registryData.length === 0) {
						container.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-secondary);">Loading registry data...</p>';
						return;
					}

					let html = '';
					let hasResults = false;

					registryData.forEach(category => {
						const items = category.items.filter(item => 
							item.name.toLowerCase().includes(query) || 
							item.description.toLowerCase().includes(query) ||
							(item.tags && item.tags.some(t => t.toLowerCase().includes(query)))
						);

						if (items.length > 0) {
							hasResults = true;
							html += \`<div class="section-title">\${category.name}</div><div class="grid">\`;
							html += items.map(item => \`
								<div class="card">
									<div class="card-header">
										<span class="card-title" title="\${item.name}">\${item.name.split('/').pop()}</span>
										<small style="color: var(--text-secondary); font-size: 0.8em">\${item.name.split('/')[0]}</small>
									</div>
									<div class="card-meta">
										\${(item.tags || []).map(t => {
											let cls = 'tag';
											if(t === 'Cloud') cls += ' cloud';
											if(t === 'Local') cls += ' local';
											return \`<span class="\${cls}">\${t}</span>\`;
										}).join('')}
									</div>
									<div class="card-desc" title="\${item.description}">
										\${item.description}
									</div>
									<div class="actions">
										<button class="btn" onclick="installServer('\${item.url}', '\${item.name}')">Install</button>
										<button class="btn secondary" onclick="sendMessage('openLink', {url: '\${item.url}'})">GitHub</button>
									</div>
								</div>
							\`).join('');
							html += \`</div>\`;
						}
					});

					container.innerHTML = hasResults ? html : '<p style="text-align: center; padding: 40px; color: var(--text-secondary);">No servers found matching your search.</p>';
				}

				function toggleServer(id, enabled) {
					sendMessage('toggleServer', { id, enabled });
				}

				function installServer(repoUrl, name) {
					sendMessage('installServer', { repoUrl, name });
				}

				function setLoading(isLoading) {
					const loader = document.getElementById('loading');
					// Safely handle loader visibility
					if (isLoading) {
						loader.classList.remove('hidden');
					} else {
						loader.classList.add('hidden');
					}
				}

				// Handle messages from the extension
				window.addEventListener('message', event => {
					const message = event.data;
					switch (message.command) {
						case 'updateData':
							renderServers(message.servers);
							renderRegistry(message.registry);
							setLoading(false); // Ensure loading is cleared when data arrives
							break;
						case 'setLoading': // Fallback for pure loading events
							setLoading(message.value);
							break;
						case 'setBusy':
							setLoading(message.busy);
							break;
					}
				});
			</script>
		</body>
		</html>`;
	}
}
