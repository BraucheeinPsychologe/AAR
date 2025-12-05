# AAR — Another Agent Runtime

AAR is a modular, secure, and extensible runtime for AI agents.  
The system focuses on control, transparency, and user-approved execution.  
Modules can access device data, perform actions, or interact with external systems —  
but never without explicit user authorization.

AAR provides:

- Controlled execution of agent actions (sandboxed modules)
- User consent and permission-based access
- Support for multiple AI backends (ChatGPT, Gemini, Ollama)
- NodeJS-based runtime
- A simple and extensible module system
- Web-based frontend for interaction and approval
- Device identification, optional 2FA, and full audit logging

---

## Features

### Modular architecture
- Modules are plain `.js` files.
- Each module defines:
  - ID and name  
  - Capabilities (READ / READ_WRITE)
  - Commands
  - Handler functions
- Modules can only run after explicit user approval.

### Security-first design
- User approval required for module activation
- Optional WebAuthn device binding
- Optional 2FA (TOTP or WebAuthn)
- Granular, module-level permissions
- Full audit log of module usage and agent actions

### Pluggable AI backends
AAR supports multiple model providers via adapters:

- OpenAI / ChatGPT
- Google Gemini
- Ollama (local LLMs)

Adapters implement a unified interface and can be extended easily.

### Web-based frontend
- Real-time approval pop-ups
- Module overview and permissions control
- Command console (`/run ...`)
- System status and logs

### Simple module development
Example module:

```js
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
```

---

Project Structure
```
AAR/
│
├── modules/           # Agent modules
│   ├── time.js
│   ├── battery.js
│   └── ...
│
├── adapters/      # AI model adapters
│   ├── chatgpt.js
│   ├── gemini.js
│   └── ollama.js
|
├── backend/      # Backend
│   └── main.js
|
├── frontend/              # Web user 
│   └── ...
│
├── docker/
│   └── Dockerfile
│
└── README.md
```

---

Command System

AAR provides a structured command interface accessible via the frontend or API.

List all modules

> /run help modules

Show information about a specific module

> /run help module time

Example output:

getTime
getDate
getMonth

Run a module command

> /run time.getTime

If the module has not been authorized yet, the frontend prompts the user for approval.


---

Permission Model

Modules declare capabilities:

READ – Module can only read or fetch data

READ_WRITE – Module can perform actions or modify states


AAR enforces:

User approval before the module can execute

Optional per-command or per-session approvals

Revocation of permissions at any time

Full audit logs for every action



---

AI Adapter Interface

All AI backends implement a common interface:
```js
class AIAdapter {
  async generate(systemPrompt, userPrompt) {
    // Returns the model response
  }
}
```
This allows seamless switching of AI providers.


---

Goals

AAR aims to provide a transparent, controlled, and extensible runtime for AI agents.
The system is designed to integrate safely with devices, data sources, and external tools,
with the user always remaining in full control.


---

Future Extensions (Planned)

Role-based permission presets

Secure module signing

Automated tests for modules

Enhanced sandboxing through isolated workers

Native desktop container builds



---

License

To be added.
