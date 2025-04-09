import { McpServer } from "@modelcontextprotocol/sdk";
import { z } from "zod";

const server = new McpServer({
  name: "Demo for test",
  version: "1.0.0",
});

//Write the prompt for finding components in ant design

server.addPrompt("finding-components", { code: z.string() });
