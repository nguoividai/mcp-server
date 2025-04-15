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

// Add an read markdown tool
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

      // Security check - ensure file is within working directory
      if (!absolutePath.startsWith(process.cwd())) {
        throw new Error(
          "Access denied: Cannot read files outside working directory"
        );
      }

      // Validate file extension
      if (!absolutePath.toLowerCase().endsWith(".md")) {
        throw new Error("Invalid file: Only markdown (.md) files are allowed");
      }

      // Check if file exists
      await fs.access(absolutePath);

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

server.tool(
  "read-any-file",
  {
    parameters: {
      filePath: {
        type: "string",
        description: "Path to any file to read",
      },
      encoding: {
        type: "string",
        description: "File encoding (utf-8, base64, or null for binary)",
        optional: true,
        enum: ["utf-8", "base64", "binary"],
      },
    },
  },
  async (params) => {
    try {
      const { filePath, encoding = "utf-8" } = params;
      const absolutePath = path.resolve(filePath);

      // Basic security check
      if (!absolutePath.startsWith(process.cwd())) {
        throw new Error(
          "Access denied: Cannot read files outside working directory"
        );
      }

      const buffer = await fs.readFile(absolutePath);
      let content;

      switch (encoding) {
        case "base64":
          content = buffer.toString("base64");
          break;
        case "binary":
          content = Array.from(buffer);
          break;
        default:
          content = buffer.toString("utf-8");
      }

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

server.tool(
  "read-directory",
  {
    parameters: {
      dirPath: {
        type: "string",
        description: "Path to the directory to read",
      },
    },
  },
  async (params) => {
    try {
      const { dirPath } = params;
      const absolutePath = path.resolve(dirPath);

      if (!absolutePath.startsWith(process.cwd())) {
        throw new Error(
          "Access denied: Cannot read directories outside working directory"
        );
      }

      const files = await fs.readdir(absolutePath, { withFileTypes: true });
      const fileList = files.map((file) => ({
        name: file.name,
        isDirectory: file.isDirectory(),
        path: path.join(dirPath, file.name),
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(fileList, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error reading directory: ${error.message}`,
          },
        ],
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
