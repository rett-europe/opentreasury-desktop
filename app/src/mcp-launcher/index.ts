import { connect } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

const token = process.env.OPENTREASURY_MCP_TOKEN;
if (!token) {
  console.error(
    'OPENTREASURY_MCP_TOKEN is required. Enable MCP in OpenTreasury Preferences and copy the token.',
  );
  process.exit(1);
}
const socketPath =
  process.env.OPENTREASURY_MCP_SOCKET ??
  (process.platform === 'win32'
    ? `\\\\.\\pipe\\opentreasury-mcp-${os.userInfo().username.replace(/[^A-Za-z0-9_.-]/g, '_')}`
    : path.join(os.homedir(), '.opentreasury-mcp.sock'));
const socket = connect(socketPath);
socket.once('connect', () => {
  socket.write(`${JSON.stringify({ token })}\n`);
  process.stdin.pipe(socket);
  let first = true;
  socket.on('data', (chunk) => {
    if (first) {
      first = false;
      if (chunk.toString('utf8').startsWith('{"error":"AUTH_FAILED"')) {
        console.error(
          'OpenTreasury rejected the MCP token. Copy the current token from Preferences.',
        );
        process.exit(3);
      }
    }
    process.stdout.write(chunk);
  });
});
socket.once('close', () => process.exit(0));
socket.once('error', (err) => {
  console.error(
    `Could not connect to OpenTreasury MCP server. Is the app running, unlocked, and MCP enabled? ${err.message}`,
  );
  process.exit(2);
});
