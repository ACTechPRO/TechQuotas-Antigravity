/**
 * TechQuotas Antigravity - MCP Type Definitions
 * Types for Model Context Protocol integration
 */

export interface MCPServerConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
    disabled?: boolean; // Custom field to track enabled/disabled state without deleting config
}

export interface MCPServersCollection {
    [name: string]: MCPServerConfig;
}

export interface MCPConfig {
    mcpServers: MCPServersCollection;
}

export enum MCPServerStatus {
    Running = 'running',
    Stopped = 'stopped',
    Error = 'error',
    Disabled = 'disabled',
    Installing = 'installing' // Transient state for UI
}

export interface MCPServerInfo {
    id: string;
    name: string;
    config: MCPServerConfig;
    status: MCPServerStatus;
    error?: string;
}

// Marketplace / Registry Types

export interface RegistryItem {
    name: string;
    description: string;
    url: string; // GitHub URL
    tags?: string[];
    author?: string;
}

export interface RegistryCategory {
    name: string;
    items: RegistryItem[];
}

export type RegistryData = RegistryCategory[];

// Events

export interface MCPConfigChangeEvent {
    servers: MCPServersCollection;
    path: string;
}
