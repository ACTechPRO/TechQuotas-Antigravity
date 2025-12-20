/**
 * Process Finder Service
 * Refactored to use spawn with {shell: false} to avoid quote escaping issues
 * when running from D:\ root directory on Windows.
 */

import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import * as https from 'https';
import * as process from 'process';
import { logger } from '../utils/logger';

// Windows absolute paths for system commands
const WIN_SYS32 = 'C:\\Windows\\System32';
const WIN_POWERSHELL = `${WIN_SYS32}\\WindowsPowerShell\\v1.0\\powershell.exe`;
const WIN_WMIC = `${WIN_SYS32}\\wbem\\wmic.exe`;
const WIN_NETSTAT = `${WIN_SYS32}\\netstat.exe`;

export interface process_info {
	extension_port: number;
	connect_port: number;
	csrf_token: string;
}

interface parsed_process_info {
	pid: number;
	extension_port: number;
	csrf_token: string;
}

const LOG_CAT = 'ProcessFinder';

/**
 * Execute a command using spawn with {shell: false}
 * This avoids all shell quote escaping issues
 */
async function spawn_async(
	cmd: string,
	args: string[],
	options?: SpawnOptionsWithoutStdio
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		logger.debug(LOG_CAT, `spawn: ${cmd} ${args.map(a => `"${a}"`).join(' ')}`);

		const child = spawn(cmd, args, options);
		let stdout = '';
		let stderr = '';

		child.stdout?.on('data', data => {
			stdout += data.toString();
		});

		child.stderr?.on('data', data => {
			stderr += data.toString();
		});

		child.on('close', code => {
			if (code === 0 || stdout.length > 0) {
				resolve({ stdout, stderr });
			} else {
				reject(new Error(`Process exited with code ${code}: ${stderr}`));
			}
		});

		child.on('error', err => {
			reject(err);
		});
	});
}

export class ProcessFinder {
	private process_name: string;

	constructor() {
		logger.debug(LOG_CAT, `Initializing ProcessFinder for platform: ${process.platform}, arch: ${process.arch}`);

		if (process.platform === 'win32') {
			this.process_name = 'language_server_windows_x64.exe';
		} else if (process.platform === 'darwin') {
			this.process_name = `language_server_macos${process.arch === 'arm64' ? '_arm' : ''}`;
		} else {
			this.process_name = `language_server_linux${process.arch === 'arm64' ? '_arm' : '_x64'}`;
		}

		logger.info(LOG_CAT, `Target process name: ${this.process_name}`);
	}

	async detect_process_info(max_retries: number = 1): Promise<process_info | null> {
		logger.section(LOG_CAT, `Starting process detection (max_retries: ${max_retries})`);
		const timer = logger.time_start('detect_process_info');

		for (let i = 0; i < max_retries; i++) {
			logger.debug(LOG_CAT, `Attempt ${i + 1}/${max_retries}`);

			try {
				const info = await this.get_process_info();

				if (info) {
					logger.info(LOG_CAT, `Process info found:`, {
						pid: info.pid,
						extension_port: info.extension_port,
						csrf_token: `${info.csrf_token.substring(0, 8)}...`,
					});

					logger.debug(LOG_CAT, `Getting listening ports for PID: ${info.pid}`);
					const ports = await this.get_listening_ports(info.pid);

					logger.debug(LOG_CAT, `Found ${ports.length} listening port(s): [${ports.join(', ')}]`);

					if (ports.length > 0) {
						logger.debug(LOG_CAT, `Testing ports to find working endpoint...`);
						const valid_port = await this.find_working_port(ports, info.csrf_token);

						if (valid_port) {
							logger.info(LOG_CAT, `SUCCESS: Valid port found: ${valid_port}`);
							timer();
							return {
								extension_port: info.extension_port,
								connect_port: valid_port,
								csrf_token: info.csrf_token,
							};
						}
					}
				}
			} catch (e: any) {
				logger.error(LOG_CAT, `Attempt ${i + 1} failed:`, { message: e.message });
			}

			if (i < max_retries - 1) {
				await new Promise(r => setTimeout(r, 100));
			}
		}

		logger.error(LOG_CAT, `Process detection failed after ${max_retries} attempt(s)`);
		timer();
		return null;
	}

	private async get_process_info(): Promise<parsed_process_info | null> {
		if (process.platform === 'win32') {
			return this.get_process_info_windows();
		}
		return this.get_process_info_unix();
	}

	private async get_process_info_windows(): Promise<parsed_process_info | null> {
		// Use PowerShell with spawn - no shell escaping needed!
		const psCommand = `Get-CimInstance Win32_Process -Filter "name='${this.process_name}'" | Select-Object ProcessId,CommandLine | ConvertTo-Json`;

		try {
			const { stdout } = await spawn_async(WIN_POWERSHELL, ['-NoProfile', '-Command', psCommand]);

			if (!stdout.trim()) {
				logger.debug(LOG_CAT, 'PowerShell returned empty output');
				return null;
			}

			let data = JSON.parse(stdout.trim());
			if (!Array.isArray(data)) {
				data = [data];
			}

			// Filter for Antigravity processes
			const antigravity_processes = data.filter((item: any) => {
				const cmd = item.CommandLine || '';
				return (
					/--app_data_dir\s+antigravity\b/i.test(cmd) ||
					cmd.toLowerCase().includes('\\antigravity\\') ||
					cmd.toLowerCase().includes('/antigravity/')
				);
			});

			if (antigravity_processes.length === 0) {
				logger.debug(LOG_CAT, 'No Antigravity process found');
				return null;
			}

			const proc = antigravity_processes[0];
			const commandLine = proc.CommandLine || '';
			const pid = proc.ProcessId;

			const portMatch = commandLine.match(/--extension_server_port[=\s]+(\d+)/);
			const tokenMatch = commandLine.match(/--csrf_token[=\s]+([a-f0-9-]+)/i);

			if (!tokenMatch?.[1]) {
				logger.warn(LOG_CAT, 'CSRF token not found in command line');
				return null;
			}

			return {
				pid,
				extension_port: portMatch?.[1] ? parseInt(portMatch[1], 10) : 0,
				csrf_token: tokenMatch[1],
			};
		} catch (e: any) {
			logger.error(LOG_CAT, `PowerShell command failed: ${e.message}`);
			return null;
		}
	}

	private async get_process_info_unix(): Promise<parsed_process_info | null> {
		const cmd = process.platform === 'darwin' ? 'pgrep' : 'pgrep';
		const args = process.platform === 'darwin' ? ['-fl', this.process_name] : ['-af', this.process_name];

		try {
			const { stdout } = await spawn_async(cmd, args);
			const lines = stdout.split('\n');

			for (const line of lines) {
				if (line.includes('--extension_server_port')) {
					const parts = line.trim().split(/\s+/);
					const pid = parseInt(parts[0], 10);
					const cmdLine = line.substring(parts[0].length).trim();

					const portMatch = cmdLine.match(/--extension_server_port[=\s]+(\d+)/);
					const tokenMatch = cmdLine.match(/--csrf_token[=\s]+([a-zA-Z0-9-]+)/);

					return {
						pid,
						extension_port: portMatch ? parseInt(portMatch[1], 10) : 0,
						csrf_token: tokenMatch ? tokenMatch[1] : '',
					};
				}
			}
		} catch (e: any) {
			logger.error(LOG_CAT, `pgrep failed: ${e.message}`);
		}
		return null;
	}

	private async get_listening_ports(pid: number): Promise<number[]> {
		if (process.platform === 'win32') {
			return this.get_listening_ports_windows(pid);
		}
		return this.get_listening_ports_unix(pid);
	}

	private async get_listening_ports_windows(pid: number): Promise<number[]> {
		// Use PowerShell with spawn
		const psCommand = `Get-NetTCPConnection -OwningProcess ${pid} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort | ConvertTo-Json`;

		try {
			const { stdout } = await spawn_async(WIN_POWERSHELL, ['-NoProfile', '-Command', psCommand]);

			if (!stdout.trim()) {
				return [];
			}

			const data = JSON.parse(stdout.trim());
			if (Array.isArray(data)) {
				return data.filter(p => typeof p === 'number').sort((a, b) => a - b);
			} else if (typeof data === 'number') {
				return [data];
			}
		} catch (e: any) {
			logger.debug(LOG_CAT, `PowerShell port detection failed: ${e.message}`);
		}
		return [];
	}

	private async get_listening_ports_unix(pid: number): Promise<number[]> {
		const ports: number[] = [];

		// Try lsof first
		try {
			const { stdout } = await spawn_async('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-p', pid.toString()]);
			const regex = new RegExp(`^\\S+\\s+${pid}\\s+.*?(?:TCP|UDP)\\s+(?:\\*|[\\d.]+|\\[[\\da-f:]+\\]):(\\d+)\\s+\\(LISTEN\\)`, 'gim');
			let match;
			while ((match = regex.exec(stdout)) !== null) {
				const port = parseInt(match[1], 10);
				if (!ports.includes(port)) {
					ports.push(port);
				}
			}
		} catch {
			// lsof not available, continue
		}

		return ports.sort((a, b) => a - b);
	}

	private async find_working_port(ports: number[], csrf_token: string): Promise<number | null> {
		for (const port of ports) {
			logger.debug(LOG_CAT, `Testing port ${port}...`);
			const is_working = await this.test_port(port, csrf_token);

			if (is_working) {
				logger.info(LOG_CAT, `Port ${port} is working`);
				return port;
			}
		}
		return null;
	}

	private test_port(port: number, csrf_token: string): Promise<boolean> {
		return new Promise(resolve => {
			const options = {
				hostname: '127.0.0.1',
				port,
				path: '/exa.language_server_pb.LanguageServerService/GetUnleashData',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Codeium-Csrf-Token': csrf_token,
					'Connect-Protocol-Version': '1',
				},
				rejectUnauthorized: false,
				timeout: 5000,
			};

			const req = https.request(options, res => {
				let body = '';
				res.on('data', chunk => (body += chunk));
				res.on('end', () => {
					if (res.statusCode === 200) {
						try {
							JSON.parse(body);
							resolve(true);
						} catch {
							resolve(false);
						}
					} else {
						resolve(false);
					}
				});
			});

			req.on('error', () => resolve(false));
			req.on('timeout', () => {
				req.destroy();
				resolve(false);
			});

			req.write(JSON.stringify({ wrapper_data: {} }));
			req.end();
		});
	}
}
