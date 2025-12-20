/**
 * TechQuotas Antigravity - Status Bar UI Manager
 * Enhanced visual gauges for per-model quota monitoring
 */

import * as vscode from 'vscode';
import { quota_snapshot, model_quota_info } from '../utils/types';

/** Mapping of model labels to short abbreviations */
const MODEL_ABBREVIATIONS: Record<string, string> = {
	'Gemini 3 Pro (High)': 'Gemini Pro',
	'Gemini 3 Pro (Low)': 'Gemini Lo',
	'Gemini 3 Flash': 'Gemini Fl',
	'Claude Sonnet 4.5': 'Claude',
	'Claude Sonnet 4.5 (Thinking)': 'Claude T',
	'Claude Opus 4.5 (Thinking)': 'Opus T',
	'GPT-OSS 120B (Medium)': 'GPT-OSS',
};

/**
 * Get circular gauge icon based on percentage (used for status bar)
 * ○ = Empty (0-12%), ◔ = Quarter (13-37%), ◑ = Half (38-62%)
 * ◕ = Three-quarters (63-87%), ● = Full (88-100%)
 */
function get_gauge_icon(percentage: number): string {
	if (percentage <= 12) return '○';
	if (percentage <= 37) return '◔';
	if (percentage <= 62) return '◑';
	if (percentage <= 87) return '◕';
	return '●';
}

/**
 * Get color for quota level
 */
function get_quota_color(percentage: number | undefined): vscode.ThemeColor | undefined {
	if (percentage === undefined) return undefined;
	if (percentage <= 20) return new vscode.ThemeColor('statusBarItem.errorBackground');
	if (percentage <= 50) return new vscode.ThemeColor('statusBarItem.warningBackground');
	return undefined; // Green is default
}

/** Get short abbreviation for a model label */
function get_abbreviation(label: string): string {
	if (MODEL_ABBREVIATIONS[label]) {
		return MODEL_ABBREVIATIONS[label];
	}
	// Fallback: use first word + numbers
	const words = label.split(/[\s\-_()]+/).filter(Boolean);
	if (words.length >= 2) {
		return words.slice(0, 2).join(' ').slice(0, 12);
	}
	return label.slice(0, 10);
}

export class StatusBarManager {
	private main_item: vscode.StatusBarItem;
	private model_items: Map<string, vscode.StatusBarItem> = new Map();
	private last_snapshot: quota_snapshot | undefined;

	constructor() {
		// Main status bar item (summary/logo)
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
		// Hide individual model items during loading
		this.model_items.forEach(item => item.hide());
	}

	show_error(msg: string) {
		this.main_item.text = '$(error) TQ';
		this.main_item.tooltip = `TechQuotas Error: ${msg}`;
		this.main_item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
		this.main_item.show();
		// Hide individual model items on error
		this.model_items.forEach(item => item.hide());
	}

	update(snapshot: quota_snapshot, show_credits: boolean) {
		this.last_snapshot = snapshot;
		this.main_item.backgroundColor = undefined;

		const pinned = this.get_pinned_models();
		const show_gauges = this.get_show_gauges();

		// Get models to display (pinned ones, or all if none pinned)
		let display_models: model_quota_info[];
		if (pinned.length > 0) {
			display_models = snapshot.models.filter(m => pinned.includes(m.model_id));
		} else {
			// Show top 3 models by usage if none pinned
			display_models = [...snapshot.models]
				.sort((a, b) => (b.remaining_percentage ?? 0) - (a.remaining_percentage ?? 0))
				.slice(0, 3);
		}

		if (show_gauges && display_models.length > 0) {
			// Show individual gauge items for each model
			this.main_item.text = '$(rocket)';
			this.main_item.tooltip = 'TechQuotas Antigravity - Click for details';

			// Update/create model items
			const active_ids = new Set<string>();
			let priority = 99;

			for (const model of display_models) {
				active_ids.add(model.model_id);
				let item = this.model_items.get(model.model_id);

				if (!item) {
					item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority);
					item.command = 'techquotas.show_menu';
					this.model_items.set(model.model_id, item);
				}

				const pct = model.remaining_percentage ?? 0;
				const gauge = get_gauge_icon(pct);
				const abbrev = get_abbreviation(model.label);

				item.text = `${gauge} ${Math.round(pct)}%`;
				item.tooltip = this.build_model_tooltip(model);
				item.backgroundColor = get_quota_color(pct);
				item.show();

				priority--;
			}

			// Hide items for models no longer displayed
			this.model_items.forEach((item, id) => {
				if (!active_ids.has(id)) {
					item.hide();
				}
			});
		} else {
			// Compact mode: show summary in main item
			const lowest = display_models.reduce((min, m) =>
				(m.remaining_percentage ?? 100) < (min?.remaining_percentage ?? 100) ? m : min
				, display_models[0]);

			if (lowest) {
				const pct = lowest.remaining_percentage ?? 0;
				const gauge = get_gauge_icon(pct);
				this.main_item.text = `${gauge} TQ ${Math.round(pct)}%`;
				this.main_item.backgroundColor = get_quota_color(pct);
			} else {
				this.main_item.text = '$(rocket) TQ';
			}

			// Hide individual model items in compact mode
			this.model_items.forEach(item => item.hide());
		}

		this.main_item.show();
	}

	private build_model_tooltip(model: model_quota_info): string {
		const pct = model.remaining_percentage ?? 0;
		const bar = this.draw_progress_bar(pct);

		return [
			`${model.label}`,
			`━━━━━━━━━━━━━━━━━━`,
			`${bar} ${pct.toFixed(1)}%`,
			``,
			`Status: ${model.is_exhausted ? '🔴 Exhausted' : pct < 20 ? '🟡 Low' : '🟢 Available'}`,
			`Resets: ${model.time_until_reset_formatted}`,
		].join('\n');
	}

	show_menu() {
		const pick = vscode.window.createQuickPick();
		pick.title = 'TechQuotas Antigravity';
		pick.placeholder = 'Click a model to toggle its visibility in the status bar';
		pick.matchOnDescription = false;
		pick.matchOnDetail = false;
		pick.canSelectMany = false;

		pick.items = this.build_menu_items();

		let currentActiveItem: vscode.QuickPickItem | undefined;

		pick.onDidChangeActive(items => {
			currentActiveItem = items[0];
		});

		pick.onDidAccept(async () => {
			if (currentActiveItem && 'model_id' in currentActiveItem) {
				await this.toggle_pinned_model((currentActiveItem as any).model_id);
				pick.items = this.build_menu_items();
				if (this.last_snapshot) {
					const config = vscode.workspace.getConfiguration('techquotas');
					this.update(this.last_snapshot, !!config.get('showPromptCredits'));
				}
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

	private async toggle_pinned_model(model_id: string): Promise<void> {
		const config = vscode.workspace.getConfiguration('techquotas');
		const pinned = [...(config.get<string[]>('pinnedModels') || [])];

		const index = pinned.indexOf(model_id);
		if (index >= 0) {
			pinned.splice(index, 1);
		} else {
			pinned.push(model_id);
		}

		await config.update('pinnedModels', pinned, vscode.ConfigurationTarget.Global);
	}

	private build_menu_items(): vscode.QuickPickItem[] {
		const items: vscode.QuickPickItem[] = [];
		const snapshot = this.last_snapshot;
		const pinned = this.get_pinned_models();

		items.push({ label: '📊 Model Quotas', kind: vscode.QuickPickItemKind.Separator });

		if (snapshot && snapshot.models.length > 0) {
			for (const m of snapshot.models) {
				const pct = m.remaining_percentage ?? 0;
				const gauge = get_gauge_icon(pct);
				const bar = this.draw_progress_bar(pct);
				const is_pinned = pinned.includes(m.model_id);

				// Visual indicators
				const pin_icon = is_pinned ? '📌' : '  ';
				const status_icon = m.is_exhausted ? '🔴' : pct < 20 ? '🟡' : '🟢';

				const item: vscode.QuickPickItem & { model_id?: string } = {
					label: `${pin_icon} ${status_icon} ${gauge} ${m.label}`,
					description: `${bar} ${pct.toFixed(1)}%`,
					detail: `    ⏱️ Resets: ${m.time_until_reset_formatted}`,
				};

				(item as any).model_id = m.model_id;
				items.push(item);
			}
		} else {
			items.push({
				label: '$(info) No model data',
				description: 'Waiting for quota info...',
			});
		}

		items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
		items.push({
			label: '$(gear) Settings',
			description: 'Configure TechQuotas',
			detail: '    Open extension settings',
		});

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
