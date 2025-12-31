/**
 * TechQuotas Antigravity - MCP Registry
 * Fetches and parses the MCP Marketplace from punkpeye/awesome-mcp-servers
 */

import * as vscode from 'vscode';
import * as https from 'https';
import { logger } from '../utils/logger';
import { RegistryData, RegistryCategory, RegistryItem } from '../utils/mcp_types';

const LOG_CAT = 'MCPRegistry';
const REGISTRY_URL = 'https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md';
const CACHE_DURATION_MS = 1000 * 60 * 60; // 1 hour

export class MCPRegistry {
    private cache: RegistryData | null = null;
    private last_fetch_time: number = 0;

    /**
     * Fetch registry data (cached)
     */
    public async get_registry_data(force_refresh: boolean = false): Promise<RegistryData> {
        if (!force_refresh && this.cache && (Date.now() - this.last_fetch_time < CACHE_DURATION_MS)) {
            logger.debug(LOG_CAT, 'Returning cached registry data');
            return this.cache;
        }

        logger.info(LOG_CAT, 'Fetching registry data from GitHub...');
        try {
            const content = await this.fetch_url(REGISTRY_URL);
            this.cache = this.parse_markdown(content);
            this.last_fetch_time = Date.now();
            logger.info(LOG_CAT, `Parsed ${this.count_items(this.cache)} servers from registry`);
            return this.cache;
        } catch (e: any) {
            logger.error(LOG_CAT, `Failed to fetch registry: ${e.message}`);
            return this.cache || []; // Return stale cache if available, else empty
        }
    }

    private count_items(data: RegistryData): number {
        return data.reduce((acc, cat) => acc + cat.items.length, 0);
    }

    private async fetch_url(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Status code: ${res.statusCode}`));
                    return;
                }
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', (e) => reject(e));
        });
    }

    /**
     * Parses the raw Markdown from awesome-mcp-servers
     * Structure is:
     * ### Group Name
     * - [Name](URL) Icons - Description
     */
    private parse_markdown(content: string): RegistryData {
        const result: RegistryData = [];
        const lines = content.split('\n');

        let current_category: RegistryCategory | null = null;

        // Regex for list items: - [Name](URL) ... - Description
        // Example: - [example/repo](https://github.com/example/repo) 🐍 🏠 - A description
        const item_regex = /-\s*\[([^\]]+)\]\(([^)]+)\)\s*(.*?)\s*-\s*(.+)/;

        for (const line of lines) {
            // Check for category header (### Category)
            if (line.trim().startsWith('### ')) {
                // Clean category name (remove emojis and HTML tags)
                let catName = line.replace('###', '').trim();
                // Remove HTML anchor tags if present e.g. <a name="..."></a>
                catName = catName.replace(/<[^>]+>/g, '').trim();
                // Remove emojis (simple range, not exhaustive but covers most in list)
                catName = catName.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();

                if (catName) {
                    current_category = { name: catName, items: [] };
                    result.push(current_category);
                }
                continue;
            }

            // Check for list item
            const match = line.match(item_regex);
            if (match && current_category) {
                const [_, name, url, icons, description] = match;

                // Parse tags from icons
                const tags: string[] = [];
                if (icons.includes('🐍')) tags.push('Python');
                if (icons.includes('☕')) tags.push('Java');
                if (icons.includes('🏠')) tags.push('Local');
                if (icons.includes('☁️')) tags.push('Cloud');
                if (icons.includes('🍎') || icons.includes('🪟') || icons.includes('🐧')) tags.push('OS Specific');

                current_category.items.push({
                    name: name.trim(),
                    url: url.trim(),
                    description: description.trim(),
                    tags: tags.length > 0 ? tags : undefined
                });
            }
        }

        return result.filter(c => c.items.length > 0);
    }
}
