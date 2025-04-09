import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "AIAssistant",
  version: "1.0.0",
});

server.resource(
  "ai-response",
  new ResourceTemplate("ai://{query}", { list: undefined }),
  async (uri, { query }) => {
    const aiResponse = `AI Response to: ${query}`; // Đây có thể là nơi bạn gọi API AI thực tế
    return {
      contents: [
        {
          uri: uri.href,
          text: aiResponse,
        },
      ],
    };
  }
);

server.tool("ai-assist", { query: z.string() }, async ({ query }) => {
  return {
    content: [{ type: "text", text: `AI Suggestion: ${query}` }],
  };
});

server.prompt("ai-assist", { query: z.string() }, ({ query }) => {
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Process this query: ${query}`,
        },
      },
    ],
  };
});

const transport = new StdioServerTransport();

await server.connect(transport);
