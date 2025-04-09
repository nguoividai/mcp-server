// Import required modules
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs";
import path from "path";

// Configuration for the MCP server
const config = {
  port: 3000,
  apiVersion: "1.8",
  // Add any additional configuration options here
};

// Create the context manager to handle code context
class ContextManager {
  constructor() {
    this.fileCache = new Map(); // Cache for file contents
    this.projectStructure = null; // Project structure representation
  }

  // Scan project directory to build context
  async scanProject(projectRoot) {
    try {
      console.log(`Scanning project directory: ${projectRoot}`);
      this.projectStructure = await this.buildProjectStructure(projectRoot);
      return this.projectStructure;
    } catch (error) {
      console.error("Error scanning project:", error);
      throw error;
    }
  }

  // Build a representation of the project structure
  async buildProjectStructure(dir, relativePath = "") {
    const result = {
      type: "directory",
      name: path.basename(dir),
      path: relativePath,
      children: [],
    };

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      const entryRelativePath = path.join(relativePath, entry.name);

      // Skip node_modules, .git, and other non-code directories
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name.startsWith(".") ||
        entry.name === "dist" ||
        entry.name === "build"
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        const subdirStructure = await this.buildProjectStructure(
          entryPath,
          entryRelativePath
        );
        result.children.push(subdirStructure);
      } else {
        // Only include relevant code files
        const ext = path.extname(entry.name).toLowerCase();
        if (
          [".js", ".jsx", ".ts", ".tsx", ".json", ".html", ".css"].includes(ext)
        ) {
          result.children.push({
            type: "file",
            name: entry.name,
            path: entryRelativePath,
            extension: ext,
          });
        }
      }
    }

    return result;
  }

  // Read file contents and cache them
  async getFileContent(filePath) {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath);
    }

    try {
      const content = fs.readFileSync(filePath, "utf8");
      this.fileCache.set(filePath, content);
      return content;
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  }

  // Get context for a specific file
  async getFileContext(filePath) {
    const content = await this.getFileContent(filePath);
    if (!content) return null;

    return {
      path: filePath,
      content,
      extension: path.extname(filePath),
      lastModified: fs.statSync(filePath).mtime,
    };
  }

  // Generate context for the entire project or a subsection
  async generateProjectContext(options = {}) {
    const {
      maxFiles = 10,
      maxDepth = 3,
      includePatterns = [],
      excludePatterns = [],
    } = options;

    if (!this.projectStructure) {
      throw new Error("Project has not been scanned yet");
    }

    const relevantFiles = this.findRelevantFiles(this.projectStructure, {
      maxFiles,
      maxDepth,
      includePatterns,
      excludePatterns,
      currentDepth: 0,
    });

    const fileContexts = await Promise.all(
      relevantFiles.map((file) => this.getFileContext(file.absolutePath))
    );

    return {
      projectStructure: this.projectStructure,
      relevantFiles: fileContexts.filter((context) => context !== null),
    };
  }

  // Find relevant files based on patterns and limits
  findRelevantFiles(node, options) {
    const {
      maxFiles,
      maxDepth,
      includePatterns,
      excludePatterns,
      currentDepth,
    } = options;
    let results = [];

    if (currentDepth > maxDepth) return results;

    if (node.type === "directory" && node.children) {
      for (const child of node.children) {
        if (results.length >= maxFiles) break;

        const childResults = this.findRelevantFiles(child, {
          ...options,
          currentDepth: currentDepth + 1,
        });

        results = [...results, ...childResults].slice(0, maxFiles);
      }
    } else if (node.type === "file") {
      const matchesInclude =
        includePatterns.length === 0 ||
        includePatterns.some((pattern) =>
          this.matchesPattern(node.path, pattern)
        );

      const matchesExclude = excludePatterns.some((pattern) =>
        this.matchesPattern(node.path, pattern)
      );

      if (matchesInclude && !matchesExclude) {
        results.push({
          path: node.path,
          absolutePath: path.resolve(node.path),
        });
      }
    }

    return results;
  }

  // Check if a path matches a pattern (simple implementation)
  matchesPattern(filePath, pattern) {
    if (pattern instanceof RegExp) {
      return pattern.test(filePath);
    } else if (typeof pattern === "string") {
      // Simple matching - can be enhanced with a library like minimatch
      return filePath.includes(pattern);
    }
    return false;
  }
}

// Function to enhance a prompt with context
function enhancePromptWithContext(prompt, context) {
  // Create a context block that describes the project structure
  let contextBlock = "PROJECT CONTEXT:\n\n";

  // Add project structure overview
  contextBlock += "Project Structure:\n";
  contextBlock += formatProjectStructure(context.projectStructure);
  contextBlock += "\n\n";

  // Add relevant file contents
  contextBlock += "Relevant Files:\n\n";

  context.relevantFiles.forEach((file) => {
    contextBlock += `--- FILE: ${file.path} ---\n`;
    contextBlock += file.content;
    contextBlock += "\n\n";
  });

  // Append context to the prompt
  return `${contextBlock}\n\nUSER QUERY:\n${prompt}`;
}

// Format project structure as a tree for easier reading
function formatProjectStructure(node, depth = 0) {
  const indent = "  ".repeat(depth);
  let result = "";

  if (node.type === "directory") {
    result += `${indent}📁 ${node.name}/\n`;
    if (node.children) {
      node.children.forEach((child) => {
        result += formatProjectStructure(child, depth + 1);
      });
    }
  } else {
    result += `${indent}📄 ${node.name}\n`;
  }

  return result;
}

// Create and start the MCP server
async function startMcpServer() {
  // Initialize the context manager
  const contextManager = new ContextManager();

  // Create the MCP server
  const server = new McpServer(config);

  // Register the context enhancement tool
  server.tool({
    name: "add-context",
    description:
      "Adds project context to the prompt for better code understanding",
    parameters: {
      projectRoot: {
        type: "string",
        description: "Path to the project root directory",
        default: process.cwd(),
      },
      maxFiles: {
        type: "number",
        description: "Maximum number of files to include in context",
        default: 10,
      },
      maxDepth: {
        type: "number",
        description: "Maximum directory depth to scan",
        default: 3,
      },
      includePatterns: {
        type: "array",
        description: "Patterns of files to include",
        default: [],
      },
      excludePatterns: {
        type: "array",
        description: "Patterns of files to exclude",
        default: [],
      },
    },
    handler: async (params, request) => {
      try {
        const projectRoot = params.projectRoot || process.cwd();

        // Scan the project if it hasn't been scanned yet
        if (!contextManager.projectStructure) {
          await contextManager.scanProject(projectRoot);
        }

        // Generate context for the project
        const context = await contextManager.generateProjectContext({
          maxFiles: params.maxFiles || 10,
          maxDepth: params.maxDepth || 3,
          includePatterns: params.includePatterns || [],
          excludePatterns: params.excludePatterns || [],
        });

        // Enhance the prompt with context
        const enhancedPrompt = enhancePromptWithContext(
          request.body.prompt,
          context
        );

        // Return the enhanced prompt and metadata
        return {
          enhancedPrompt,
          metadata: {
            contextAdded: true,
            filesIncluded: context.relevantFiles.length,
            contextSize: JSON.stringify(context).length,
          },
        };
      } catch (error) {
        console.error("Error in add-context tool:", error);
        throw new Error(`Failed to add context: ${error.message}`);
      }
    },
  });

  // Register the context resource for direct access to project context
  server.resource({
    path: "/context",
    methods: ["GET"],
    handler: async (req, res) => {
      try {
        const projectRoot = req.query.projectRoot || process.cwd();

        // Scan the project if it hasn't been scanned already
        if (!contextManager.projectStructure) {
          await contextManager.scanProject(projectRoot);
        }

        // Get context options from request
        const contextOptions = {
          maxFiles: parseInt(req.query.maxFiles || "10"),
          maxDepth: parseInt(req.query.maxDepth || "3"),
          includePatterns: req.query.includePatterns
            ? JSON.parse(req.query.includePatterns)
            : [],
          excludePatterns: req.query.excludePatterns
            ? JSON.parse(req.query.excludePatterns)
            : [],
        };

        // Generate context for the project
        const context = await contextManager.generateProjectContext(
          contextOptions
        );

        // Return the context as JSON
        res.json({
          projectStructure: context.projectStructure,
          relevantFiles: context.relevantFiles.map((file) => ({
            path: file.path,
            extension: file.extension,
            lastModified: file.lastModified,
            // Don't include the full content in the response to avoid large payloads
            contentPreview:
              file.content.substring(0, 200) +
              (file.content.length > 200 ? "..." : ""),
          })),
        });
      } catch (error) {
        console.error("Error in context resource:", error);
        res.status(500).json({
          error: "Failed to get context",
          message: error.message,
        });
      }
    },
  });

  // Register interceptor to handle addContext parameter in generate requests
  server.resource("/v1.8/generate", async (req, res, next) => {
    if (req.query.addContext === "true" && req.body?.prompt) {
      try {
        // Use the add-context tool internally
        const result = await server.executeTool(
          "add-context",
          {
            projectRoot: req.query.projectRoot || process.cwd(),
            maxFiles: parseInt(req.query.maxFiles || "10"),
            maxDepth: parseInt(req.query.maxDepth || "3"),
            includePatterns: req.query.includePatterns
              ? JSON.parse(req.query.includePatterns)
              : [],
            excludePatterns: req.query.excludePatterns
              ? JSON.parse(req.query.excludePatterns)
              : [],
          },
          { body: req.body }
        );

        // Update the request with the enhanced prompt
        req.body.prompt = result.enhancedPrompt;
        req.body.metadata = {
          ...(req.body.metadata || {}),
          ...result.metadata,
        };
      } catch (error) {
        console.error("Error adding context in interceptor:", error);
        // Continue with the original prompt if context enhancement fails
      }
    }
    next();
  });

  // Start the server
  await server.start();
  console.log(`MCP server started on port ${config.port}`);

  return server;
}

startMcpServer()
  .then((server) => {
    console.log("MCP Context Server is running");

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("Shutting down MCP server...");
      await server.stop();
      process.exit(0);
    });
  })
  .catch((error) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  });
