/**
 * TechQuotas Antigravity - Update Checker
 * Checks GitHub Releases for updates and installs new versions
 */

import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';

const LOG_CAT = 'UpdateChecker';
const GITHUB_OWNER = 'ACTechPRO';
const GITHUB_REPO = 'TechQuotas-Antigravity';
const REMIND_LATER_KEY = 'techquotas.remindLaterTimestamp';
const REMIND_LATER_DAYS = 7;

interface GitHubRelease {
    tag_name: string;
    name: string;
    assets: {
        name: string;
        browser_download_url: string;
    }[];
}

export class UpdateChecker {
    private context: vscode.ExtensionContext;
    private currentVersion: string;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // Get current version from package.json
        const ext = vscode.extensions.getExtension('ac-tech-pro.techquotas-antigravity');
        this.currentVersion = ext?.packageJSON?.version || '0.0.0';
        logger.info(LOG_CAT, `Current version: ${this.currentVersion}`);
    }

    /**
     * Main entry point - check for updates on startup
     */
    public async checkForUpdates(force: boolean = false): Promise<void> {
        // Check if "Remind Later" is still active
        if (!force && this.isRemindLaterActive()) {
            logger.debug(LOG_CAT, 'Remind Later is active, skipping update check');
            return;
        }

        // Check if auto-update is enabled
        const autoUpdate = vscode.workspace.getConfiguration('techquotas').get<boolean>('autoUpdate', false);

        try {
            const latestRelease = await this.fetchLatestRelease();
            if (!latestRelease) {
                logger.warn(LOG_CAT, 'Could not fetch latest release');
                return;
            }

            const latestVersion = latestRelease.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present
            logger.info(LOG_CAT, `Latest version on GitHub: ${latestVersion}`);

            if (this.isNewerVersion(latestVersion, this.currentVersion)) {
                logger.info(LOG_CAT, `Update available: ${this.currentVersion} -> ${latestVersion}`);

                // Find VSIX asset
                const vsixAsset = latestRelease.assets.find(a => a.name.endsWith('.vsix'));
                if (!vsixAsset) {
                    logger.warn(LOG_CAT, 'No VSIX asset found in release');
                    return;
                }

                if (autoUpdate) {
                    // Auto-update enabled, just do it
                    await this.downloadAndInstall(vsixAsset.browser_download_url, latestVersion);
                } else {
                    // Prompt user
                    await this.promptUpdate(latestVersion, vsixAsset.browser_download_url);
                }
            } else {
                logger.info(LOG_CAT, 'Already up to date');
            }
        } catch (e: any) {
            logger.error(LOG_CAT, `Update check failed: ${e.message}`);
        }
    }

    private isRemindLaterActive(): boolean {
        const timestamp = this.context.globalState.get<number>(REMIND_LATER_KEY);
        if (!timestamp) return false;

        const now = Date.now();
        const isActive = now < timestamp;
        if (!isActive) {
            // Clear expired timestamp
            this.context.globalState.update(REMIND_LATER_KEY, undefined);
        }
        return isActive;
    }

    private setRemindLater(): void {
        const futureTime = Date.now() + (REMIND_LATER_DAYS * 24 * 60 * 60 * 1000);
        this.context.globalState.update(REMIND_LATER_KEY, futureTime);
        logger.info(LOG_CAT, `Remind Later set for ${REMIND_LATER_DAYS} days`);
    }

    private async fetchLatestRelease(): Promise<GitHubRelease | null> {
        return new Promise((resolve, reject) => {
            const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

            https.get(url, {
                headers: {
                    'User-Agent': 'TechQuotas-Antigravity-Extension',
                    'Accept': 'application/vnd.github.v3+json'
                }
            }, (res) => {
                if (res.statusCode === 404) {
                    resolve(null); // No releases yet
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`GitHub API returned ${res.statusCode}`));
                    return;
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data) as GitHubRelease);
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    /**
     * Simple semver comparison: returns true if latest > current
     */
    private isNewerVersion(latest: string, current: string): boolean {
        const latestParts = latest.split('.').map(Number);
        const currentParts = current.split('.').map(Number);

        for (let i = 0; i < 3; i++) {
            const l = latestParts[i] || 0;
            const c = currentParts[i] || 0;
            if (l > c) return true;
            if (l < c) return false;
        }
        return false; // Equal
    }

    private async promptUpdate(version: string, downloadUrl: string): Promise<void> {
        const updateNow = 'Update Now';
        const enableAutoUpdate = 'Enable Auto-Update';
        const remindLater = 'Remind Me in 7 Days';

        const choice = await vscode.window.showInformationMessage(
            `TechQuotas v${version} is available. You are using v${this.currentVersion}.`,
            updateNow,
            enableAutoUpdate,
            remindLater
        );

        switch (choice) {
            case updateNow:
                await this.downloadAndInstall(downloadUrl, version);
                break;
            case enableAutoUpdate:
                await vscode.workspace.getConfiguration('techquotas').update('autoUpdate', true, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('Auto-Update enabled for TechQuotas.');
                await this.downloadAndInstall(downloadUrl, version);
                break;
            case remindLater:
                this.setRemindLater();
                vscode.window.showInformationMessage('You will be reminded in 7 days.');
                break;
        }
    }

    private async downloadAndInstall(downloadUrl: string, version: string): Promise<void> {
        const progressOptions: vscode.ProgressOptions = {
            location: vscode.ProgressLocation.Notification,
            title: `Updating TechQuotas to v${version}`,
            cancellable: false
        };

        await vscode.window.withProgress(progressOptions, async (progress) => {
            progress.report({ message: 'Downloading...' });

            const tempDir = os.tmpdir();
            const vsixPath = path.join(tempDir, `techquotas-${version}.vsix`);

            try {
                await this.downloadFile(downloadUrl, vsixPath);
                progress.report({ message: 'Installing...' });

                await vscode.commands.executeCommand(
                    'workbench.extensions.installExtension',
                    vscode.Uri.file(vsixPath)
                );

                // Clean up temp file
                fs.unlinkSync(vsixPath);

                const reload = await vscode.window.showInformationMessage(
                    `TechQuotas v${version} installed. Reload to activate.`,
                    'Reload Now'
                );

                if (reload === 'Reload Now') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            } catch (e: any) {
                logger.error(LOG_CAT, `Install failed: ${e.message}`);
                vscode.window.showErrorMessage(`Failed to install update: ${e.message}`);
            }
        });
    }

    private downloadFile(url: string, destPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(destPath);

            const request = (urlToFetch: string) => {
                https.get(urlToFetch, {
                    headers: { 'User-Agent': 'TechQuotas-Antigravity-Extension' }
                }, (res) => {
                    // Handle redirects (GitHub uses them for downloads)
                    if (res.statusCode === 302 || res.statusCode === 301) {
                        const redirectUrl = res.headers.location;
                        if (redirectUrl) {
                            request(redirectUrl);
                            return;
                        }
                    }

                    if (res.statusCode !== 200) {
                        reject(new Error(`Download failed with status ${res.statusCode}`));
                        return;
                    }

                    res.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                }).on('error', (e) => {
                    fs.unlinkSync(destPath);
                    reject(e);
                });
            };

            request(url);
        });
    }
}
