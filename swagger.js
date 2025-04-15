import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";

// Initialize MCP Server
const server = new McpServer(
  {
    name: "Swagger API Explorer",
    version: "1.0.0",
  },
  {
    capabilities: {
      logging: {},
    },
  }
);

// Cache for API specs
const apiSpecCache = new Map();

// Helper function to explore specific path
async function exploreSpecificPath(apiSpec, path, method, isOpenAPI3) {
  const pathInfo = apiSpec.paths[path];
  if (!pathInfo) {
    return {
      content: [
        {
          type: "text",
          text: `Path "${path}" not found in the API specification.`,
        },
      ],
    };
  }

  if (method) {
    return exploreSpecificMethod(pathInfo, path, method, isOpenAPI3);
  }

  return exploreAllMethods(pathInfo, path);
}

// Helper function to explore specific method
function exploreSpecificMethod(pathInfo, path, method, isOpenAPI3) {
  const methodInfo = pathInfo[method.toLowerCase()];
  if (!methodInfo) {
    return {
      content: [
        {
          type: "text",
          text: `Method "${method}" not found for path "${path}".`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: formatEndpointDetails(path, method, methodInfo, isOpenAPI3),
      },
    ],
  };
}

// Helper function to explore all methods for a path
function exploreAllMethods(pathInfo, path) {
  const methods = Object.keys(pathInfo).filter((key) => !key.startsWith("x-"));
  const pathDetails = methods
    .map((m) => {
      const endpoint = pathInfo[m];
      return `- ${m.toUpperCase()}: ${endpoint.summary || "No summary"}\n  ${
        endpoint.description || "No description"
      }`;
    })
    .join("\n\n");

  return {
    content: [
      {
        type: "text",
        text: `# Path: ${path}\n\n${pathDetails}`,
      },
    ],
  };
}

// Helper function to get API overview
function getApiOverview(apiSpec) {
  const pathsOverview = Object.keys(apiSpec.paths)
    .map((p) => {
      const methods = Object.keys(apiSpec.paths[p]).filter(
        (key) => !key.startsWith("x-")
      );
      return `- ${p}\n  Available methods: ${methods
        .map((m) => m.toUpperCase())
        .join(", ")}`;
    })
    .join("\n\n");

  return {
    content: [
      {
        type: "text",
        text: `# API Overview\n\nTitle: ${apiSpec.info.title}\nVersion: ${
          apiSpec.info.version
        }\nDescription: ${
          apiSpec.info.description || "No description"
        }\n\n## Available Paths:\n\n${pathsOverview}`,
      },
    ],
  };
}

server.tool(
  "explore-swagger-api",
  {
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to the Swagger/OpenAPI specification",
        },
        path: {
          type: "string",
          description: "Optional API path to explore (e.g., /pets)",
        },
        method: {
          type: "string",
          description: "Optional HTTP method to filter (e.g., GET, POST)",
        },
      },
      required: ["url"],
    },
  },
  async (params) => {
    try {
      const { url, path, method } = params;

      // Fetch API spec (use cache if available)
      let apiSpec = apiSpecCache.get(url);
      if (!apiSpec) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch API spec: ${response.statusText}`);
        }
        apiSpec = await response.json();
        apiSpecCache.set(url, apiSpec);
      }

      // Process based on OpenAPI version
      const version = apiSpec.openapi || apiSpec.swagger;
      const isOpenAPI3 = version && version.startsWith("3");

      // Handle exploring specific path/method or provide overview
      return path
        ? await exploreSpecificPath(apiSpec, path, method, isOpenAPI3)
        : getApiOverview(apiSpec);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error exploring API: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Tool to test API endpoints
server.tool(
  "test-api-endpoint",
  {
    parameters: {
      url: {
        type: "string",
        description: "Base URL of the API",
      },
      path: {
        type: "string",
        description: "API path to test (e.g., /pets)",
      },
      method: {
        type: "string",
        description: "HTTP method (e.g., GET, POST)",
      },
      headers: {
        type: "object",
        description: "Request headers as key-value pairs",
        required: false,
      },
      parameters: {
        type: "object",
        description: "Query parameters as key-value pairs",
        required: false,
      },
      body: {
        type: "object",
        description: "Request body (for POST, PUT, etc.)",
        required: false,
      },
    },
  },
  async (params) => {
    try {
      const { url, path, method, headers = {}, parameters = {}, body } = params;

      // Build the request URL with query parameters
      let requestUrl = `${url}${path}`;
      if (Object.keys(parameters).length > 0) {
        const queryString = Object.entries(parameters)
          .map(
            ([key, value]) =>
              `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
          )
          .join("&");
        requestUrl += `?${queryString}`;
      }

      // Prepare request options
      const requestOptions = {
        method: method.toUpperCase(),
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      };

      // Add body if needed
      if (body && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
        requestOptions.body = JSON.stringify(body);
      }

      // Make the request
      const response = await fetch(requestUrl, requestOptions);
      const responseData = await (async () => {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return await response.json();
        }
        return await response.text();
      })();

      return {
        content: [
          {
            type: "text",
            text: `# API Test Results\n\n## Request\n- URL: ${requestUrl}\n- Method: ${method.toUpperCase()}\n- Headers: ${JSON.stringify(
              headers,
              null,
              2
            )}\n${
              body ? `- Body: ${JSON.stringify(body, null, 2)}` : ""
            }\n\n## Response\n- Status: ${response.status} ${
              response.statusText
            }\n- Headers: ${JSON.stringify(
              Object.fromEntries([...response.headers]),
              null,
              2
            )}\n- Body: ${
              typeof responseData === "object"
                ? JSON.stringify(responseData, null, 2)
                : responseData
            }`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error testing API endpoint: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Tool to generate client code for API endpoints
server.tool(
  "generate-client-code",
  {
    parameters: {
      url: {
        type: "string",
        description: "URL to the Swagger/OpenAPI specification",
      },
      path: {
        type: "string",
        description: "API path to generate code for (e.g., /pets)",
      },
      method: {
        type: "string",
        description: "HTTP method (e.g., GET, POST)",
      },
      language: {
        type: "string",
        description: "Programming language (js, python, curl)",
        enum: ["js", "python", "curl"],
      },
    },
  },
  async (params) => {
    try {
      const { url, path, method, language } = params;

      // Fetch API spec (use cache if available)
      let apiSpec;
      if (apiSpecCache.has(url)) {
        apiSpec = apiSpecCache.get(url);
      } else {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch API spec: ${response.statusText}`);
        }
        apiSpec = await response.json();
        apiSpecCache.set(url, apiSpec);
      }

      // Get the path info
      const pathInfo = apiSpec.paths[path];
      if (!pathInfo) {
        throw new Error(`Path "${path}" not found in the API specification.`);
      }

      const methodInfo = pathInfo[method.toLowerCase()];
      if (!methodInfo) {
        throw new Error(`Method "${method}" not found for path "${path}".`);
      }

      // Generate code based on language
      const baseUrl =
        apiSpec.servers && apiSpec.servers[0]
          ? apiSpec.servers[0].url
          : "https://api.example.com";
      const code = generateClientCode(
        baseUrl,
        path,
        method,
        methodInfo,
        language
      );

      return {
        content: [
          {
            type: "text",
            text: `# Generated Client Code (${language})\n\n\`\`\`${
              language === "js" ? "javascript" : language
            }\n${code}\n\`\`\`\n\n## Endpoint Information\n- Path: ${path}\n- Method: ${method.toUpperCase()}\n- Summary: ${
              methodInfo.summary || "No summary"
            }\n- Description: ${methodInfo.description || "No description"}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error generating client code: ${error.message}`,
          },
        ],
      };
    }
  }
);

// Helper function to format endpoint details
function formatEndpointDetails(path, method, endpointInfo, isOpenAPI3) {
  const details = [];

  details.push(`# ${method.toUpperCase()} ${path}`);
  details.push(
    `\n## Summary\n${endpointInfo.summary || "No summary provided"}`
  );
  details.push(
    `\n## Description\n${endpointInfo.description || "No description provided"}`
  );

  // Parameters
  if (endpointInfo.parameters && endpointInfo.parameters.length > 0) {
    details.push("\n## Parameters");
    endpointInfo.parameters.forEach((param) => {
      details.push(
        `- **${param.name}** (${param.in}, ${
          param.required ? "required" : "optional"
        }): ${param.description || "No description"}`
      );
      if (param.schema) {
        details.push(`  Type: ${param.schema.type || "Not specified"}`);
      }
    });
  }

  // Request body (OpenAPI 3)
  if (isOpenAPI3 && endpointInfo.requestBody) {
    details.push("\n## Request Body");
    const content = endpointInfo.requestBody.content;

    if (content) {
      Object.keys(content).forEach((mediaType) => {
        details.push(`- Media Type: ${mediaType}`);
        if (content[mediaType].schema) {
          details.push(
            `  Schema: ${JSON.stringify(content[mediaType].schema, null, 2)}`
          );
        }
      });
    }
  }

  // Responses
  details.push("\n## Responses");
  Object.keys(endpointInfo.responses).forEach((statusCode) => {
    const response = endpointInfo.responses[statusCode];
    details.push(
      `- **${statusCode}**: ${response.description || "No description"}`
    );

    if (isOpenAPI3 && response.content) {
      Object.keys(response.content).forEach((mediaType) => {
        details.push(`  Media Type: ${mediaType}`);
        if (response.content[mediaType].schema) {
          details.push(
            `  Schema: ${JSON.stringify(
              response.content[mediaType].schema,
              null,
              2
            )}`
          );
        }
      });
    } else if (!isOpenAPI3 && response.schema) {
      details.push(`  Schema: ${JSON.stringify(response.schema, null, 2)}`);
    }
  });

  return details.join("\n");
}

// Helper function to generate client code
function generateClientCode(baseUrl, path, method, endpointInfo, language) {
  const fullUrl = `${baseUrl}${path}`;
  let code = "";

  switch (language) {
    case "js":
      code = `// JavaScript client using fetch API
async function callApi() {
  try {
    const response = await fetch("${fullUrl}", {
      method: "${method.toUpperCase()}",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      }${
        method.toLowerCase() !== "get"
          ? ",\n      body: JSON.stringify({\n        // Request payload here\n      })"
          : ""
      }
    });
    
    if (!response.ok) {
      throw new Error(\`HTTP error! Status: \${response.status}\`);
    }
    
    const data = await response.json();
    console.log("API Response:", data);
    return data;
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
}

// Call the API
callApi().then(result => {
  // Process the result
}).catch(error => {
  // Handle errors
});`;
      break;

    case "python":
      code = `# Python client using requests
import requests
import json

def call_api():
    url = "${fullUrl}"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    try:${
      method.toLowerCase() !== "get"
        ? `
        payload = {
            # Request payload here
        }
        response = requests.${method.toLowerCase()}(url, headers=headers, json=payload)`
        : `
        response = requests.${method.toLowerCase()}(url, headers=headers)`
    }
        response.raise_for_status()  # Raise exception for 4XX/5XX status codes
        
        data = response.json()
        print("API Response:", data)
        return data
    except requests.exceptions.RequestException as e:
        print("API Error:", e)
        raise

# Call the API
try:
    result = call_api()
    # Process the result
except Exception as e:
    # Handle errors
    pass`;
      break;

    case "curl":
      code = `# cURL command
curl -X ${method.toUpperCase()} "${fullUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json"${
    method.toLowerCase() !== "get"
      ? " \\\n  -d '{\n    // Request payload here\n  }'"
      : ""
  }`;
      break;

    default:
      code = "Language not supported";
  }

  return code;
}

// Start the server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
