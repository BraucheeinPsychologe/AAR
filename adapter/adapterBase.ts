// adapters/adapterBase.ts
export interface AIAdapter {
  /**
   * Generates a response from the AI model.
   * @param systemPrompt Instructions or context for the model
   * @param userPrompt User input / query
   * @returns Response text and optional metadata
   */
  generate(systemPrompt: string, userPrompt: string): Promise<{ text: string; meta?: any }>;
}
