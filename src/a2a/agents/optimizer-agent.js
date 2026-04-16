/**
 * OPTIMIZER AGENT — Improves existing Etsy listings
 *
 * This agent:
 *   1. Analyzes live listing SEO (tags, title, price)
 *   2. Uses Claude for data-driven optimization suggestions
 *   3. Shares suggestions via shared memory for Lister to use
 *   4. Listens for Analyst performance data to prioritize low-performers
 */

import { Agent } from '../agent.js';
import { log } from '../../logger.js';

export class OptimizerAgent extends Agent {
  constructor(config) {
    super(config);
    this.templateId = config.templateId;

    // Listen for analyst insights about which listings need optimization
    this.bus.subscribe(this.id, 'low-performer', (msg) => {
      log(`[A2A:Optimizer] Analyst flagged low performer: ${msg.data.templateId}`);
      // Could reprioritize if this template is different
    });
  }

  async plan() {
    const template = this.catalog.find(t => t.id === this.templateId);
    if (!template) return `skip — template ${this.templateId} not found`;
    return `Optimize SEO for ${this.templateId}: analyze title, tags, price, description`;
  }

  async execute(plan) {
    if (plan.startsWith('skip')) {
      return { success: true, action: 'skip', output: plan };
    }

    const template = this.catalog.find(t => t.id === this.templateId);

    const prompt = `You are an Etsy SEO expert for Google Sheets templates. Analyze and optimize this listing:

TEMPLATE:
  Name: ${template.name}
  Price: $${template.price}
  Title: ${template.title}
  Tags: ${template.tags?.join(', ')}

ETSY SEO RULES:
- Title max 140 chars, front-load primary keywords
- Max 13 tags, each max 20 chars
- Tags should be long-tail keywords buyers actually search
- Price should match market ($4.99-$14.99 for templates)
- Include year "2026" for freshness signal

Analyze what's good and what needs improvement. Consider competitor listings.

RESPOND WITH JSON:
{
  "currentScore": <1-10>,
  "optimizedTitle": "...",
  "optimizedTags": ["tag1", ...],
  "suggestedPrice": "X.99",
  "improvements": ["what you changed and why", ...],
  "competitorInsight": "one sentence about what top sellers do"
}`;

    try {
      const response = await this.askClaude(prompt);

      let parsed;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : response);
      } catch {
        return { success: false, action: `optimize:${this.templateId}`, output: 'Failed to parse optimization' };
      }

      // Share SEO suggestions via shared memory — Lister can use these
      this.setShared(`seo-suggestions-${this.templateId}`, {
        title: parsed.optimizedTitle,
        tags: parsed.optimizedTags,
        price: parsed.suggestedPrice,
      });

      this.addFinding('seo-optimization', {
        templateId: this.templateId,
        currentScore: parsed.currentScore,
        improvements: parsed.improvements,
        competitorInsight: parsed.competitorInsight,
      });

      return {
        success: true,
        action: `optimize:${this.templateId}`,
        output: `Score: ${parsed.currentScore}/10. ${parsed.improvements?.length || 0} improvements suggested.`,
        suggestions: parsed,
      };

    } catch (err) {
      return { success: false, action: `optimize:${this.templateId}`, output: err.message };
    }
  }
}
