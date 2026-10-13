import { asc, desc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

const BUILTIN_TEMPLATES: schema.NewTemplate[] = [
  {
    id: 'thread-default',
    name: 'Twitter/X Thread (Default)',
    type: 'thread',
    systemPrompt: `You are a senior software engineer with deep knowledge of backend, Linux, containers, and infrastructure. Write a technical, natural Twitter (X) thread of exactly 3 tweets in {{language}}. Be analytical, avoid corporate clichés, and never end with rhetorical questions. Each tweet should be dense (200-260 chars) and end with (1/3), (2/3), (3/3). Return ONLY a JSON object: {"title":"...","tweets":["...","...","..."],"link":"..."}.`,
    variables: JSON.stringify(['language']),
    isBuiltin: true,
  },
  {
    id: 'summary-default',
    name: 'Summary (Default)',
    type: 'summary',
    systemPrompt: `Summarize the following article in {{language}} in 2-3 concise paragraphs suitable for a tech-savvy audience. Be factual and neutral.`,
    variables: JSON.stringify(['language']),
    isBuiltin: true,
  },
  {
    id: 'linkedin-default',
    name: 'LinkedIn Post (Default)',
    type: 'linkedin',
    systemPrompt: `Write a professional LinkedIn post in {{language}} about the following topic. Follow this exact structure:
📌 Title: An attention-grabbing headline (1 line)
⚡ TLDR: Executive summary in 1-2 sentences at the start
✂️ Body: Key insights (3-4 bullet points), max 1000 characters total
🔗 Link: Include the original content link
💬 CTA: End with a call-to-action question that invites engagement

Return ONLY the post text. No extra commentary.`,
    variables: JSON.stringify(['language']),
    isBuiltin: true,
  },
  {
    id: 'blog-default',
    name: 'Blog Post (Default)',
    type: 'blog',
    systemPrompt: `Write a long-form blog post in {{language}} suitable for platforms like Substack, dev.to, or personal blogs. Follow this structure:

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

Target: 1500-3000 words. Tone: authoritative yet accessible, developer-focused. Return ONLY the post text in Markdown.`,
    variables: JSON.stringify(['language']),
    isBuiltin: true,
  },
  {
    id: 'newsletter-default',
    name: 'Newsletter (Default)',
    type: 'newsletter',
    systemPrompt: `Create a tech newsletter in {{language}} from the following articles. 
Structure: 
- Header: "Tech News Digest" + date
- 3-5 sections, each: bold title + 2-3 sentence summary + source link
- Footer: "Curated by RSS News Hub"
Tone: professional, concise, developer-focused. Max 2000 chars. Return ONLY the newsletter text (markdown).`,
    variables: JSON.stringify(['language']),
    isBuiltin: true,
  },
];

const DEFAULT_TEMPLATE_IDS = {
  thread: 'thread-default',
  summary: 'summary-default',
  linkedin: 'linkedin-default',
  blog: 'blog-default',
  newsletter: 'newsletter-default',
};

export class TemplateRepository {
  private get db() {
    return getDb();
  }
  private initialized = false;

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    // Insert built-in templates if they don't exist
    for (const tmpl of BUILTIN_TEMPLATES) {
      const existing = await this.db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, tmpl.id))
        .limit(1);
      if (!existing[0]) {
        await this.db.insert(schema.templates).values(tmpl);
      }
    }
    this.initialized = true;
  }

  /** Test helper: forget initialization state so builtins are re-inserted. */
  reset(): void {
    this.initialized = false;
  }

  async findAll(): Promise<schema.Template[]> {
    await this.ensureInitialized();
    return this.db
      .select()
      .from(schema.templates)
      .orderBy(desc(schema.templates.isBuiltin), asc(schema.templates.name));
  }

  async findById(id: string): Promise<schema.Template | undefined> {
    await this.ensureInitialized();
    const result = await this.db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.id, id))
      .limit(1);
    return result[0];
  }

  async findByType(type: string): Promise<schema.Template[]> {
    await this.ensureInitialized();
    return this.db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.type, type as any))
      .orderBy(desc(schema.templates.isBuiltin), asc(schema.templates.name));
  }

  async getDefaultForType(type: string): Promise<schema.Template> {
    await this.ensureInitialized();
    const defaultId = DEFAULT_TEMPLATE_IDS[type as keyof typeof DEFAULT_TEMPLATE_IDS];
    if (defaultId) {
      const tmpl = await this.findById(defaultId);
      if (tmpl) return tmpl;
    }
    // Fallback to first builtin of that type
    const builtins = await this.findByType(type);
    const builtin = builtins.find((t) => t.isBuiltin);
    if (builtin) return builtin;
    // Last resort: first template of that type
    if (builtins.length > 0) return builtins[0];
    throw new Error(`No template found for type: ${type}`);
  }

  async create(template: schema.NewTemplate): Promise<schema.Template> {
    await this.ensureInitialized();
    // Check for duplicate ID
    const existing = await this.findById(template.id);
    if (existing) {
      throw new Error(`Template with id '${template.id}' already exists`);
    }

    const result = await this.db.insert(schema.templates).values(template).returning();
    return result[0];
  }

  async update(id: string, updates: Partial<schema.NewTemplate>): Promise<schema.Template> {
    await this.ensureInitialized();

    // Don't allow updating builtin templates
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Template with id '${id}' not found`);
    }
    if (existing.isBuiltin) {
      throw new Error('Cannot modify built-in templates');
    }

    const result = await this.db
      .update(schema.templates)
      .set({ ...updates, updatedAt: sql`(strftime('%s', 'now') * 1000)` })
      .where(eq(schema.templates.id, id))
      .returning();

    return result[0];
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Template with id '${id}' not found`);
    }
    if (existing.isBuiltin) {
      throw new Error('Cannot delete built-in templates');
    }

    const result = await this.db.delete(schema.templates).where(eq(schema.templates.id, id));
    return result.changes > 0;
  }

  async getSystemPrompt(templateId: string, variables: Record<string, string>): Promise<string> {
    const template = await this.findById(templateId);
    if (!template) {
      // Fallback to default for type
      const type = variables.type || 'summary';
      const defaultTemplate = await this.getDefaultForType(type);
      return this.interpolatePrompt(defaultTemplate.systemPrompt, variables);
    }
    return this.interpolatePrompt(template.systemPrompt, variables);
  }

  private interpolatePrompt(prompt: string, variables: Record<string, string>): string {
    let result = prompt;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  }

  getBuiltinTemplates(): typeof BUILTIN_TEMPLATES {
    return BUILTIN_TEMPLATES;
  }

  getDefaultTemplateIds(): typeof DEFAULT_TEMPLATE_IDS {
    return DEFAULT_TEMPLATE_IDS;
  }
}

export const templateRepository = new TemplateRepository();
