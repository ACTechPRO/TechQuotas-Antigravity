/**
 * TechQuotas Antigravity - Status Bar UI Manager
 * Enhanced visual indicators with colored balls (icons) and standard white text
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

/** Get colored ball icon based on remaining percentage */
function get_status_ball(percentage: number): string {
	return '$(circle-large-filled)';
}

/** Get color hex code for status */
function get_status_color_hex(percentage: number): string {
	if (percentage <= 20) return '#f14c4c'; // Red
	if (percentage <= 50) return '#dcdcaa'; // Yellow
	return '#4ec9b0'; // Green
}

/** Draw progress bar for tooltip */
function draw_progress_bar(percentage: number): string {
	const total = 10;
	const filled = Math.round((percentage / 100) * total);
	const empty = total - filled;
	return '▓'.repeat(filled) + '░'.repeat(empty);
}

/** Format time for status bar display */
function format_short_time(ms: number): string {
	if (ms <= 0) return 'now';
	const totalMins = Math.ceil(ms / 60000);

	if (totalMins < 60) {
		return `${totalMins}m`;
	}

	const hours = Math.floor(totalMins / 60);
	const mins = totalMins % 60;

	if (hours < 24) {
		const hh = hours.toString().padStart(2, '0');
		const mm = mins.toString().padStart(2, '0');
		return `${hh}:${mm}h`;
	}

	const days = Math.floor(hours / 24);
	return `${days}d`;
}

/** Group definition */
interface grouped_model {
	group_id: string;
	display_name: string;
	remaining_percentage: number;
	time_until_reset_formatted: string;
	time_until_reset_ms: number;
	is_exhausted: boolean;
	source_models: model_quota_info[];
}

/** Build tooltips */
function build_group_tooltip(group: grouped_model): string {
	const pct = group.remaining_percentage;
	const bar = draw_progress_bar(pct);
	const ball = get_status_ball(pct);
	const status = group.is_exhausted ? 'Exhausted' : pct < 20 ? 'Low' : pct < 50 ? 'Warning' : 'Available';

	const lines = [
		`${group.display_name}`,
		`━━━━━━━━━━━━━━━━━━━━`,
		`${bar} ${pct.toFixed(1)}%`,
		`Status: ${ball} ${status}`,
		`Resets: ${group.time_until_reset_formatted}`,
	];

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

/** Helper to group models */
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
			group_id = m.model_id;
		}

		if (!groups.has(group_id)) {
			groups.set(group_id, []);
		}
		groups.get(group_id)!.push(m);
	}

	const result: grouped_model[] = [];

	for (const [group_id, group_models] of groups) {
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
			const words = lowest.label.split(/[\s\-_()]+/).filter(Boolean);
			display_name = MODEL_ABBREVIATIONS[lowest.label] || (words[0]?.slice(0, 8) ?? 'Model');
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

/**
 * Manages a single group's display in the status bar.
 * Uses TWO items to separate colored icon from white text.
 */
class StatusBarGroupRender {
	private iconItem: vscode.StatusBarItem;
	private textItem: vscode.StatusBarItem;

	constructor(priority: number) {
		// Icon item (Higher priority to appear on left)
		this.iconItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority);

		// Text item (Lower priority to appear on right of icon)
		this.textItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority - 0.1);

		this.iconItem.command = 'techquotas.show_menu';
		this.textItem.command = 'techquotas.show_menu';
	}

	update(group: grouped_model) {
		const pct = group.remaining_percentage;
		const resetTime = format_short_time(group.time_until_reset_ms);
		const tooltip = build_group_tooltip(group);

		// Icon: Colored ball
		this.iconItem.text = `$(circle-large-filled)`;
		this.iconItem.color = get_status_color_hex(pct);
		this.iconItem.tooltip = tooltip;
		this.iconItem.backgroundColor = undefined;

		// Text: White text (standard)
		// Added a thin space or normal space for padding
		this.textItem.text = `${group.display_name} ${Math.round(pct)}% (${resetTime})`;
		this.textItem.color = undefined; // Uses theme default (white/light)
		this.textItem.tooltip = tooltip;
		this.textItem.backgroundColor = undefined;

		this.iconItem.show();
		this.textItem.show();
	}

	hide() {
		this.iconItem.hide();
		this.textItem.hide();
	}

	dispose() {
		this.iconItem.dispose();
		this.textItem.dispose();
	}
}

export class StatusBarManager {
	private main_item: vscode.StatusBarItem;
	private group_renders: Map<string, StatusBarGroupRender> = new Map();
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
		this.group_renders.forEach(r => r.hide());
	}

	show_error(msg: string) {
		this.main_item.text = '$(error) TQ';
		this.main_item.tooltip = `TechQuotas Error: ${msg}`;
		this.main_item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
		this.main_item.show();
		this.group_renders.forEach(r => r.hide());
	}

	update(snapshot: quota_snapshot, show_credits: boolean) {
		this.last_snapshot = snapshot;
		this.main_item.backgroundColor = undefined;

		const show_gauges = this.get_show_gauges();
		const pinned = this.get_pinned_models();
		const customOrder = this.get_group_order();

		let grouped = group_models(snapshot.models);

		if (pinned.length > 0) {
			grouped = grouped.filter(g => pinned.includes(g.group_id));
		}

		// Apply custom order if specified
		if (customOrder.length > 0) {
			grouped = grouped.sort((a, b) => {
				const aIndex = customOrder.indexOf(a.group_id);
				const bIndex = customOrder.indexOf(b.group_id);
				if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
				if (aIndex >= 0) return -1;
				if (bIndex >= 0) return 1;
				return a.remaining_percentage - b.remaining_percentage;
			});
		}

		if (show_gauges && grouped.length > 0) {
			this.main_item.text = '$(rocket)';
			this.main_item.tooltip = 'TechQuotas Antigravity - Click for details';

			const active_ids = new Set<string>();
			// Start priority at 99. Each group takes ~1 priority slot (handled by fractional steps in Render class)
			// But since we use P and P-0.1, we should space groups by at least 1.
			let priority = 99;

			for (const group of grouped) {
				active_ids.add(group.group_id);
				let render = this.group_renders.get(group.group_id);

				if (!render) {
					render = new StatusBarGroupRender(priority);
					this.group_renders.set(group.group_id, render);
				}

				render.update(group);
				priority -= 1; // Decrement by 1 ensures groups don't overlap in priority
			}

			// Hide items for groups no longer displayed
			this.group_renders.forEach((render, id) => {
				if (!active_ids.has(id)) {
					render.hide();
				}
			});
		} else {
			// Compact mode - show lowest group
			const lowest = grouped[0];

			if (lowest) {
				const pct = lowest.remaining_percentage;
				const ball = get_status_ball(pct);
				// In compact mode (single item), we typically have to sacrifice multi-color text
				// UNLESS we use the same split logic. But main_item is single.
				// We'll keep main_item simple: colored icon + white text is NOT possible in one item.
				// But we can set color to undefined (white) and allow icon to be white too, OR color it all.
				// Compromise: in compact mode, color the whole thing OR white. 
				// User wants white text. We will set color=undefined for Compact mode.
				// Wait, if it's compact, it's just one TQ item.
				this.main_item.text = `${ball} TQ ${Math.round(pct)}%`;
				this.main_item.color = undefined; // All white for compact mode to be safe
				this.main_item.backgroundColor = undefined;
			} else {
				this.main_item.text = '$(rocket) TQ';
			}

			this.group_renders.forEach(r => r.hide());
		}

		if (!show_gauges) {
			this.group_renders.forEach(r => r.hide());
		}
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
				const bar = draw_progress_bar(pct);
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

	dispose() {
		this.main_item.dispose();
		this.group_renders.forEach(r => r.dispose());
		this.group_renders.clear();
	}
}
