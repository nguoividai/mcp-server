import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod"; // Import zod for validation

const server = new McpServer({
  name: "example-server",
  version: "1.0.0",
});

// ... set up server resources, tools, and prompts ...

const app = express();

app.use(express.json()); // Middleware to parse JSON bodies

// to support multiple simultaneous connections we have a lookup object from
// sessionId to transport
const transports = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports[transport.sessionId];
  });
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No transport found for sessionId");
  }
});

// New endpoint to query cryptocurrency prices
app.post("/query-price", async (req, res) => {
  const priceQuerySchema = z.object({
    currency: z.string().min(1, "Currency is required"),
  });

  try {
    const { currency } = priceQuerySchema.parse(req.body);

    // Here you would implement the logic to fetch the price of the cryptocurrency
    // For demonstration, let's assume we have a function getCryptoPrice that fetches the price
    const price = await getCryptoPrice(currency); // Implement this function

    res.json({ currency, price });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).send("Internal Server Error");
    }
  }
});

app.listen(3001, () => {
  console.log("Server is running on http://localhost:3001");
});

// Example function to fetch cryptocurrency price (you need to implement this)
async function getCryptoPrice(currency) {
  // Implement your logic to fetch the price from a crypto API
  return 100; // Placeholder value
}
