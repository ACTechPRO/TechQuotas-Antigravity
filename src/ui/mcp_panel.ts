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
					--container-paddding: 20px;
					--input-padding-vertical: 6px;
					--input-padding-horizontal: 4px;
					--input-margin-vertical: 4px;
					--input-margin-horizontal: 0;
				}

				body {
					padding: 0;
					margin: 0;
					font-family: var(--vscode-font-family);
					color: var(--vscode-foreground);
					background-color: var(--vscode-editor-background);
				}

				.tabs {
					display: flex;
					border-bottom: 1px solid var(--vscode-panel-border);
					background: var(--vscode-sideBar-background);
					padding: 0 10px;
				}

				.tab {
					padding: 10px 20px;
					cursor: pointer;
					border-bottom: 2px solid transparent;
					opacity: 0.7;
					transition: all 0.2s;
					font-weight: 500;
				}

				.tab:hover {
					opacity: 1;
					background: var(--vscode-list-hoverBackground);
				}

				.tab.active {
					border-bottom-color: var(--vscode-activityBar-activeBorder);
					opacity: 1;
					color: var(--vscode-textLink-foreground);
				}

				.content {
					padding: 20px;
					height: calc(100vh - 45px);
					overflow-y: auto;
				}

				.hidden {
					display: none;
				}

				/* Card Grid */
				.grid {
					display: grid;
					grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
					gap: 15px;
				}

				.card {
					background: var(--vscode-editor-background);
					border: 1px solid var(--vscode-widget-border);
					border-radius: 6px;
					padding: 15px;
					position: relative;
					transition: transform 0.1s;
				}

				.card:hover {
					transform: translateY(-2px);
					box-shadow: 0 4px 8px rgba(0,0,0,0.2);
					border-color: var(--vscode-focusBorder);
				}

				.card-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 10px;
				}

				.card-title {
					font-size: 1.1em;
					font-weight: bold;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}

				.card-meta {
					font-size: 0.9em;
					color: var(--vscode-descriptionForeground);
					margin-bottom: 10px;
					display: flex;
					gap: 8px;
					flex-wrap: wrap;
				}

				.tag {
					background: var(--vscode-badge-background);
					color: var(--vscode-badge-foreground);
					padding: 2px 6px;
					border-radius: 4px;
					font-size: 0.8em;
				}

				.card-desc {
					font-size: 0.9em;
					margin-bottom: 15px;
					line-height: 1.4;
					color: var(--vscode-foreground);
					display: -webkit-box;
					-webkit-line-clamp: 3;
					-webkit-box-orient: vertical;
					overflow: hidden;
				}

				.actions {
					display: flex;
					gap: 10px;
					margin-top: auto;
				}

				button {
					background: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					border: none;
					padding: 6px 12px;
					cursor: pointer;
					border-radius: 2px;
					font-family: inherit;
				}

				button:hover {
					background: var(--vscode-button-hoverBackground);
				}

				button.secondary {
					background: var(--vscode-button-secondaryBackground);
					color: var(--vscode-button-secondaryForeground);
				}
				
				button.secondary:hover {
					background: var(--vscode-button-secondaryHoverBackground);
				}

				/* Toggle Switch */
				.toggle-container {
					display: flex;
					align-items: center;
					cursor: pointer;
				}

				.toggle-chk {
					display: none;
				}

				.toggle-track {
					width: 36px;
					height: 20px;
					background: var(--vscode-input-background);
					border-radius: 20px;
					position: relative;
					transition: background 0.3s;
					border: 1px solid var(--vscode-widget-border);
				}

				.toggle-thumb {
					width: 16px;
					height: 16px;
					background: var(--vscode-foreground);
					border-radius: 50%;
					position: absolute;
					top: 1px;
					left: 2px;
					transition: transform 0.3s;
				}

				.toggle-chk:checked + .toggle-track {
					background: var(--vscode-button-background);
					border-color: var(--vscode-button-background);
				}

				.toggle-chk:checked + .toggle-track .toggle-thumb {
					transform: translateX(16px);
					background: var(--vscode-button-foreground);
				}

				/* Search Bar */
				.search-box {
					width: 100%;
					padding: 8px 12px;
					margin-bottom: 20px;
					background: var(--vscode-input-background);
					color: var(--vscode-input-foreground);
					border: 1px solid var(--vscode-input-border);
					border-radius: 4px;
					font-size: 1em;
				}

				.search-box:focus {
					outline: 1px solid var(--vscode-focusBorder);
				}

				.loading-overlay {
					position: fixed;
					top: 0; left: 0; right: 0; bottom: 0;
					background: rgba(0,0,0,0.5);
					display: flex;
					justify-content: center;
					align-items: center;
					color: white;
					font-size: 1.2em;
					z-index: 1000;
				}

				.header-bar {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 20px;
				}

				.section-title {
					font-size: 1.2em;
					font-weight: bold;
					margin: 20px 0 10px 0;
					border-bottom: 1px solid var(--vscode-panel-border);
					padding-bottom: 5px;
				}
			</style>
		</head>
		<body>
			<div class="tabs">
				<div class="tab active" onclick="switchTab('installed')">Installed</div>
				<div class="tab" onclick="switchTab('marketplace')">Marketplace</div>
			</div>

			<!-- INSTALLED TAB -->
			<div id="installed" class="content">
				<div class="header-bar">
					<h2>Configured Servers</h2>
					<div class="actions">
						<button class="secondary" onclick="sendMessage('refresh')">⟳ Refresh</button>
						<button class="secondary" onclick="sendMessage('editConfig')">⚙ Edit JSON</button>
					</div>
				</div>
				<div id="servers-list" class="grid">
					<!-- Servers injected here -->
				</div>
			</div>

			<!-- MARKETPLACE TAB -->
			<div id="marketplace" class="content hidden">
				<div class="header-bar">
					<h2>Marketplace</h2>
					<button class="secondary" onclick="sendMessage('refresh')">⟳ Reload Registry</button>
				</div>
				<input type="text" class="search-box" id="search" placeholder="Search for MCP servers..." oninput="filterMarketplace()">
				<div id="registry-list">
					<!-- Marketplace items injected here -->
				</div>
			</div>

			<div id="loading" class="loading-overlay hidden">
				Processing...
			</div>

			<script>
				const vscode = acquireVsCodeApi();
				let registryData = [];

				function switchTab(tabId) {
					document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
					document.querySelectorAll('.content').forEach(c => c.classList.add('hidden'));
					
					document.querySelector(\`.tab[onclick="switchTab('\${tabId}')"]\`).classList.add('active');
					document.getElementById(tabId).classList.remove('hidden');
				}

				function sendMessage(command, payload = {}) {
					vscode.postMessage({ command, ...payload });
				}

				function renderServers(servers) {
					const container = document.getElementById('servers-list');
					if (Object.keys(servers).length === 0) {
						container.innerHTML = '<p>No servers configured.</p>';
						return;
					}

					container.innerHTML = Object.entries(servers).map(([id, config]) => \`
						<div class="card">
							<div class="card-header">
								<span class="card-title">\${id}</span>
								<label class="toggle-container">
									<input type="checkbox" class="toggle-chk" 
										\${!config.disabled ? 'checked' : ''} 
										onchange="toggleServer('\${id}', this.checked)">
									<div class="toggle-track">
										<div class="toggle-thumb"></div>
									</div>
								</label>
							</div>
							<div class="card-meta">
								<span class="tag">\${config.command}</span>
							</div>
							<div class="actions">
								<small style="opacity:0.7">Args: \${config.args.length}</small>
							</div>
						</div>
					\`).join('');
				}

				function renderRegistry(data) {
					registryData = data || [];
					filterMarketplace();
				}

				function filterMarketplace() {
					const query = document.getElementById('search').value.toLowerCase();
					const container = document.getElementById('registry-list');
					
					if (!registryData || registryData.length === 0) {
						container.innerHTML = '<p>Loading registry...</p>';
						return;
					}

					let html = '';

					registryData.forEach(category => {
						const items = category.items.filter(item => 
							item.name.toLowerCase().includes(query) || 
							item.description.toLowerCase().includes(query)
						);

						if (items.length > 0) {
							html += \`<div class="section-title">\${category.name}</div><div class="grid">\`;
							html += items.map(item => \`
								<div class="card">
									<div class="card-header">
										<span class="card-title">\${item.name}</span>
									</div>
									<div class="card-meta">
										\${(item.tags || []).map(t => \`<span class="tag">\${t}</span>\`).join('')}
									</div>
									<div class="card-desc" title="\${item.description}">
										\${item.description}
									</div>
									<div class="actions">
										<button onclick="installServer('\${item.url}', '\${item.name}')">Install</button>
										<button class="secondary" onclick="sendMessage('openLink', {url: '\${item.url}'})">GitHub</button>
									</div>
								</div>
							\`).join('');
							html += \`</div>\`;
						}
					});

					container.innerHTML = html || '<p>No results found.</p>';
				}

				function toggleServer(id, enabled) {
					sendMessage('toggleServer', { id, enabled });
				}

				function installServer(repoUrl, name) {
					sendMessage('installServer', { repoUrl, name });
				}

				// Handle messages from the extension
				window.addEventListener('message', event => {
					const message = event.data;
					switch (message.command) {
						case 'updateData':
							renderServers(message.servers);
							renderRegistry(message.registry);
							break;
						case 'setLoading':
							// Registry loading spinner if needed
							break;
						case 'setBusy':
							const loader = document.getElementById('loading');
							if (message.busy) loader.classList.remove('hidden');
							else loader.classList.add('hidden');
							break;
					}
				});
			</script>
		</body>
		</html>`;
    }
}
