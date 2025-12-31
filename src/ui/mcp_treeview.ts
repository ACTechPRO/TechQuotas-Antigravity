/**
 * TechQuotas Antigravity - MCP Sidebar Tree View
 * Quick access to MCP servers in the Activity Bar
 */

import * as vscode from 'vscode';
import { MCPManager } from '../core/mcp_manager';
import { MCPServerConfig } from '../utils/mcp_types';
import { logger } from '../utils/logger';

export class MCPTreeProvider implements vscode.TreeDataProvider<MCPServerItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MCPServerItem | undefined | null | void> = new vscode.EventEmitter<MCPServerItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MCPServerItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private mcpManager: MCPManager) {
        mcpManager.on_config_change(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: MCPServerItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: MCPServerItem): Promise<MCPServerItem[]> {
        if (element) {
            return []; // No children for now (flat list)
        }

        try {
            const servers = await this.mcpManager.get_servers();
            const items: MCPServerItem[] = [];

            for (const [id, config] of Object.entries(servers)) {
                items.push(new MCPServerItem(
                    id,
                    config,
                    config.disabled ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.None
                ));
            }

            return items.sort((a, b) => (a.label as string).localeCompare(b.label as string));
        } catch (e: any) {
            logger.error('MCPTree', `Failed to get servers: ${e.message}`);
            return [];
        }
    }
}

export class MCPServerItem extends vscode.TreeItem {
    constructor(
        public readonly id: string,
        private config: MCPServerConfig,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(id, collapsibleState);
        this.label = id;
        this.tooltip = `${this.config.command} ${this.config.args.join(' ')}`;
        this.description = this.config.disabled ? '(Disabled)' : '(Active)';

        // Icon based on status
        if (this.config.disabled) {
            this.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
        } else {
            this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
        }

        this.contextValue = this.config.disabled ? 'mcpServerDisabled' : 'mcpServerEnabled';
    }
}
