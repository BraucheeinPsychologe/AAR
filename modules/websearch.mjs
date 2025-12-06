import { GoogleGenAI } from "@google/genai";
import OpenAI from 'openai';
import path from "path";
import { fileURLToPath } from "url";
import { loadEnvFile } from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvFile(path.join(__dirname, "..", ".ENV"));


// Initialize services
const geminiAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const groundingTool = {
  googleSearch: {},
};

const geminiConfig = {
  tools: [groundingTool],
};

export default {
  id: "websearch",
  name: "Web Search Module",
  capabilities: ["READ"],

  commands: {
    search: {
      description: "Search the web for information using available search service",
      handler: async (query) => {
        if (!query) {
          return { error: "Search query is required" };
        }

        const defaultService = process.env.DEFAULT_LLM_SERVICE || "openai";
        
        try {
          if (defaultService === "gemini") {
            return await searchWithGemini(query);
          } else if (defaultService === "openai") {
            return await searchWithOpenAI(query);
          } else {
            return { error: `Unsupported LLM service: ${defaultService}. Use 'gemini' or 'openai'.` };
          }
        } catch (error) {
          console.error("[WEBSEARCH] Search failed:", error);
          return { 
            error: `Web search failed: ${error.message}`,
            details: error.toString()
          };
        }
      }
    }
  }
};

// Gemini search implementation
async function searchWithGemini(query) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return { 
      error: "Gemini API key is not configured. Please set GEMINI_API_KEY in .ENV file." 
    };
  }

  const model = process.env.GEMINI_MAIN_MODEL || "gemini-2.0-flash-exp";
  
  const response = await geminiAI.models.generateContent({
    model: model,
    contents: `Search for: ${query}`,
    config: geminiConfig,
  });

  return {
    success: true,
    service: "gemini",
    query: query,
    result: response.text,
    timestamp: new Date().toISOString()
  };
}

// OpenAI search implementation
async function searchWithOpenAI(query) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    return { 
      error: "OpenAI API key is not configured. Please set OPENAI_API_KEY in .ENV file." 
    };
  }

  const model = process.env.OPENAI_MAIN_MODEL || "gpt-4o";
  
  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant with access to real-time web search capabilities. When asked to search for information, use your browsing capabilities to find current and accurate information."
        },
        {
          role: "user",
          content: `Please search for information about: ${query}. Provide a comprehensive and current answer based on your web search capabilities.`
        }
      ]
    });

    const searchResult = response.choices[0].message.content;

    return {
      success: true,
      service: "openai",
      query: query,
      result: searchResult,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    // Fallback if model doesn't support browsing
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use a model that should work
      messages: [
        {
          role: "user",
          content: `Search for information about: ${query}. Note: I don't have access to real-time web search, so please provide information based on my training data.`
        }
      ]
    });

    const searchResult = response.choices[0].message.content;

    return {
      success: true,
      service: "openai",
      query: query,
      result: searchResult + "\n\n[Note: This information is based on training data, not real-time web search]",
      timestamp: new Date().toISOString()
    };
  }
}