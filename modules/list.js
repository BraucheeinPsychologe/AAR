module.exports = {
  id: "list",
  name: "Listing Module",
  capabilities: ["READ"],

  commands: {
    listAllModules: {
      description: "Returns all Module names with their commands and capabilities",
      handler: async () => {
        const fs = await import('fs');
        const path = await import('path');
        const modulesPath = path.join(process.cwd(), '..', 'modules');
        const files = fs.readdirSync(modulesPath);
        const moduleFiles = files.filter(file => file.endsWith('.js') || file.endsWith('.mjs'));
        
        const modules = [];
        
        for (const file of moduleFiles) {
          try {
            const modulePath = path.join(modulesPath, file);
            const moduleData = await import(modulePath);
            const module = moduleData.default || moduleData;
            
            // Handle both .js and .mjs extensions
            const baseName = file.endsWith('.mjs') ? file.slice(0, -4) : file.slice(0, -3);
            const moduleInfo = {
              name: module.name || baseName,
              id: module.id || baseName,
              capabilities: module.capabilities || [],
              commands: {}
            };
            
            // Extract command information
            if (module.commands) {
              for (const [commandName, commandData] of Object.entries(module.commands)) {
                moduleInfo.commands[commandName] = {
                  description: commandData.description || "No description available"
                };
              }
            }
            
            modules.push(moduleInfo);
          } catch (err) {
            console.error(`[ERROR] Failed to load module "${file}":`, err);
            // Handle both .js and .mjs extensions
            const baseName = file.endsWith('.mjs') ? file.slice(0, -4) : file.slice(0, -3);
            modules.push({
              name: baseName,
              id: baseName,
              capabilities: [],
              commands: {},
              error: "Failed to load module"
            });
          }
        }
        
        return modules;
      }
    },
  }
};
