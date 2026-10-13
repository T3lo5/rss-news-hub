import OpenAI from 'openai';
import { ai } from '../server.config.js';

let aiConfig = ai;
let openaiClients = {};

export function __setAiConfig(config) {
  aiConfig = config;
  openaiClients = {};
}

export function __getAiConfig() {
  return aiConfig;
}

function getClient(cfg) {
  const key = `${cfg.baseUrl}:${cfg.apiKey}:${cfg.model}`;
  if (!openaiClients[key]) {
    openaiClients[key] = new OpenAI({
      baseURL: cfg.baseUrl,
      apiKey: cfg.apiKey,
    });
  }
  return openaiClients[key];
}

export function pickProvider(preferred) {
  if (preferred === 'sensenova' && aiConfig.sensenova.apiKey)
    return { ...aiConfig.sensenova, sdk: 'openai' };
  if (preferred === 'deepseek' && aiConfig.deepseek.apiKey) return aiConfig.deepseek;
  if (preferred === 'openai' && aiConfig.openai.apiKey) return aiConfig.openai;
  if (aiConfig.sensenova.apiKey) return { ...aiConfig.sensenova, sdk: 'openai' };
  if (aiConfig.deepseek.apiKey) return aiConfig.deepseek;
  if (aiConfig.openai.apiKey) return aiConfig.openai;
  return null;
}

export async function chat(systemPrompt, userContent, provider = 'auto') {
  const cfg = pickProvider(provider);
  if (!cfg) {
    throw new Error('No AI provider configured. Set at least one API key in .env');
  }

  if (cfg.sdk === 'openai') {
    const client = getClient(cfg);
    const completion = await client.chat.completions.create({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.7,
    });
    return completion.choices?.[0]?.message?.content || '';
  }

  const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function chatStream(
  systemPrompt,
  userContent,
  provider = 'auto',
  onToken,
  options = {}
) {
  const cfg = pickProvider(provider);
  if (!cfg) {
    throw new Error('No AI provider configured. Set at least one API key in .env');
  }

  const abortSignal = options.signal;
  if (abortSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const body = JSON.stringify({
    model: cfg.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.7,
    stream: true,
  });

  let res;
  if (cfg.sdk === 'openai') {
    const client = getClient(cfg);
    const stream = await client.chat.completions.create({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      if (abortSignal?.aborted) break;
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) onToken(content);
    }
    return;
  }

  res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body,
    signal: abortSignal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI API error ${res.status}: ${text.slice(0, 200)}`);
  }

  if (!res.body) {
    throw new Error('No response body for streaming');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (abortSignal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) onToken(content);
          } catch {
            // Ignore parse errors for malformed chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function buildSystemPrompt(type, language) {
  const lang = language === 'pt' ? 'Português' : 'English';

  if (type === 'thread') {
    return `You are a senior software engineer with deep knowledge of backend, Linux, containers, and infrastructure. Write a technical, natural Twitter (X) thread of exactly 3 tweets in ${lang}. Be analytical, avoid corporate clichés, and never end with rhetorical questions. Each tweet should be dense (200-260 chars) and end with (1/3), (2/3), (3/3). Return ONLY a JSON object: {"title":"...","tweets":["...","...","..."],"link":"..."}.`;
  }

  if (type === 'summary') {
    return `Summarize the following article in ${lang} in 2-3 concise paragraphs suitable for a tech-savvy audience. Be factual and neutral.`;
  }

  if (type === 'linkedin') {
    return `Write a professional LinkedIn post in ${lang} about the following topic. Follow this exact structure:
📌 Title: An attention-grabbing headline (1 line)
⚡ TLDR: Executive summary in 1-2 sentences at the start
✂️ Body: Key insights (3-4 bullet points), max 1000 characters total
🔗 Link: Include the original content link
💬 CTA: End with a call-to-action question that invites engagement

Return ONLY the post text. No extra commentary.`;
  }

  if (type === 'blog') {
    return `Write a long-form blog post in ${lang} suitable for platforms like Substack, dev.to, or personal blogs. Follow this structure:

# Title
Compelling, SEO-friendly headline (under 60 chars)

## Subtitle
One-sentence hook that summarizes the value proposition (under 160 chars)

## Introduction
2-3 paragraphs: problem context, why it matters, what reader will learn

## Main Sections (3-5)
Each with descriptive H2 headings. Content: practical insights, code snippets if relevant, real examples. Use short paragraphs, bullet points for readability.

## Image Ideas
Suggest 2-3 relevant visuals (e.g., "Architecture diagram showing X flow", "Screenshot of Y dashboard", "Comparison table of Z tools"). Format as bullet list. These are suggestions only - no image generation needed.

## Conclusion
2-3 paragraphs: key takeaways, next steps for reader, subtle CTA (newsletter, comments, related post)

## Tags
5-7 relevant tags for discovery (comma-separated)

Target: 1500-3000 words. Tone: authoritative yet accessible, developer-focused. Return ONLY the post text in Markdown.`;
  }

  if (type === 'newsletter') {
    return `Create a tech newsletter in ${lang} from the following articles. 
Structure: 
- Header: "Tech News Digest" + date
- 3-5 sections, each: bold title + 2-3 sentence summary + source link
- Footer: "Curated by RSS News Hub"
Tone: professional, concise, developer-focused. Max 2000 chars. Return ONLY the newsletter text (markdown).`;
  }

  return `Answer the following in ${lang}.`;
}
