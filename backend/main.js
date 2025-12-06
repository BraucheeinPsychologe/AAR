import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { loadEnvFile } from "node:process";
import ollama from 'ollama';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import {markdown} from 'markdown';

// ==================== SETUP ====================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modulesPath = path.join(__dirname, "..", "modules");
const FrontendPath = path.join(__dirname, "..", "frontend");

loadEnvFile(path.join(__dirname, "..", ".ENV"));

const logging = process.argv.slice(2) || "default";
const port = process.env.PORT || 3000;
const AGENT_LLM_Model = process.env.DEFAULT_AGENT_LLM;
const DEFAULT_LLM_SERVICE = process.env.DEFAULT_LLM_SERVICE || "openai"; // openai, gemini, ollama
let modules = [];

// ==================== CONFIGURATION ====================
const SystemLLMPrompt = `You are an AI agent responsible for executing the user's requested tasks.  
You have access to several external modules that allow you to retrieve metadata and control devices or services.

DIRECT COMMAND EXECUTION:
Users can execute module commands directly by typing: /run module <module_name> <module_function>
This will execute the command immediately without AI intervention and return the raw result.

IMPORTANT: When users ask about available modules, functions, or capabilities, you MUST FIRST run:
  /run module list listAllModules

This will show you all available modules, their commands, and capabilities.

To execute a module, use the exact syntax:
  /run module <module_name> <module_function>

YOU HAVE TO USE A SLASH /, else a Command will not be recognized!

Available module types include:
- list: For listing modules and their information (auto-approved)
- time: For getting current time and date
- system: For system information
- crypto: For cryptographic operations
- math: For mathematical calculations
- network: For network operations
- string: For string manipulation
- file: For file operations
- websearch: For searching the web using Google Search 
- And potentially others

MODULE APPROVAL PROCESS:
- list module: Auto-approved (no user popup)
- All other modules: Require user approval via popup
- Direct commands: Execute immediately without approval

CRITICAL RULES:
1. When users ask "what modules", "what functions", "what can you do", etc. - IMMEDIATELY respond with EXACTLY: /run module list listAllModules
2. When users ask for time, date, system info, etc. - FIRST respond with: /run module list listAllModules, then after result, use appropriate module
3. ALWAYS use the EXACT syntax: /run module <module_name> <module_function> (with forward slash, no parentheses)
4. Do NOT explain what you're going to do - just output the module command directly
5. Wait for module execution result before responding to user
6. Simple operations (string reversal, basic math) can be done by you directly
7. After executing a module, provide a complete response to the user. Only execute another module if the result is insufficient to answer the user's question

Examples:
- User: "What modules are available?" → You respond with exactly: /run module list listAllModules
- User: "What time is it?" → You respond with: /run module list listAllModules then after result: /run module time getTime
- User: "What's my device ID?" → You respond with: /run module list listAllModules then after result: /run module system getDeviceId
- User: "/run module time getTime" → Direct execution, immediate result
- User: "Search for something → /run module websearch search "something"

IMPORTANT: Always use forward slash /run, not (run) or any other format!`;

// ==================== AI SERVICES ====================
class AIService {
  constructor() {
    this.defaultService = DEFAULT_LLM_SERVICE;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.ollama = ollama;
  }

  async getResponse(prompt, systemPrompt, moduleOutput = null, history = []) {
    if (!prompt) throw new Error('Prompt is required');

    switch (this.defaultService) {
      case 'openai':
        return await this.getOpenAIResponse(prompt, systemPrompt, moduleOutput, history);
      case 'gemini':
        return await this.getGeminiResponse(prompt, systemPrompt, moduleOutput, history);
      case 'ollama':
        return await this.getOllamaResponse(prompt, systemPrompt, moduleOutput, history);
      default:
        return `Error: Unknown LLM service "${this.defaultService}". Available: openai, gemini, ollama`;
    }
  }

  async getOpenAIResponse(prompt, systemPrompt, moduleOutput = null, history = []) {
    // Check if OpenAI API key is valid
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      return "Error: OpenAI API key is not configured. Please set a valid OPENAI_API_KEY in .ENV file.";
    }

    let messages = [
      { role: "system", content: systemPrompt }
    ];

    // Add chat history (last 10 messages to avoid context limit)
    if (history.length > 0) {
      const recentHistory = history.slice(-10);
      messages.push(...recentHistory);
    }

    messages.push({ role: "user", content: prompt });

    // Add module output if provided
    if (moduleOutput) {
      messages.push({ 
        role: "system", 
        content: `Module execution result: ${JSON.stringify(moduleOutput)}` 
      });
      messages.push({ 
        role: "user", 
        content: "Please respond to the user with the module execution result." 
      });
    }

    try {
      const model = process.env.OPENAI_MAIN_MODEL || "gpt-4o-mini";
      const completion = await this.openai.chat.completions.create({
        model,
        messages
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error("[ERROR] OpenAI API call failed:", error.message);
      return `Error: OpenAI API call failed - ${error.message}. Please check your API key configuration.`;
    }
  }

  async getGeminiResponse(prompt, systemPrompt, moduleOutput = null, history = []) {
    // Check if Gemini API key is valid
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return "Error: Gemini API key is not configured. Please set a valid GEMINI_API_KEY in .ENV file.";
    }

    try {
      let fullPrompt = systemPrompt;
      
      // Add chat history (last 10 messages)
      if (history.length > 0) {
        const recentHistory = history.slice(-10);
        fullPrompt += "\n\nChat History:\n" + recentHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      }
      
      fullPrompt += `\n\nUser: ${prompt}`;
      
      // Add module output if provided
      if (moduleOutput) {
        fullPrompt += `\n\nModule execution result: ${JSON.stringify(moduleOutput)}\n\nPlease respond to the user with the module execution result.`;
      }

      const model = process.env.GEMINI_MAIN_MODEL || "gemini-2.0-flash-exp";
      const result = await this.gemini.models.generateContent({
        model,
        contents: fullPrompt
      });
      
      return result.text;
    } catch (error) {
      console.error("[ERROR] Gemini API call failed:", error.message);
      return `Error: Gemini API call failed - ${error.message}. Please check your API key configuration.`;
    }
  }

  async getOllamaResponse(prompt, systemPrompt, moduleOutput = null, history = []) {
    try {
      let fullPrompt = systemPrompt;
      
      // Add chat history (last 10 messages)
      if (history.length > 0) {
        const recentHistory = history.slice(-10);
        fullPrompt += "\n\nChat History:\n" + recentHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      }
      
      fullPrompt += `\n\nUser: ${prompt}`;
      
      // Add module output if provided
      if (moduleOutput) {
        fullPrompt += `\n\nModule execution result: ${JSON.stringify(moduleOutput)}\n\nPlease respond to the user with the module execution result.`;
      }

      const model = process.env.OLLAMA_MAIN_MODEL || "llama2";
      const response = await this.ollama.chat({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
          ...(moduleOutput ? [
            { role: "system", content: `Module execution result: ${JSON.stringify(moduleOutput)}` },
            { role: "user", content: "Please respond to the user with the module execution result." }
          ] : [])
        ]
      });

      return response.message.content;
    } catch (error) {
      console.error("[ERROR] Ollama API call failed:", error.message);
      return `Error: Ollama API call failed - ${error.message}. Please check if Ollama is running and the model is available.`;
    }
  }
}

// ==================== MODULE SERVICE ====================
class ModuleService {
  constructor(modulesPath) {
    this.modulesPath = modulesPath;
    this.loadedModules = [];
  }

  async listModules() {
    const files = await fs.readdir(this.modulesPath);
    return files.filter(file => file.endsWith(".js") || file.endsWith(".mjs")).map(file => {
      if (file.endsWith(".mjs")) {
        return file.slice(0, -4);
      } else {
        return file.slice(0, -3);
      }
    });
  }

  async loadModule(moduleName) {
    try {
      // Try .js first, then .mjs
      let modulePath = path.join(this.modulesPath, moduleName + ".js");
      try {
        const imported = await import(modulePath);
        if (logging === "debug") console.log("[DEBUG] Loaded Module:", moduleName);
        return imported.default || imported;
      } catch (jsErr) {
        // Try .mjs if .js fails
        modulePath = path.join(this.modulesPath, moduleName + ".mjs");
        const imported = await import(modulePath);
        if (logging === "debug") console.log("[DEBUG] Loaded Module:", moduleName);
        return imported.default || imported;
      }
    } catch (err) {
      console.error(`[ERROR] Failed to load "${moduleName}":`, err);
      return null;
    }
  }

  async runModule(moduleName, commandName, parameters = '') {
    try {
      const module = await this.loadModule(moduleName);
      if (!module?.commands?.[commandName]) {
        console.warn(`[WARN] Command "${commandName}" not found in "${moduleName}"`);
        return { error: `Command "${commandName}" not found in "${moduleName}"` };
      }
      const handler = module.commands[commandName].handler;
      if (typeof handler !== "function") return { error: "Handler is not a function" };
      
      // Parse parameters for websearch and other modules that need them
      let parsedParams = parameters;
      if (parameters && parameters.includes('query=')) {
        // Extract query value from query="something" format
        const queryMatch = parameters.match(/query\s*=\s*["']([^"']+)["']/);
        if (queryMatch) {
          parsedParams = queryMatch[1];
        } else if (parameters.includes('query=')) {
          // Handle query=something format (no quotes)
          const queryMatch = parameters.match(/query\s*=\s*([^\s]+)/);
          if (queryMatch) {
            parsedParams = queryMatch[1];
          }
        }
      }
      
      const result = await handler(parsedParams);
      return { success: true, result };
    } catch (err) {
      console.error(`[ERROR] Failed to run "${commandName}" in "${moduleName}":`, err);
      return { error: err.message };
    }
  }

  parseModuleCommand(text) {
    // Use regex to find "/run module <module_name> <command> [parameters]" or "run module <module_name> <command> [parameters]" anywhere in the text
    const regex = /\/?run\s+module\s+(\w+)\s+(\w+)(?:\s+(.+))?/g;
    const match = regex.exec(text);
    
    if (!match) return null;
    
    console.log(`[DEBUG] Found module command:`, match[0]);
    console.log(`[DEBUG] Module:`, match[1], `Command:`, match[2], `Parameters:`, match[3] || '');
    
    let moduleName = match[1];
    let commandName = match[2];
    
    // Handle case where AI generates websearch.search instead of websearch search
    if (moduleName.includes('.')) {
      const parts = moduleName.split('.');
      moduleName = parts[0];
      commandName = parts[1];
    }
    
    return {
      module: moduleName,
      command: commandName,
      parameters: match[3] || ''
    };
  }

  async loadAllModules() {
    const moduleNames = await this.listModules();
    this.loadedModules = moduleNames;
    const loaded = {};
    for (const name of moduleNames) {
      try {
        loaded[name] = await this.loadModule(name);
      } catch (err) {
        console.error(`[ERROR] Failed to load "${name}":`, err);
      }
    }
    return loaded;
  }
}

// ==================== INITIALIZATION ====================
const aiService = new AIService();
const moduleService = new ModuleService(modulesPath);

// ==================== EXPRESS APP ====================
const app = express();
app.use(express.json());
app.use(express.static(FrontendPath));

// ==================== ROUTES ====================
app.get('/', async (req, res) => {
  try {
    const moduleCount = (await moduleService.listModules()).length;
    res.json({ message: 'ARR Backend running', modules: moduleCount });
  } catch (error) {
    res.json({ message: 'ARR Backend running', modules: 0 });
  }
});

app.get('/modules', async (req, res) => {
  try {
    const moduleList = await moduleService.listModules();
    res.json({ modules: moduleList });
  } catch (error) {
    console.error('[ERROR] Failed to list modules:', error);
    res.json({ modules: [] });
  }
});

app.get('/history/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId || 'default';
    const history = chatHistory.get(sessionId) || [];
    res.json({ success: true, history });
  } catch (error) {
    console.error('[ERROR] Failed to get chat history:', error);
    res.json({ success: false, history: [] });
  }
});

app.post('/clear-history', async (req, res) => {
  try {
    const { sessionId = 'default' } = req.body;
    chatHistory.delete(sessionId);
    res.json({ success: true, message: "Chat history cleared" });
  } catch (error) {
    console.error('[ERROR] Failed to clear chat history:', error);
    res.json({ success: false, message: "Failed to clear history" });
  }
});

// Store pending module requests
const pendingModuleRequests = new Map();

// Store chat history
const chatHistory = new Map(); // sessionId -> array of messages

app.post('/message', async (req, res) => {
  const { userprompt, typoftask, sessionId = 'default' } = req.body;
  
  if (!userprompt || !typoftask) {
    return res.json({ success: false, message: "Missing Fields" });
  }

  console.log("[ROUTE] Message received:", userprompt, "Session:", sessionId);

  // Initialize chat history for session if not exists
  if (!chatHistory.has(sessionId)) {
    chatHistory.set(sessionId, []);
  }

  // Check if user message is a direct command (starts with /run module)
  const directCommand = moduleService.parseModuleCommand(userprompt);
  
  if (directCommand) {
    console.log(`[DIRECT] User sent direct command: ${directCommand.module}.${directCommand.command}`);
    
    try {
      // Execute the command directly
      const moduleOutput = await moduleService.runModule(directCommand.module, directCommand.command, directCommand.parameters);
      console.log(`[DIRECT] Command result:`, moduleOutput);
      
      // Add user message and result to history
      const sessionHistory = chatHistory.get(sessionId);
      sessionHistory.push({
        role: 'user',
        content: userprompt,
        timestamp: new Date().toISOString()
      });
      
      sessionHistory.push({
        role: 'assistant',
        content: `Direct command executed: ${directCommand.module}.${directCommand.command}\nResult: ${JSON.stringify(moduleOutput, null, 2)}`,
        timestamp: new Date().toISOString()
      });
      
      return res.json({ 
        success: true, 
        message: `<strong>Direct Command Result:</strong><br><pre>${JSON.stringify(moduleOutput, null, 2)}</pre>`,
        moduleResult: moduleOutput,
        history: sessionHistory,
        directCommand: true
      });
      
    } catch (error) {
      console.error("[DIRECT] Command execution failed:", error);
      return res.json({ 
        success: false, 
        message: `Direct command execution failed: ${error.message}` 
      });
    }
  }

  // Add user message to history
  const sessionHistory = chatHistory.get(sessionId);
  sessionHistory.push({
    role: 'user',
    content: userprompt,
    timestamp: new Date().toISOString()
  });

  try {
    let response;
    let moduleOutput = null;

    switch (typoftask) {
      case "llm":
        // Get AI response first with chat history
        let aiResponse = await aiService.getResponse(userprompt, SystemLLMPrompt, null, sessionHistory || []);
        
        // Check if AI response contains a module command
        const moduleCommand = moduleService.parseModuleCommand(aiResponse);
        
        if (moduleCommand) {
          console.log(`[MODULE] AI wants to execute: ${moduleCommand.module}.${moduleCommand.command}`);
          
          // Auto-approve list module as it's basic and informational
          if (moduleCommand.module === 'list') {
            console.log(`[MODULE] Auto-approving list module`);
            
            try {
              const moduleOutput = await moduleService.runModule(moduleCommand.module, moduleCommand.command, moduleCommand.parameters);
              console.log(`[MODULE] List module result:`, moduleOutput);
              
          // Continue with module result
               const nextPrompt = `Original user request: "${userprompt}". 
Module execution result for ${moduleCommand.module}.${moduleCommand.command}: ${JSON.stringify(moduleOutput)}.
Based on this result, please provide a complete response to the user's original request. Only execute another module if the result is insufficient to answer the user's question. If you need to execute more modules, use the /run module syntax again.`;
              
               // Get AI response with module result
               let finalResponse = await aiService.getResponse(nextPrompt, SystemLLMPrompt, null, sessionHistory || []);
              
              // Check if AI wants to execute another module
              const nextModuleCommand = moduleService.parseModuleCommand(finalResponse);
              
              if (nextModuleCommand) {
                // Another module request - create approval request
                const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                pendingModuleRequests.set(requestId, {
                  module: nextModuleCommand.module,
                  command: nextModuleCommand.command,
                  parameters: nextModuleCommand.parameters,
                  originalPrompt: userprompt,
                  aiResponse: finalResponse,
                  allModuleOutputs: [{
                    module: moduleCommand.module,
                    command: moduleCommand.command,
                    result: moduleOutput
                  }],
                  originalSessionId: sessionId
                });
                
                return res.json({ 
                  success: true, 
                  requiresApproval: true,
                  requestId: requestId,
                  module: nextModuleCommand.module,
                  command: nextModuleCommand.command,
                  previousResult: markdown.toHTML(finalResponse),
                  message: "AI requests permission to execute another module."
                });
              }
              
              // No more modules - final response
              // Add AI response to history
              sessionHistory.push({
                role: 'assistant',
                content: finalResponse,
                timestamp: new Date().toISOString()
              });
              
              res.json({ 
                success: true, 
                message: markdown.toHTML(finalResponse),
                moduleResult: moduleOutput,
                history: sessionHistory
              });
              
            } catch (error) {
              console.error("[ERROR] List module execution failed:", error);
              res.json({ 
                success: false, 
                message: "List module execution failed: " + error.message 
              });
            }
          } else {
            // Generate unique request ID for non-list modules
            const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            
            // Store the request for later approval
            pendingModuleRequests.set(requestId, {
              module: moduleCommand.module,
              command: moduleCommand.command,
              parameters: moduleCommand.parameters,
              originalPrompt: userprompt,
              aiResponse: aiResponse,
              allModuleOutputs: [],
              originalSessionId: sessionId
            });
            
            // Return module approval request
            return res.json({ 
              success: true, 
              requiresApproval: true,
              requestId: requestId,
              module: moduleCommand.module,
              command: moduleCommand.command,
              message: "AI requests permission to execute a module. Please approve or deny."
            });
          }
        } else {
          // No module command found, return AI response directly
          // Add AI response to history
          sessionHistory.push({
            role: 'assistant',
            content: aiResponse,
            timestamp: new Date().toISOString()
          });
          
          res.json({ 
            success: true, 
            message: markdown.toHTML(aiResponse),
            history: sessionHistory
          });
        }
        break;
      default:
        res.json({ success: false, message: "Unknown task type" });
    }
  } catch (error) {
    console.error("[ERROR] Message processing failed:", error);
    res.json({ success: false, message: error.message || "Internal Server Error" });
  }
});

app.post('/approve-module', async (req, res) => {
  const { requestId, approved } = req.body;
  
  if (!requestId) {
    return res.json({ success: false, message: "Missing request ID" });
  }
  
  const pendingRequest = pendingModuleRequests.get(requestId);
  if (!pendingRequest) {
    return res.json({ success: false, message: "Request not found or expired" });
  }
  
  // Remove from pending requests
  pendingModuleRequests.delete(requestId);
  
  if (!approved) {
    return res.json({ 
      success: true, 
      message: "Module execution denied by user.",
      denied: true 
    });
  }
  
  try {
    // Execute the approved module
    const moduleOutput = await moduleService.runModule(pendingRequest.module, pendingRequest.command, pendingRequest.parameters);
    console.log(`[MODULE] Approved execution result:`, moduleOutput);
    
    // Continue the AI conversation with the module result
    const updatedModuleOutputs = [...pendingRequest.allModuleOutputs, {
      module: pendingRequest.module,
      command: pendingRequest.command,
      result: moduleOutput
    }];
    
    // Update prompt to include the module result for next iteration
    const nextPrompt = `Original user request: "${pendingRequest.originalPrompt}". 
Module execution result for ${pendingRequest.module}.${pendingRequest.command}: ${JSON.stringify(moduleOutput)}.
Based on this result, please provide a complete response to the user's original request. Only execute another module if the result is insufficient to answer the user's question. If you need to execute more modules, use the /run module syntax again.`;
    
    // Get AI response with module result
    const sessionHistoryForApproval = chatHistory.get(pendingRequest.originalSessionId || 'default') || [];
    let finalResponse = await aiService.getResponse(nextPrompt, SystemLLMPrompt, null, sessionHistoryForApproval);
    
    // Check if AI wants to execute another module
    const nextModuleCommand = moduleService.parseModuleCommand(finalResponse);
    
    if (nextModuleCommand) {
      // Auto-approve list module
      if (nextModuleCommand.module === 'list') {
        console.log(`[MODULE] Auto-approving list module in approval flow`);
        
        try {
          const listModuleOutput = await moduleService.runModule(nextModuleCommand.module, nextModuleCommand.command, nextModuleCommand.parameters);
          console.log(`[MODULE] List module result:`, listModuleOutput);
          
          const newUpdatedModuleOutputs = [...updatedModuleOutputs, {
            module: nextModuleCommand.module,
            command: nextModuleCommand.command,
            result: listModuleOutput
          }];
          
          // Continue with list module result
           const nextPrompt = `Original user request: "${pendingRequest.originalPrompt}". 
Module execution result for ${nextModuleCommand.module}.${nextModuleCommand.command}: ${JSON.stringify(listModuleOutput)}.
Based on this result, please provide a complete response to the user's original request. Only execute another module if the result is insufficient to answer the user's question. If you need to execute more modules, use the /run module syntax again.`;
          
          // Get AI response with list module result
          const sessionHistoryForList = chatHistory.get(pendingRequest.originalSessionId) || [];
          let nextFinalResponse = await aiService.getResponse(nextPrompt, SystemLLMPrompt, null, sessionHistoryForList);
          
          // Check if AI wants to execute yet another module
          const yetAnotherModuleCommand = moduleService.parseModuleCommand(nextFinalResponse);
          
          if (yetAnotherModuleCommand) {
            // Create approval request for non-list module
            const newRequestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            pendingModuleRequests.set(newRequestId, {
              module: yetAnotherModuleCommand.module,
              command: yetAnotherModuleCommand.command,
              parameters: yetAnotherModuleCommand.parameters,
              originalPrompt: pendingRequest.originalPrompt,
              aiResponse: nextFinalResponse,
              allModuleOutputs: newUpdatedModuleOutputs,
              originalSessionId: pendingRequest.originalSessionId
            });
            
            return res.json({ 
              success: true, 
              requiresApproval: true,
              requestId: newRequestId,
              module: yetAnotherModuleCommand.module,
              command: yetAnotherModuleCommand.command,
              previousResult: markdown.toHTML(nextFinalResponse),
              message: "AI requests permission to execute another module."
            });
          }
          
          // No more modules - final response
          return res.json({ 
            success: true, 
            message: markdown.toHTML(nextFinalResponse),
            moduleResult: listModuleOutput
          });
          
        } catch (error) {
          console.error("[ERROR] List module execution failed:", error);
          return res.json({ 
            success: false, 
            message: "List module execution failed: " + error.message 
          });
        }
      } else {
        // Create approval request for non-list module
        const newRequestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        pendingModuleRequests.set(newRequestId, {
          module: nextModuleCommand.module,
          command: nextModuleCommand.command,
          parameters: nextModuleCommand.parameters,
          originalPrompt: pendingRequest.originalPrompt,
          aiResponse: finalResponse,
          allModuleOutputs: updatedModuleOutputs,
          originalSessionId: pendingRequest.originalSessionId
        });
        
        return res.json({ 
          success: true, 
          requiresApproval: true,
          requestId: newRequestId,
          module: nextModuleCommand.module,
          command: nextModuleCommand.command,
          previousResult: markdown.toHTML(finalResponse),
          message: "AI requests permission to execute another module."
        });
      }
    }
    
    // Add AI response to history
    const sessionHistory = chatHistory.get(pendingRequest.originalSessionId || 'default');
    sessionHistory.push({
      role: 'assistant',
      content: finalResponse,
      timestamp: new Date().toISOString()
    });
    
    // No more modules - final response
    res.json({ 
      success: true, 
      message: markdown.toHTML(finalResponse),
      moduleResult: moduleOutput,
      history: sessionHistory
    });
    
  } catch (error) {
    console.error("[ERROR] Module execution failed:", error);
    res.json({ 
      success: false, 
      message: "Module execution failed: " + error.message 
    });
  }
});

// ==================== STARTUP ====================
(async () => {
  try {
    modules = await moduleService.listModules();
    await moduleService.loadAllModules();

    app.listen(port, () => {
      console.log(`🚀 ARR Backend on port ${port}`);
      console.log(`📦 ${modules.length} modules loaded`);
      console.log(`🤖 Default LLM Service: ${DEFAULT_LLM_SERVICE.toUpperCase()}`);
      console.log(`🤖 AI Services: Ollama, Gemini, OpenAI ready`);
    });
  } catch (error) {
    console.error("[FATAL] Failed to start server:", error);
    process.exit(1);
  }
})();