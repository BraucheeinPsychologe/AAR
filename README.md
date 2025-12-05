AAR — Another Agent Runtime

AAR is a modular, secure, and extensible runtime for AI agents.
The system focuses on control, transparency, and user-approved execution.
Modules can read device data, trigger actions, or interact with external systems —
but never without explicit user authorization.

AAR enables:

Controlled agent execution (sandboxed modules)

User consent and permission-based access

Multiple AI backends (ChatGPT, Gemini, Ollama)

NodeJS-based runtime

A simple and extensible module system

Web frontend for control prompts

Security through device identification, 2FA, and auditing



---

Features

Modular architecture

Modules are plain .js files.

Each module defines:

Name and ID

Capabilities (READ / READ_WRITE)

Commands

Handler functions



Security-first design

User approval required for every module activation

Optional WebAuthn device verification

Optional TOTP or WebAuthn-based 2FA

Granular permissions per module

Full audit log of all actions


Pluggable AI backends

AAR supports multiple AI model providers via adapters:

OpenAI / ChatGPT

Google Gemini

Ollama (local models)


Adapters follow a unified API and can be extended easily.

Web-based frontend

Real-time pop-up authorization dialogs

Module overview and access control

Command console (/run ...)

Status dashboard and logs


Simple module development

A module example:

module.exports = {
  id: "time",
  name: "Time Module",
  capabilities: ["READ"],

  commands: {
    getTime: {
      description: "Returns the current time",
      handler: async () => new Date().toLocaleTimeString()
    },
    getDate: {
      description: "Returns the current date",
      handler: async () => new Date().toLocaleDateString()
    }
  }
};


---

Project structure

AAR/
│
├── modules/               # All agent modules
│   ├── time.js
│   ├── battery.js
│   └── ...
│
├── adapters/              # AI model adapters
│   ├── chatgpt.js
│   ├── gemini.js
│   └── ollama.js
│
├── core/
│   ├── agent.js           # Main agent logic
│   ├── permissions.js     # Permission and approval system
│   ├── moduleLoader.js    # Module loading and validation
│   ├── commandParser.js   # "/run ..." parser
│   └── audit.js           # Audit log
│
├── server/
│   ├── api.js             # Backend API
│   ├── websocket.js       # Real-time UI communication
│   └── auth.js            # Device ID + 2FA
│
├── frontend/              # Web interface
│   └── ...
│
├── docker/
│   └── Dockerfile
│
└── README.md


---

Command system

AAR provides a structured runtime command interface:

List all modules

/run help modules

Describe a specific module

/run help module time

Example output:

getTime
getDate
getMonth

Execute a command

/run time.getTime

If the module has not been authorized yet, the frontend prompts the user.


---

Permission model

Each module declares its capabilities:

READ – The module may only read or fetch data.

READ_WRITE – The module can perform actions or change states.


AAR enforces:

User confirmation before first activation

Optional session-based or per-command approval

Revocation at any time

Audit logs for every access



---

AI adapters

All AI backends implement a common interface:

class AIAdapter {
  async generate(systemPrompt, userPrompt) { ... }
}

This allows switching AI models without modifying the agent logic.


---

Goals

The primary goal of AAR is to provide a controlled, transparent, and extensible runtime for AI agents that can safely interact with devices, data, and environments — always with explicit user oversight.
