import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "fs/promises";
import path from "path";

const server = new McpServer(
  {
    name: "Hacker News",
    version: "1.0.0",
  },
  {
    capabilities: {
      logging: {},
    },
  }
);

// Existing tool
server.tool("get-crypto-data", {}, async () => {
  // ... existing code ...
});

// New tool to read markdown files
server.tool(
  "read-markdown",
  {
    parameters: {
      filePath: {
        type: "string",
        description: "Path to the markdown file",
      },
    },
  },
  async (params) => {
    try {
      const { filePath } = params;
      const absolutePath = path.resolve(filePath);
      const content = await fs.readFile(absolutePath, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error reading file: ${error.message}`,
          },
        ],
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
