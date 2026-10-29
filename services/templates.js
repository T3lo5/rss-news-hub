import { templateRepository } from '../src/db/repositories/index.js';
import { withHumanVoice } from './ai.service.js';

export async function loadTemplates() {
  return templateRepository.findAll();
}

export function getDefaultTemplateId(type) {
  return templateRepository.getDefaultTemplateIds()[type];
}

export async function getTemplateSystemPrompt(templateId, variables = {}) {
  const base = await templateRepository.getSystemPrompt(templateId, variables);
  const lang = variables.language === 'pt' || variables.language === 'pt-BR' ? 'pt' : 'en';
  return withHumanVoice(base, lang);
}

export async function createTemplate(template) {
  return templateRepository.create({
    id: template.id,
    name: template.name,
    type: template.type,
    systemPrompt: template.systemPrompt,
    variables: JSON.stringify(template.variables || []),
    isBuiltin: false,
  });
}

export async function updateTemplate(id, updates) {
  return templateRepository.update(id, updates);
}

export async function deleteTemplate(id) {
  return templateRepository.delete(id);
}

export function __resetTemplates() {
  // No-op, database handles persistence
}

export { templateRepository };
