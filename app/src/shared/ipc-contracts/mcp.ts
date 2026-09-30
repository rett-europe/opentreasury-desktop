import { z } from 'zod';
export const IPC_MCP_GET_STATUS = 'mcp:getStatus';
export const IPC_MCP_SET_ENABLED = 'mcp:setEnabled';
export const IPC_MCP_SET_OPTIONS = 'mcp:setOptions';
export const IPC_MCP_REGENERATE_TOKEN = 'mcp:regenerateToken';
export const mcpStatusResponseSchema = z.object({
  enabled: z.boolean(),
  allowWrites: z.boolean(),
  allowDelete: z.boolean(),
  running: z.boolean(),
  token: z.string().nullable(),
  launcherPath: z.string(),
  configSnippet: z.string(),
});
export const mcpSetEnabledRequestSchema = z.object({ enabled: z.boolean() });
export const mcpSetOptionsRequestSchema = z.object({
  allowWrites: z.boolean().optional(),
  allowDelete: z.boolean().optional(),
});
export type McpStatusResponse = z.infer<typeof mcpStatusResponseSchema>;
export type McpSetEnabledRequest = z.infer<typeof mcpSetEnabledRequestSchema>;
export type McpSetOptionsRequest = z.infer<typeof mcpSetOptionsRequestSchema>;
