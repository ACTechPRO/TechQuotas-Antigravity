import * as vscode from 'vscode';
import { RegistryData, RegistryItem } from '../utils/mcp_types';

interface WeightedMatch {
    item: RegistryItem;
    score: number;
    reason: string[];
}

export class MCPRecommender {

    /**
     * Analyze workspace and return recommended servers from the registry
     */
    public async getRecommendations(registry: RegistryData): Promise<RegistryItem[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return [];

        // 1. Detect technologies with confidence scores
        const techScores = await this.detectTechnologies();

        // 2. Calculate matches
        const recommendations: WeightedMatch[] = [];
        const allItems = registry.flatMap(cat => cat.items);

        for (const item of allItems) {
            const match = this.calculateMatch(item, techScores);
            // Threshold: Only recommend if score is significant (> 5)
            // or if it's a very generic highly-rated tool (optional future heuristic)
            if (match.score > 5) {
                recommendations.push(match);
            }
        }

        // 3. Sort by score (descending)
        return recommendations
            .sort((a, b) => b.score - a.score)
            .map(m => m.item);
    }

    private async detectTechnologies(): Promise<Map<string, number>> {
        const scores = new Map<string, number>();
        const addScore = (tech: string, points: number) => {
            scores.set(tech, (scores.get(tech) || 0) + points);
        };

        // --- Node.js / JS Ecosystem ---
        if (await this.hasFile('**/package.json')) {
            addScore('node', 5);
            addScore('npm', 5);
            addScore('javascript', 3);

            // Analyze package.json content for specific frameworks
            const pkgContent = await this.readFileContent('**/package.json');
            if (pkgContent) {
                if (pkgContent.includes('"react"')) addScore('react', 10);
                if (pkgContent.includes('"next"')) addScore('nextjs', 10);
                if (pkgContent.includes('"vue"')) addScore('vue', 10);
                if (pkgContent.includes('"express"')) addScore('express', 10);
                if (pkgContent.includes('"typescript"')) {
                    addScore('typescript', 10);
                }
                if (pkgContent.includes('"tailwindcss"')) addScore('tailwind', 5);
            }
        }
        if (await this.hasFile('**/tsconfig.json')) addScore('typescript', 5);

        // --- Python Ecosystem ---
        if (await this.hasFile('**/*.py')) {
            addScore('python', 5);
        }
        if (await this.hasFile('**/requirements.txt') || await this.hasFile('**/pyproject.toml')) {
            addScore('python', 5);
            // Analyze requirements
            const reqContent = (await this.readFileContent('**/requirements.txt')) || (await this.readFileContent('**/pyproject.toml'));
            if (reqContent) {
                if (reqContent.includes('django')) addScore('django', 10);
                if (reqContent.includes('flask')) addScore('flask', 10);
                if (reqContent.includes('fastapi')) addScore('fastapi', 10);
                if (reqContent.includes('pandas')) addScore('pandas', 8);
                if (reqContent.includes('numpy')) addScore('numpy', 8);
            }
        }

        // --- Dart / Flutter ---
        if (await this.hasFile('**/pubspec.yaml')) {
            addScore('dart', 10);
            const pubContent = await this.readFileContent('**/pubspec.yaml');
            if (pubContent && pubContent.includes('flutter:')) {
                addScore('flutter', 15); // Higher confidence for Flutter
            }
        }

        // --- Go ---
        if (await this.hasFile('**/go.mod')) addScore('go', 10);

        // --- Rust ---
        if (await this.hasFile('**/Cargo.toml')) addScore('rust', 10);

        // --- Infrastructure ---
        if (await this.hasFile('**/Dockerfile') || await this.hasFile('**/docker-compose.yml')) addScore('docker', 10);
        if (await this.hasFile('**/*.tf') || await this.hasFile('**/*.hcl')) {
            addScore('terraform', 10);
            addScore('aws', 5); // Infer AWS often used with TF
            addScore('cloud', 5);
        }
        if (await this.hasFile('**/*.sql')) {
            addScore('sql', 10);
            addScore('database', 10);
        }
        if (await this.hasFile('**/firebase.json')) addScore('firebase', 15);

        // --- Git ---
        if (await this.hasFile('**/.git/**')) addScore('git', 5);

        return scores;
    }

    private calculateMatch(item: RegistryItem, techScores: Map<string, number>): WeightedMatch {
        let score = 0;
        const reasons: string[] = [];
        const lowerName = item.name.toLowerCase();
        const lowerDesc = item.description.toLowerCase();
        const tags = (item.tags || []).map(t => t.toLowerCase());

        techScores.forEach((techScore, tech) => {
            // Check if this tech is relevant to the item

            // 1. Direct Tag Match (Best)
            if (tags.includes(tech)) {
                // PENALTY: If the matched tag is a programming language (Runtime), 
                // but the item description suggests it's just WRITTEN in that language, not FOR that language.
                // We assume 'typescript', 'python', 'go', 'rust', 'node' are primarily Runtimes unless
                // the description explicitly focuses on them as a Subject.
                const isRuntime = ['typescript', 'javascript', 'python', 'go', 'rust', 'node', 'java', 'php'].includes(tech);

                if (isRuntime) {
                    // STRICT CHECK: Only recommend if it is explicitly a tool FOR that language.
                    // STRICT CHECK: Only recommend if it is explicitly a tool FOR that language.
                    // Use regex with word boundaries to prevent partial matches (e.g. 'cli' in 'client', 'climate')
                    const toolingRegex = /\b(debug|debugger|debugging|linter|linters|compiler|compilers|profiler|profilers|formatter|formatters|playground|introspector|language server|lsp|runtime|interpreter|cli)\b/i;
                    const isTooling = toolingRegex.test(lowerDesc) || toolingRegex.test(lowerName);

                    if (isTooling) {
                        score += techScore * 2.0;
                        reasons.push(`Tooling match: ${tech}`);
                    }
                } else {
                    // It's a Subject match (e.g. 'react', 'postgres', 'docker', 'aws')
                    score += techScore * 3.0;
                    reasons.push(`Subject match: ${tech}`);
                }
            }
            // 2. Name Match (Strong indicator of Subject)
            else if (lowerName.includes(tech)) {
                // Runtime check: Don't boost if it's just a runtime language in the name
                const isRuntime = ['typescript', 'javascript', 'python', 'go', 'rust', 'node', 'java', 'php'].includes(tech);
                if (!isRuntime) {
                    score += techScore * 2.0;
                    reasons.push(`Name match: ${tech}`);
                }
                // Runtimes in names are ignored (e.g., time-node-mcp shouldn't match just because of 'node')
            }
            // 3. Description Match
            else if (lowerDesc.includes(tech)) {
                // Same Runtime check for description matches
                const isRuntime = ['typescript', 'javascript', 'python', 'go', 'rust', 'node', 'java', 'php'].includes(tech);

                if (isRuntime) {
                    // Only count if it looks like the subject, not implementation
                    // Use regex with word boundaries to prevent partial matches
                    const toolingRegex = /\b(debug|debugger|debugging|linter|linters|compiler|compilers|profiler|profilers|formatter|formatters|playground|introspector|language server|lsp|runtime|interpreter|cli)\b/i;
                    if (toolingRegex.test(lowerDesc)) {
                        score += techScore * 1.5;
                        reasons.push(`Tooling desc match: ${tech}`);
                    }
                    // Otherwise 0
                } else {
                    // Subject match in description
                    // Context Check: "Written in X" vs "X Linter"
                    const contextRegex = new RegExp(`(written in|built with|based on)\\s+${tech}`, 'i');
                    if (contextRegex.test(lowerDesc)) {
                        score += 0.5; // Minimal boost
                    } else {
                        score += techScore * 0.8;
                    }
                }
            }
        });

        // Boost for "Local" or "Cloud" if generic tech triggers present
        // (Optional future refinement)

        return { item, score, reason: reasons };
    }

    private async hasFile(globPattern: string): Promise<boolean> {
        const files = await vscode.workspace.findFiles(globPattern, '**/node_modules/**', 1);
        return files.length > 0;
    }

    private async readFileContent(globPattern: string): Promise<string | null> {
        try {
            const files = await vscode.workspace.findFiles(globPattern, '**/node_modules/**', 1);
            if (files.length > 0) {
                const uint8Array = await vscode.workspace.fs.readFile(files[0]);
                return new TextDecoder().decode(uint8Array);
            }
        } catch (e) {
            console.error(`Error reading file for recommendation: ${globPattern}`, e);
        }
        return null;
    }
}
