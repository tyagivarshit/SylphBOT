import { ProviderAdapter, ProviderConfig } from "../types";
import { MessageDTO, CompletionResult, CompletionOptions } from "../../interfaces/core";
import { RetirementEnforcer } from "../../kernel/retirementEnforcer";

export class BaseHTTPAdapter {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }
}

export class OpenAIAdapter extends BaseHTTPAdapter implements ProviderAdapter {
  public async generateCompletion(
    modelId: string,
    messages: MessageDTO[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    RetirementEnforcer.enforceNoDirectOpenAI();
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY || "dummy_key";
    const baseUrl = this.config.baseUrl || "https://api.openai.com/v1";
    
    // In testing/mock environments, return simulated completions
    if (apiKey === "dummy_key" || process.env.NODE_ENV === "test") {
      return this.mockResponse(modelId, messages);
    }

    const start = Date.now();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1024,
        response_format: options?.jsonMode ? { type: "json_object" } : undefined
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    return {
      content: payload.choices[0].message.content,
      model: modelId,
      latencyMs: Date.now() - start,
      tokensUsed: {
        prompt: payload.usage.prompt_tokens,
        completion: payload.usage.completion_tokens,
        total: payload.usage.total_tokens
      }
    };
  }

  public async getEmbedding(modelId: string, text: string): Promise<number[]> {
    RetirementEnforcer.enforceNoDirectOpenAI();
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY || "dummy_key";
    const baseUrl = this.config.baseUrl || "https://api.openai.com/v1";

    if (apiKey === "dummy_key" || process.env.NODE_ENV === "test") {
      return Array(1536).fill(0.1); // dummy embedding vector
    }

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        input: text
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI Embedding failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    return payload.data[0].embedding;
  }

  private mockResponse(modelId: string, messages: MessageDTO[]): CompletionResult {
    const prompt = messages[messages.length - 1].content;
    const content = prompt.includes("intent") 
      ? JSON.stringify({ decision: "Proceed with request", confidence: 0.9 })
      : "Mock OpenAI Completion Response";

    return {
      content,
      model: modelId,
      latencyMs: 15,
      tokensUsed: { prompt: 50, completion: 20, total: 70 }
    };
  }
}

export class AnthropicAdapter extends BaseHTTPAdapter implements ProviderAdapter {
  public async generateCompletion(
    modelId: string,
    messages: MessageDTO[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY || "dummy_key";
    const baseUrl = this.config.baseUrl || "https://api.anthropic.com/v1";

    if (apiKey === "dummy_key" || process.env.NODE_ENV === "test") {
      return {
        content: "Mock Anthropic Completion Response",
        model: modelId,
        latencyMs: 20,
        tokensUsed: { prompt: 60, completion: 25, total: 85 }
      };
    }

    const start = Date.now();
    // Convert OpenAI system role style messages to Anthropic messaging format
    const systemMessage = messages.find(m => m.role === "system");
    const userMessages = messages.filter(m => m.role !== "system");

    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: modelId,
        system: systemMessage?.content,
        messages: userMessages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    return {
      content: payload.content[0].text,
      model: modelId,
      latencyMs: Date.now() - start,
      tokensUsed: {
        prompt: payload.usage.input_tokens,
        completion: payload.usage.output_tokens,
        total: payload.usage.input_tokens + payload.usage.output_tokens
      }
    };
  }

  public async getEmbedding(modelId: string, text: string): Promise<number[]> {
    throw new Error("Anthropic does not natively support embeddings. Choose a compatible embedding model.");
  }
}

export class GeminiAdapter extends BaseHTTPAdapter implements ProviderAdapter {
  public async generateCompletion(
    modelId: string,
    messages: MessageDTO[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const apiKey = this.config.apiKey || process.env.GEMINI_API_KEY || "dummy_key";
    
    if (apiKey === "dummy_key" || process.env.NODE_ENV === "test") {
      return {
        content: "Mock Gemini Completion Response",
        model: modelId,
        latencyMs: 10,
        tokensUsed: { prompt: 40, completion: 15, total: 55 }
      };
    }

    const start = Date.now();
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: options?.maxTokens ?? 1024,
            temperature: options?.temperature ?? 0.7,
            responseMimeType: options?.jsonMode ? "application/json" : "text/plain"
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    const content = payload.candidates[0].content.parts[0].text;
    const promptTokens = payload.usageMetadata?.promptTokenCount ?? 50;
    const completionTokens = payload.usageMetadata?.candidatesTokenCount ?? 50;

    return {
      content,
      model: modelId,
      latencyMs: Date.now() - start,
      tokensUsed: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens
      }
    };
  }

  public async getEmbedding(modelId: string, text: string): Promise<number[]> {
    const apiKey = this.config.apiKey || process.env.GEMINI_API_KEY || "dummy_key";

    if (apiKey === "dummy_key" || process.env.NODE_ENV === "test") {
      return Array(768).fill(0.2);
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text }] }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini Embedding failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    return payload.embedding.values;
  }
}

export class GroqAdapter extends BaseHTTPAdapter implements ProviderAdapter {
  public async generateCompletion(
    modelId: string,
    messages: MessageDTO[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const apiKey = this.config.apiKey || process.env.GROQ_API_KEY || "dummy_key";
    const baseUrl = this.config.baseUrl || "https://api.groq.com/openai/v1";

    if (apiKey === "dummy_key" || apiKey === "gsk_dummy_test_key" || process.env.NODE_ENV === "test") {
      return {
        content: "Mock Groq Completion Response",
        model: modelId,
        latencyMs: 8,
        tokensUsed: { prompt: 30, completion: 10, total: 40 }
      };
    }

    const start = Date.now();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 1024,
        response_format: options?.jsonMode ? { type: "json_object" } : undefined
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    return {
      content: payload.choices[0].message.content,
      model: modelId,
      latencyMs: Date.now() - start,
      tokensUsed: {
        prompt: payload.usage.prompt_tokens,
        completion: payload.usage.completion_tokens,
        total: payload.usage.total_tokens
      }
    };
  }

  public async getEmbedding(modelId: string, text: string): Promise<number[]> {
    throw new Error("Groq does not natively support embeddings. Choose a compatible embedding model.");
  }
}

export class OpenRouterAdapter extends BaseHTTPAdapter implements ProviderAdapter {
  public async generateCompletion(
    modelId: string,
    messages: MessageDTO[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const apiKey = this.config.apiKey || process.env.OPENROUTER_API_KEY || "dummy_key";
    const baseUrl = this.config.baseUrl || "https://openrouter.ai/api/v1";

    if (apiKey === "dummy_key" || process.env.NODE_ENV === "test") {
      return {
        content: "Mock OpenRouter Completion Response",
        model: modelId,
        latencyMs: 25,
        tokensUsed: { prompt: 80, completion: 30, total: 110 }
      };
    }

    const start = Date.now();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://automexia.ai",
        "X-Title": "Automexia AI Runtime"
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1024
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    return {
      content: payload.choices[0].message.content,
      model: modelId,
      latencyMs: Date.now() - start,
      tokensUsed: {
        prompt: payload.usage.prompt_tokens,
        completion: payload.usage.completion_tokens,
        total: payload.usage.total_tokens
      }
    };
  }

  public async getEmbedding(modelId: string, text: string): Promise<number[]> {
    throw new Error("OpenRouter chat endpoint does not support embeddings directly.");
  }
}

export class OllamaAdapter extends BaseHTTPAdapter implements ProviderAdapter {
  public async generateCompletion(
    modelId: string,
    messages: MessageDTO[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const baseUrl = this.config.baseUrl || "http://localhost:11434/api";

    if (process.env.NODE_ENV === "test") {
      return {
        content: "Mock Ollama Completion Response",
        model: modelId,
        latencyMs: 5,
        tokensUsed: { prompt: 20, completion: 8, total: 28 }
      };
    }

    const start = Date.now();
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.7
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    const promptTokens = payload.prompt_eval_count ?? 10;
    const completionTokens = payload.eval_count ?? 10;

    return {
      content: payload.message.content,
      model: modelId,
      latencyMs: Date.now() - start,
      tokensUsed: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens
      }
    };
  }

  public async getEmbedding(modelId: string, text: string): Promise<number[]> {
    const baseUrl = this.config.baseUrl || "http://localhost:11434/api";

    if (process.env.NODE_ENV === "test") {
      return Array(1024).fill(0.3);
    }

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        prompt: text
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama Embedding failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    return payload.embedding;
  }
}
