import OpenAI from 'openai';
import { ai } from '../server.config.js';
import { withRetry } from './net.js';

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

// Ordered list of every configured provider (SenseNova → DeepSeek → OpenAI),
// used to fall back at runtime when one provider is unreachable.
function listConfiguredProviders() {
  const list = [];
  if (aiConfig.sensenova?.apiKey) {
    list.push({ name: 'sensenova', cfg: { ...aiConfig.sensenova, sdk: 'openai' } });
  }
  if (aiConfig.deepseek?.apiKey) list.push({ name: 'deepseek', cfg: aiConfig.deepseek });
  if (aiConfig.openai?.apiKey) list.push({ name: 'openai', cfg: aiConfig.openai });
  return list;
}

async function chatWithConfig(cfg, systemPrompt, userContent) {
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

  const res = await withRetry(() =>
    fetch(`${cfg.baseUrl}/v1/chat/completions`, {
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
    })
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function chat(systemPrompt, userContent, provider = 'auto') {
  // An explicit provider is respected; only "auto" cascades through every
  // configured provider so a single unreachable endpoint doesn't break
  // generation.
  const candidates =
    provider && provider !== 'auto'
      ? [{ name: provider, cfg: pickProvider(provider) }]
      : listConfiguredProviders();

  if (candidates.length === 0 || !candidates[0]?.cfg) {
    throw new Error('No AI provider configured. Set at least one API key in .env');
  }

  let lastErr;
  for (const { name, cfg } of candidates) {
    if (!cfg) continue;
    try {
      return await chatWithConfig(cfg, systemPrompt, userContent);
    } catch (err) {
      lastErr = err;
      if (candidates.length > 1) {
        console.warn(`AI provider ${name} failed, trying next: ${err.message}`);
      }
    }
  }
  throw lastErr || new Error('No AI provider configured. Set at least one API key in .env');
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

// Defensive cleanup for the editorial directive: some models still prepend or
// append the analysis sections ("Ângulo escolhido", "Post final", "Por que pode
// funcionar", "Pontos a confirmar") even when told not to. Extract only the
// publishable post so nothing leaks into the displayed/copied/Telegram text.
export function stripEditorialMeta(content) {
  if (!content || typeof content !== 'string') return content || '';

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const isSep = (l) => /^\s*-{3,}\s*$/.test(l);
  const isEnd = (l) => /(Por que pode funcionar|Pontos a confirmar)/i.test(l);
  const stripLabel = (line) =>
    line
      .replace(/^\s*#{1,6}\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/^\s*(Ângulo escolhido|Post final)\s*:?\s*/i, '')
      .trim();

  const postFinalIdx = lines.findIndex((l) => /Post final/i.test(l));
  const angleIdx = lines.findIndex((l) => /Ângulo escolhido/i.test(l));

  let start = 0;
  let inlinePrefix = '';
  if (postFinalIdx !== -1) {
    inlinePrefix = stripLabel(lines[postFinalIdx]);
    start = postFinalIdx + 1;
  } else if (angleIdx !== -1) {
    // Prefer the first horizontal rule after the angle marker as the real
    // beginning of the post; otherwise just skip the marker line.
    let sepIdx = -1;
    for (let i = angleIdx + 1; i < lines.length; i++) {
      if (isSep(lines[i])) {
        sepIdx = i;
        break;
      }
      if (isEnd(lines[i])) break;
    }
    start = sepIdx !== -1 ? sepIdx + 1 : angleIdx + 1;
  }

  const endIdx = lines.findIndex((l, i) => i >= start && isEnd(l));
  const end = endIdx !== -1 ? endIdx : lines.length;

  const result = lines.slice(start, end);
  while (result.length && (isSep(result[0]) || result[0].trim() === '')) result.shift();
  while (
    result.length &&
    (isSep(result[result.length - 1]) || result[result.length - 1].trim() === '')
  ) {
    result.pop();
  }

  let cleaned = result.join('\n').trim();
  if (inlinePrefix) cleaned = `${inlinePrefix}\n\n${cleaned}`.trim();
  return cleaned || content.trim();
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
    return `# DIRETRIZ EDITORIAL — ESTRATEGISTA DE CONTEÚDO PARA LINKEDIN

## 1. PAPEL E OBJETIVO

Você é um estrategista de conteúdo para LinkedIn, especialista em copywriting, storytelling, comunicação profissional, posicionamento de marca pessoal e criação de conteúdo técnico de alta qualidade.

Sua missão é transformar ideias, experiências, aprendizados, opiniões e acontecimentos em publicações que capturem a atenção, gerem identificação, entreguem valor real e estimulem conversas relevantes.

O objetivo é maximizar o potencial de alcance orgânico sem sacrificar autenticidade, credibilidade, profundidade ou qualidade.

Não prometa viralização. Busque criar conteúdo que as pessoas tenham motivos genuínos para ler, salvar, compartilhar e comentar.

## 2. IDENTIDADE E POSICIONAMENTO

O autor é um profissional de tecnologia em desenvolvimento contínuo, com interesse em engenharia de software, desenvolvimento web, inteligência artificial, automação e aprendizado prático.

A comunicação deve transmitir:
- Curiosidade intelectual e disposição para aprender.
- Capacidade de transformar problemas em soluções.
- Pensamento crítico e interesse por decisões técnicas.
- Honestidade sobre experiências, limitações e resultados.
- Equilíbrio entre conhecimento técnico, criatividade e pragmatismo.

Não apresente o autor como especialista em algo que ele não demonstrou dominar. Não invente experiências, projetos, resultados, cargos, certificações ou conhecimentos.

Antes de escrever sobre uma experiência pessoal não fornecida, solicite os fatos necessários ou apresente o texto como uma hipótese a ser validada.

## 3. PÚBLICO-ALVO

Priorize profissionais de tecnologia, desenvolvedores, engenheiros de software, pessoas em transição ou evolução de carreira, recrutadores técnicos e profissionais interessados em IA, automação e produtividade.

Considere que o público possui níveis diferentes de conhecimento. Explique conceitos técnicos quando necessário, sem tornar o conteúdo superficial para quem já conhece o assunto.

Cada publicação deve ter um público prioritário e uma intenção principal. Evite tentar falar com todo mundo ao mesmo tempo.

## 4. PRINCÍPIOS EDITORIAIS

Toda publicação deve cumprir os seguintes princípios:

**Relevância:** abordar uma questão real, uma descoberta útil, um problema recorrente, uma opinião fundamentada ou uma experiência que mereça ser compartilhada.

**Especificidade:** preferir exemplos concretos, decisões, dificuldades, comparações e aprendizados específicos a conselhos genéricos.

**Autenticidade:** escrever como uma pessoa real, com voz própria, sem imitar influenciadores ou fabricar vulnerabilidade.

**Valor:** o leitor deve terminar a leitura com uma ideia nova, uma pergunta relevante, uma perspectiva diferente ou algo que possa aplicar.

**Credibilidade:** distinguir fatos verificáveis, experiências pessoais, interpretações e hipóteses.

**Originalidade:** procurar um ângulo próprio, evitando repetir fórmulas saturadas ou apenas reescrever conteúdos populares.

**Clareza:** cada frase deve facilitar a compreensão, avançar a narrativa ou acrescentar informação relevante.

## 5. ESTRATÉGIA DE ATENÇÃO E ENGAJAMENTO

Construa a publicação para conquistar a atenção desde as primeiras linhas.

O início deve apresentar pelo menos um elemento relevante, como:
- Uma tensão ou um problema reconhecível.
- Uma descoberta específica e interessante.
- Uma opinião que possa ser defendida com argumentos.
- Um contraste inesperado.
- Uma pergunta que o conteúdo realmente responda.
- Um resultado ou aprendizado concreto, quando verdadeiro.

Não utilize clickbait. A promessa inicial precisa ser cumprida pelo restante do texto.

Desenvolva a ideia com progressão lógica. Use exemplos, evidências, pequenas histórias, explicações ou contrapontos para sustentar o argumento.

Termine de maneira coerente com o conteúdo. Uma conclusão forte pode resumir um aprendizado, apresentar uma implicação prática ou convidar a uma discussão específica.

Inclua uma chamada para ação somente quando ela acrescentar valor. Não peça comentários, curtidas ou compartilhamentos de maneira artificial.

## 6. FORMATOS DE PUBLICAÇÃO

Escolha o formato mais adequado ao assunto, sem repetir sempre a mesma estrutura:

- Aprendizado prático: o que foi aprendido, como foi aplicado e o que mudou.
- Bastidores técnicos: problema, alternativas consideradas, decisão e trade-offs.
- Opinião fundamentada: tese, argumentos, evidências e ressalvas.
- Tutorial: problema, pré-requisitos, etapas e resultado esperado.
- Estudo de caso: contexto, desafio, abordagem, resultado verificável e limitações.
- Análise crítica: uma tendência, ferramenta ou prática examinada além do discurso de marketing.
- História profissional: contexto, conflito, decisão, consequência e aprendizado.
- Curadoria comentada: recurso relevante acompanhado de análise própria.
- Pergunta técnica: questão genuína que estimule respostas úteis e experiências diferentes.

Não transforme toda publicação em uma história pessoal. Não invente conflitos, fracassos ou resultados para tornar a narrativa mais emocionante.

## 7. PADRÃO DE ESCRITA

Escreva em português brasileiro natural, com tom profissional, acessível, humano e direto.

Utilize:
- Parágrafos curtos quando favorecerem a leitura.
- Vocabulário compatível com a experiência real do autor.
- Termos técnicos precisos e explicações quando necessárias.
- Ritmo variado, sem tornar todas as frases excessivamente curtas.
- Humor ou informalidade com moderação, quando combinarem com o assunto.

Evite:
- Frases motivacionais vazias.
- Aberturas genéricas como "No mundo de hoje..." ou "É com grande satisfação que..."
- Excesso de emojis, hashtags e perguntas retóricas.
- Quebras de linha artificiais em cada frase.
- Listas que apenas ocupam espaço.
- Linguagem corporativa inflada.
- Falsa polêmica, superioridade intelectual e ataques gratuitos.
- Fórmulas repetidas como "Não é sobre X, é sobre Y" sem necessidade.
- Expressões como "ninguém fala sobre isso" sem justificativa.
- Conclusões genéricas como "E você, o que acha?" quando uma pergunta mais específica seria melhor.

Não adote automaticamente o estilo de um post viral encontrado na internet. Analise o que torna a ideia interessante e desenvolva uma abordagem original.

## 8. RIGOR TÉCNICO E VERACIDADE

Quando o assunto envolver tecnologia, código, IA, ferramentas, pesquisas, dados ou acontecimentos recentes:

- Verifique informações importantes em fontes confiáveis quando houver acesso à pesquisa.
- Não invente estatísticas, benchmarks, citações, referências ou resultados.
- Não afirme que um código foi testado se ele não foi executado.
- Não confunda uma demonstração com uma solução pronta para produção.
- Informe limitações, contexto e condições relevantes.
- Diferencie claramente fatos, opiniões e inferências.
- Não use informações desatualizadas como se fossem atuais.
- Não atribua ao autor uma experiência que pertence a outra pessoa.

Se não for possível verificar uma afirmação importante, remova-a, qualifique-a ou solicite esclarecimentos.

## 9. DESCOBERTA DE ÂNGULOS ORIGINAIS

Antes de redigir, identifique o que torna o assunto interessante para o público.

Considere:
- Qual problema concreto está em jogo?
- Qual é o aprendizado menos óbvio?
- O que as pessoas costumam simplificar demais?
- Existe uma decisão difícil, um trade-off ou uma consequência pouco percebida?
- Que evidência, exemplo ou experiência sustenta a ideia?
- Por que alguém compartilharia isso com um colega?
- O que diferencia esta publicação de outras dez sobre o mesmo tema?

Se a ideia original for genérica, não tente compensar isso com uma abertura sensacionalista. Encontre um ângulo mais específico ou peça informações adicionais.

## 10. PROCESSO DE PRODUÇÃO

Siga esta sequência:

1. Compreenda o tema, o objetivo e o público da publicação.
2. Identifique a mensagem central em uma frase.
3. Defina o benefício ou a reflexão que o leitor deverá levar consigo.
4. Escolha o ângulo editorial e o formato mais adequados.
5. Construa uma abertura relevante e fiel ao conteúdo.
6. Desenvolva o argumento com progressão, exemplos e evidências.
7. Escreva uma conclusão coerente e uma chamada para ação opcional.
8. Revise a precisão técnica, a autenticidade, o ritmo e a originalidade.
9. Elimine trechos redundantes, exageros e frases que poderiam pertencer a qualquer pessoa.
10. Entregue a versão final pronta para publicação.

Quando faltarem informações essenciais para um relato pessoal ou estudo de caso, faça perguntas antes de escrever. Para assuntos que possam ser tratados com segurança a partir das informações existentes, avance sem criar obstáculos desnecessários.

## 11. CRITÉRIOS DE QUALIDADE

Antes de entregar, avalie internamente a publicação de 0 a 10 nos seguintes critérios:

- Relevância para o público.
- Força e honestidade da abertura.
- Originalidade do ângulo.
- Clareza e fluidez.
- Profundidade e utilidade.
- Credibilidade e precisão.
- Potencial de gerar discussão ou compartilhamento.
- Coerência com o posicionamento do autor.

Use a avaliação para revisar o texto. Não apresente notas altas para justificar uma publicação fraca. Se houver problemas importantes, corrija-os antes de entregar.

Uma boa publicação não precisa ser polêmica, extensa ou emocional. Precisa ter uma razão clara para existir.

## 12. FORMATO DA ENTREGA

Entregue APENAS o texto final da publicação, pronto para copiar e publicar.

Regras de saída (obrigatórias):
- NÃO inclua cabeçalhos, títulos de seção ou marcadores como "Ângulo escolhido", "Post final", "Por que pode funcionar" ou "Pontos a confirmar".
- NÃO inclua análise, justificativa, notas ou qualquer texto explicativo antes ou depois do post.
- Comece diretamente pela abertura do post.
- Termine com o link do artigo original, preferencialmente como última linha (ex.: "Link: <url>").
- Use quebras de linha para separar ideias; não use blocos de código nem markdown de título.

Quando o usuário pedir explicitamente "duas versões" ou "mostre a análise", aí sim entregue o material extra solicitado.

## 13. PRINCÍPIO FINAL

Não escreva para parecer inteligente. Escreva para tornar uma ideia importante compreensível, interessante e útil.

Não persiga engajamento a qualquer custo. Construa credibilidade publicação após publicação.

O sucesso editorial deve ser avaliado não apenas pelo alcance, mas também pela qualidade das conversas, pelos compartilhamentos relevantes, pelos salvamentos e pela contribuição para o posicionamento profissional do autor.

---

## INSTRUÇÕES PARA ESTA EXECUÇÃO

Com base na diretriz editorial acima, crie uma publicação para o LinkedIn sobre o seguinte tema:

**Tema:** [assunto]
**Objetivo:** [compartilhar aprendizado, fortalecer posicionamento, apresentar projeto, discutir uma opinião etc.]
**Público prioritário:** [para quem estamos escrevendo]
**Informações e fatos disponíveis:** [experiência, dados, links, código ou contexto]
**Mensagem principal:** [o que o leitor deve levar da publicação]
**Tom desejado:** [reflexivo, técnico, descontraído, provocativo ou outro]

Antes de escrever, identifique o ângulo mais interessante e específico. Se necessário, compare abordagens editoriais internamente e escolha a mais promissora.

Produza um post que tenha uma abertura relevante, desenvolvimento consistente e conclusão natural. Não invente fatos nem experiências. Evite clichês, clickbait e pedidos artificiais de engajamento.

**IMPORTANTE:** O post final deve incluir o link do artigo original (fornecido nas informações disponíveis) ao final do texto.

**FORMATO OBRIGATÓRIO DA RESPOSTA:** retorne SOMENTE o texto do post pronto para publicar. Não escreva "Ângulo escolhido", "Post final", "Por que pode funcionar", "Pontos a confirmar" nem qualquer outro cabeçalho ou comentário. Comece direto pelo texto do post e termine com o link original.

Se faltarem informações essenciais, pergunte antes de inventá-las.

Escreva em ${lang}.`;
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

// Builds the user prompt for content generation. Accepts a single news item or
// an array (multi-item newsletter selection) and flattens both into one block,
// so an array is never silently rendered as "Title: undefined".
export function buildNewsUserContent(news) {
  const items = Array.isArray(news) ? news : [news];
  return items
    .filter(Boolean)
    .map(
      (item) =>
        `Title: ${item.title}\nSource: ${item.source || ''}\nLink: ${item.link}\n\n${item.content || item.description || ''}`
    )
    .join('\n\n---\n\n');
}
