/**
 * TechQuotas Antigravity - Status Bar UI Manager
 * Enhanced visual indicators with colored balls for per-model quota monitoring
 */

import * as vscode from 'vscode';
import { quota_snapshot, model_quota_info } from '../utils/types';

/** Mapping of model labels to short abbreviations */
const MODEL_ABBREVIATIONS: Record<string, string> = {
	'Gemini 3 Pro (High)': 'Gemini',
	'Gemini 3 Pro (Low)': 'Gem Lo',
	'Gemini 3 Flash': 'Gem Fl',
	'Claude Sonnet 4.5': 'Claude',
	'Claude Sonnet 4.5 (Thinking)': 'Claude T',
	'Claude Opus 4.5 (Thinking)': 'Opus T',
	'GPT-OSS 120B (Medium)': 'GPT',
};

/**
 * Get colored ball icon based on remaining percentage
 * Uses VS Code codicons for consistent shape
 */
function get_status_ball(percentage: number): string {
	return '$(circle-large-filled)';
}

/**
 * Get color hex code for status
 */
function get_status_color_hex(percentage: number): string {
	if (percentage <= 20) return '#f14c4c'; // Red
	if (percentage <= 50) return '#dcdcaa'; // Yellow
	return '#4ec9b0'; // Green
}

/**
 * Get VS Code theme color for background
 */
function get_quota_color(percentage: number | undefined): vscode.ThemeColor | undefined {
	if (percentage === undefined) return undefined;
	if (percentage <= 20) return new vscode.ThemeColor('statusBarItem.errorBackground');
	if (percentage <= 50) return new vscode.ThemeColor('statusBarItem.warningBackground');
	return undefined;
}

/** Get short abbreviation for a model label */
function get_abbreviation(label: string): string {
	if (MODEL_ABBREVIATIONS[label]) {
		return MODEL_ABBREVIATIONS[label];
	}
	// Fallback: first word only
	const words = label.split(/[\s\-_()]+/).filter(Boolean);
	return words[0]?.slice(0, 8) ?? 'Model';
}

/** Format time for status bar display (format like "01:10h" or "45m") */
function format_short_time(ms: number): string {
	if (ms <= 0) return 'now';
	const totalMins = Math.ceil(ms / 60000);

	if (totalMins < 60) {
		// Under 1 hour: show minutes only
		return `${totalMins}m`;
	}

	const hours = Math.floor(totalMins / 60);
	const mins = totalMins % 60;

	if (hours < 24) {
		// Format as HH:MMh (e.g., "01:10h" or "4:30h")
		const hh = hours.toString().padStart(2, '0');
		const mm = mins.toString().padStart(2, '0');
		return `${hh}:${mm}h`;
	}

	// More than 24 hours: show days
	const days = Math.floor(hours / 24);
	return `${days}d`;
}

/**
 * Group models for display:
 * - All Anthropic (Claude/Opus) models → single "Anthropic" entry (lowest remaining %)
 * - Gemini 3 Pro High + Low → single "Gemini Pro" entry (lowest remaining %)
 * - Gemini 3 Flash → individual
 * - Other models → individual
 */
interface grouped_model {
	group_id: string;
	display_name: string;
	remaining_percentage: number;
	time_until_reset_formatted: string;
	time_until_reset_ms: number;
	is_exhausted: boolean;
	source_models: model_quota_info[];
}

function group_models(models: model_quota_info[]): grouped_model[] {
	const groups: Map<string, model_quota_info[]> = new Map();

	for (const m of models) {
		const label = m.label.toLowerCase();
		let group_id: string;

		if (label.includes('claude') || label.includes('opus')) {
			group_id = 'anthropic';
		} else if (label.includes('gemini') && label.includes('pro')) {
			group_id = 'gemini_pro';
		} else if (label.includes('gemini') && label.includes('flash')) {
			group_id = 'gemini_flash';
		} else {
			// Individual model
			group_id = m.model_id;
		}

		if (!groups.has(group_id)) {
			groups.set(group_id, []);
		}
		groups.get(group_id)!.push(m);
	}

	const result: grouped_model[] = [];

	for (const [group_id, group_models] of groups) {
		// Use the lowest remaining percentage in the group
		const lowest = group_models.reduce((min, m) =>
			(m.remaining_percentage ?? 100) < (min.remaining_percentage ?? 100) ? m : min
		);

		let display_name: string;
		if (group_id === 'anthropic') {
			display_name = 'Anthropic';
		} else if (group_id === 'gemini_pro') {
			display_name = 'Gemini Pro';
		} else if (group_id === 'gemini_flash') {
			display_name = 'Gemini Flash';
		} else {
			display_name = get_abbreviation(lowest.label);
		}

		result.push({
			group_id,
			display_name,
			remaining_percentage: lowest.remaining_percentage ?? 0,
			time_until_reset_formatted: lowest.time_until_reset_formatted,
			time_until_reset_ms: lowest.time_until_reset,
			is_exhausted: group_models.some(m => m.is_exhausted),
			source_models: group_models,
		});
	}

	return result.sort((a, b) => a.remaining_percentage - b.remaining_percentage);
}


export class StatusBarManager {
	private main_item: vscode.StatusBarItem;
	private model_items: Map<string, vscode.StatusBarItem> = new Map();
	private last_snapshot: quota_snapshot | undefined;

	constructor() {
		this.main_item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.main_item.command = 'techquotas.show_menu';
		this.main_item.text = '$(rocket) TQ';
		this.main_item.tooltip = 'TechQuotas Antigravity - Click for details';
		this.main_item.show();
	}

	show_loading() {
		this.main_item.text = '$(sync~spin) TQ';
		this.main_item.tooltip = 'TechQuotas: Connecting to Antigravity...';
		this.main_item.show();
		this.model_items.forEach(item => item.hide());
	}

	show_error(msg: string) {
		this.main_item.text = '$(error) TQ';
		this.main_item.tooltip = `TechQuotas Error: ${msg}`;
		this.main_item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
		this.main_item.show();
		this.model_items.forEach(item => item.hide());
	}

	update(snapshot: quota_snapshot, show_credits: boolean) {
		this.last_snapshot = snapshot;
		this.main_item.backgroundColor = undefined;

		const show_gauges = this.get_show_gauges();
		const pinned = this.get_pinned_models();
		const customOrder = this.get_group_order();

		// Group models for display (Anthropic together, Gemini Pro together, etc.)
		let grouped = group_models(snapshot.models);

		// If user has pinned specific groups, filter to only show those
		if (pinned.length > 0) {
			grouped = grouped.filter(g => pinned.includes(g.group_id));
		}

		// Apply custom order if specified, otherwise sort by remaining percentage
		if (customOrder.length > 0) {
			grouped = grouped.sort((a, b) => {
				const aIndex = customOrder.indexOf(a.group_id);
				const bIndex = customOrder.indexOf(b.group_id);
				// Items in customOrder come first, in their specified order
				// Items not in customOrder are sorted to the end by percentage
				if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
				if (aIndex >= 0) return -1;
				if (bIndex >= 0) return 1;
				return a.remaining_percentage - b.remaining_percentage;
			});
		}

		if (show_gauges && grouped.length > 0) {
			// Show grouped items with colored balls
			this.main_item.text = '$(rocket)';
			this.main_item.tooltip = 'TechQuotas Antigravity - Click for details';

			const active_ids = new Set<string>();
			let priority = 99;

			for (const group of grouped) {
				active_ids.add(group.group_id);
				let item = this.model_items.get(group.group_id);

				if (!item) {
					item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority);
					item.command = 'techquotas.show_menu';
					this.model_items.set(group.group_id, item);
				}

				const pct = group.remaining_percentage;
				const ball = get_status_ball(pct);
				const resetTime = format_short_time(group.time_until_reset_ms);

				// Format: $(circle-large-filled) Anthropic 75% (2h)
				item.text = `${ball} ${group.display_name} ${Math.round(pct)}% (${resetTime})`;
				item.tooltip = this.build_group_tooltip(group);
				item.color = get_status_color_hex(pct);
				item.backgroundColor = undefined;
				item.show();

				priority--;
			}

			// Hide items for groups no longer displayed
			this.model_items.forEach((item, id) => {
				if (!active_ids.has(id)) {
					item.hide();
				}
			});
		} else {
			// Compact mode - show lowest group
			const lowest = grouped[0]; // Already sorted by lowest first

			if (lowest) {
				const pct = lowest.remaining_percentage;
				const ball = get_status_ball(pct);
				this.main_item.text = `${ball} TQ ${Math.round(pct)}%`;
				this.main_item.color = get_status_color_hex(pct);
				this.main_item.backgroundColor = undefined;
			} else {
				this.main_item.text = '$(rocket) TQ';
			}
		}

		if (!show_gauges) {
			this.model_items.forEach(item => item.hide());
		}
	}

	private build_model_tooltip(model: model_quota_info): string {
		const pct = model.remaining_percentage ?? 0;
		const bar = this.draw_progress_bar(pct);
		const ball = get_status_ball(pct);

		return [
			`${model.label}`,
			`━━━━━━━━━━━━━━━━━━━━`,
			`${bar} ${pct.toFixed(1)}%`,
			``,
			`Status: ${ball} ${model.is_exhausted ? 'Exhausted' : pct < 20 ? 'Low' : pct < 50 ? 'Warning' : 'Available'}`,
			`Resets: ${model.time_until_reset_formatted}`,
		].join('\n');
	}

	private build_group_tooltip(group: grouped_model): string {
		const pct = group.remaining_percentage;
		const bar = this.draw_progress_bar(pct);
		const ball = get_status_ball(pct);
		const status = group.is_exhausted ? 'Exhausted' : pct < 20 ? 'Low' : pct < 50 ? 'Warning' : 'Available';

		const lines = [
			`${group.display_name}`,
			`━━━━━━━━━━━━━━━━━━━━`,
			`${bar} ${pct.toFixed(1)}%`,
			`Status: ${ball} ${status}`,
			`Resets: ${group.time_until_reset_formatted}`,
		];

		// Show individual models in the group
		if (group.source_models.length > 1) {
			lines.push('', '📋 Models in group:');
			for (const m of group.source_models) {
				const mPct = m.remaining_percentage ?? 0;
				const mBall = get_status_ball(mPct);
				lines.push(`  ${mBall} ${m.label}: ${mPct.toFixed(0)}%`);
			}
		}

		return lines.join('\n');
	}

	show_menu() {
		const pick = vscode.window.createQuickPick();
		pick.title = 'TechQuotas Antigravity';
		pick.placeholder = 'Click a model to pin/unpin from status bar';
		pick.matchOnDescription = false;
		pick.matchOnDetail = false;
		pick.canSelectMany = false;

		pick.items = this.build_menu_items();

		let currentActiveItem: vscode.QuickPickItem | undefined;

		pick.onDidChangeActive(items => {
			currentActiveItem = items[0];
		});

		pick.onDidAccept(async () => {
			if (!currentActiveItem) return;

			// Check if it's a group item
			if ('group_id' in currentActiveItem) {
				await this.toggle_pinned_group((currentActiveItem as any).group_id);
				pick.items = this.build_menu_items();
				if (this.last_snapshot) {
					const config = vscode.workspace.getConfiguration('techquotas');
					this.update(this.last_snapshot, !!config.get('showPromptCredits'));
				}
			}
			// Check if it's Dashboard
			else if ('action' in currentActiveItem && (currentActiveItem as any).action === 'dashboard') {
				pick.hide();
				vscode.commands.executeCommand('techquotas.openDashboard');
			}
			// Check if it's Settings
			else if ('action' in currentActiveItem && (currentActiveItem as any).action === 'settings') {
				pick.hide();
				vscode.commands.executeCommand('workbench.action.openSettings', 'techquotas');
			}
			// Check if it's Refresh
			else if ('action' in currentActiveItem && (currentActiveItem as any).action === 'refresh') {
				pick.hide();
				vscode.commands.executeCommand('techquotas.refresh');
			}
		});

		pick.onDidHide(() => {
			pick.dispose();
		});

		pick.show();
	}

	private get_pinned_models(): string[] {
		const config = vscode.workspace.getConfiguration('techquotas');
		return config.get<string[]>('pinnedModels') || [];
	}

	private get_show_gauges(): boolean {
		const config = vscode.workspace.getConfiguration('techquotas');
		return config.get<boolean>('showGauges', true);
	}

	private get_group_order(): string[] {
		const config = vscode.workspace.getConfiguration('techquotas');
		return config.get<string[]>('groupOrder') || [];
	}

	private async set_group_order(order: string[]): Promise<void> {
		const config = vscode.workspace.getConfiguration('techquotas');
		await config.update('groupOrder', order, vscode.ConfigurationTarget.Global);
	}

	private async toggle_pinned_group(group_id: string): Promise<void> {
		const config = vscode.workspace.getConfiguration('techquotas');
		const pinned = [...(config.get<string[]>('pinnedModels') || [])];

		const index = pinned.indexOf(group_id);
		if (index >= 0) {
			pinned.splice(index, 1);
		} else {
			pinned.push(group_id);
		}

		await config.update('pinnedModels', pinned, vscode.ConfigurationTarget.Global);
	}

	private build_menu_items(): vscode.QuickPickItem[] {
		const items: (vscode.QuickPickItem & { group_id?: string; action?: string })[] = [];
		const snapshot = this.last_snapshot;
		const pinned = this.get_pinned_models();

		items.push({ label: '📊 Model Groups (click to pin/unpin)', kind: vscode.QuickPickItemKind.Separator });

		if (snapshot && snapshot.models.length > 0) {
			const grouped = group_models(snapshot.models);

			for (const g of grouped) {
				const pct = g.remaining_percentage;
				const ball = get_status_ball(pct);
				const bar = this.draw_progress_bar(pct);
				const is_pinned = pinned.includes(g.group_id);

				const pin_icon = is_pinned ? '📌' : '  ';
				const model_count = g.source_models.length > 1 ? ` (${g.source_models.length} models)` : '';

				const item: vscode.QuickPickItem & { group_id?: string } = {
					label: `${pin_icon} ${ball} ${g.display_name}${model_count}`,
					description: `${bar} ${pct.toFixed(1)}%`,
					detail: `    ⏱️ Resets: ${g.time_until_reset_formatted}`,
				};

				(item as any).group_id = g.group_id;
				items.push(item);
			}
		} else {
			items.push({
				label: '$(info) No model data',
				description: 'Waiting for quota info...',
			});
		}

		// Actions section
		items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
		items.push({ label: '⚡ Actions', kind: vscode.QuickPickItemKind.Separator });

		const dashboardItem: vscode.QuickPickItem & { action?: string } = {
			label: '$(dashboard) Open Dashboard',
			description: 'Full quota dashboard with charts',
		};
		(dashboardItem as any).action = 'dashboard';
		items.push(dashboardItem);

		const refreshItem: vscode.QuickPickItem & { action?: string } = {
			label: '$(refresh) Refresh Now',
			description: 'Manually refresh quota data',
		};
		(refreshItem as any).action = 'refresh';
		items.push(refreshItem);

		const settingsItem: vscode.QuickPickItem & { action?: string } = {
			label: '$(gear) Settings',
			description: 'Configure TechQuotas',
		};
		(settingsItem as any).action = 'settings';
		items.push(settingsItem);

		return items;
	}

	private draw_progress_bar(percentage: number): string {
		const total = 10;
		const filled = Math.round((percentage / 100) * total);
		const empty = total - filled;
		return '▓'.repeat(filled) + '░'.repeat(empty);
	}

	dispose() {
		this.main_item.dispose();
		this.model_items.forEach(item => item.dispose());
		this.model_items.clear();
	}
}
