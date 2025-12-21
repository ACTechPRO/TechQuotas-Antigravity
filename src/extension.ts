/**
 * TechQuotas Antigravity - Main Entry
 * Advanced quota monitoring for Antigravity IDE by AC Tech
 */

import * as vscode from 'vscode';
import { ConfigManager } from './core/config_manager';
import { ProcessFinder } from './core/process_finder';
import { QuotaManager } from './core/quota_manager';
import { StatusBarManager } from './ui/status_bar';
import { DashboardPanel } from './ui/dashboard';
import { logger } from './utils/logger';

let extensionUri: vscode.Uri;

let config_manager: ConfigManager;
let process_finder: ProcessFinder;
let quota_manager: QuotaManager;
let status_bar: StatusBarManager;
let is_initialized = false;

export async function activate(context: vscode.ExtensionContext) {
	extensionUri = context.extensionUri;
	logger.init(context);
	logger.section('Extension', 'TechQuotas Antigravity Activating');
	logger.info('Extension', `VS Code Version: ${vscode.version}`);
	logger.info('Extension', `Extension activating at: ${new Date().toISOString()}`);

	config_manager = new ConfigManager();
	process_finder = new ProcessFinder();
	quota_manager = new QuotaManager();
	status_bar = new StatusBarManager();

	context.subscriptions.push(status_bar);

	const config = config_manager.get_config();
	logger.debug('Extension', 'Initial config:', config);

	// Register Commands
	context.subscriptions.push(
		vscode.commands.registerCommand('techquotas.refresh', () => {
			logger.info('Extension', 'Manual refresh triggered');
			// Silent refresh - notification removed per user request
			quota_manager.fetch_quota();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('techquotas.show_menu', () => {
			logger.debug('Extension', 'Show menu triggered');
			status_bar.show_menu();
		})
	);

	// Manual activation command
	context.subscriptions.push(
		vscode.commands.registerCommand('techquotas.activate', async () => {
			logger.info('Extension', 'Manual activation triggered');
			if (!is_initialized) {
				await initialize_extension();
			} else {
				vscode.window.showInformationMessage('TechQuotas is already active');
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('techquotas.reconnect', async () => {
			logger.info('Extension', 'Reconnect triggered');
			vscode.window.showInformationMessage('TechQuotas: Reconnecting to Antigravity...');
			is_initialized = false;
			quota_manager.stop_polling();
			status_bar.show_loading();
			await initialize_extension();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('techquotas.show_logs', () => {
			logger.info('Extension', 'Opening debug log panel');
			logger.show();
			vscode.window.showInformationMessage('TechQuotas: Debug log opened');
		})
	);

	// Open Dashboard command
	context.subscriptions.push(
		vscode.commands.registerCommand('techquotas.openDashboard', () => {
			logger.info('Extension', 'Opening dashboard');
			const snapshot = quota_manager.get_last_snapshot();
			DashboardPanel.createOrShow(extensionUri, snapshot);
		})
	);

	// Setup Quota Manager Callbacks
	quota_manager.on_update(snapshot => {
		const current_config = config_manager.get_config();
		logger.debug('Extension', 'Quota update received:', {
			models_count: snapshot.models?.length ?? 0,
			prompt_credits: snapshot.prompt_credits,
			timestamp: snapshot.timestamp,
		});
		status_bar.update(snapshot, current_config.show_prompt_credits ?? false);

		// Also update dashboard if open
		if (DashboardPanel.currentPanel) {
			DashboardPanel.currentPanel.update(snapshot);
		}
	});

	quota_manager.on_error(err => {
		logger.error('Extension', `Quota error: ${err.message}`);
		status_bar.show_error(err.message);
	});

	// Initialize extension asynchronously (non-blocking)
	logger.debug('Extension', 'Starting async initialization...');
	initialize_extension().catch(err => {
		logger.error('Extension', 'Failed to initialize TechQuotas:', err);
	});

	// Handle Config Changes
	context.subscriptions.push(
		config_manager.on_config_change(new_config => {
			logger.info('Extension', 'Config changed:', new_config);
			if (new_config.enabled) {
				quota_manager.start_polling(new_config.polling_interval);
			} else {
				quota_manager.stop_polling();
			}
		})
	);

	logger.info('Extension', 'Extension activation complete');
}

async function initialize_extension() {
	if (is_initialized) {
		logger.debug('Extension', 'Already initialized, skipping');
		return;
	}

	logger.section('Extension', 'Initializing TechQuotas');
	const timer = logger.time_start('initialize_extension');

	const config = config_manager.get_config();
	status_bar.show_loading();

	try {
		logger.info('Extension', 'Detecting Antigravity process...');
		const process_info = await process_finder.detect_process_info();

		if (process_info) {
			logger.info('Extension', 'Process found successfully', {
				extension_port: process_info.extension_port,
				connect_port: process_info.connect_port,
				csrf_token: process_info.csrf_token.substring(0, 8) + '...',
			});

			quota_manager.init(process_info.connect_port, process_info.csrf_token);

			if (config.enabled) {
				logger.debug('Extension', `Starting polling with interval: ${config.polling_interval}ms`);
				quota_manager.start_polling(config.polling_interval);
			}
			is_initialized = true;
			logger.info('Extension', 'Initialization successful');
		} else {
			logger.error('Extension', 'Antigravity process not found');
			logger.info('Extension', 'Troubleshooting tips:');
			logger.info('Extension', '   1. Make sure Antigravity is running');
			logger.info('Extension', '   2. Check if the language_server process is running');
			logger.info('Extension', '   3. Try reloading the IDE');
			logger.info('Extension', '   4. Use "TechQuotas: Show Debug Log" for details');

			status_bar.show_error('Antigravity not found');
			vscode.window.showErrorMessage(
				'TechQuotas: Could not find Antigravity process. Is it running?',
				'Show Logs'
			).then(action => {
				if (action === 'Show Logs') {
					logger.show();
				}
			});
		}
	} catch (e: any) {
		logger.error('Extension', 'Detection failed with exception:', {
			message: e.message,
			stack: e.stack,
		});
		status_bar.show_error('Detection failed');
	}

	timer();
}

export function deactivate() {
	logger.info('Extension', 'TechQuotas deactivating');
	quota_manager?.stop_polling();
	status_bar?.dispose();
}
