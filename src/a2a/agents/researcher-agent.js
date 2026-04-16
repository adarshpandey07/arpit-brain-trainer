/**
 * RESEARCHER AGENT — Finds trending niches and template ideas
 *
 * This agent:
 *   1. Uses Claude to brainstorm high-demand, low-competition niches
 *   2. Publishes discoveries to "trending-niche" topic
 *   3. Builder agent picks up and builds what's trending
 *   4. Saves research findings to brain memory for future cycles
 */

import { Agent } from '../agent.js';
import { log } from '../../logger.js';

export class ResearcherAgent extends Agent {
  constructor(config) {
    super(config);

    // Listen for analyst insights — might refine research direction
    this.bus.subscribe(this.id, 'performance-insight', (msg) => {
      log(`[A2A:Researcher] Got analyst insight: ${JSON.stringify(msg.data).slice(0, 100)}`);
    });
  }

  async plan() {
    const existingIds = this.catalog.map(t => t.id);
    return `Research trending Google Sheets template niches NOT already in catalog: [${existingIds.join(', ')}]`;
  }

  async execute(plan) {
    const existingNames = this.catalog.map(t => `${t.name} ($${t.price})`).join('\n  ');

    const prompt = `You are a market researcher for Etsy digital products. Find 3 NEW Google Sheets template ideas that are:
- HIGH demand (people actively searching for them)
- LOW competition (fewer than 500 results on Etsy)
- NOT already in our catalog

OUR EXISTING CATALOG:
  ${existingNames}

Consider trending topics: AI tools, side hustles 2026, crypto portfolios, home renovation budgets, pet expense trackers, FIRE movement, digital nomad tools.

For each idea provide:
1. Template name
2. Suggested price
3. Why it will sell (demand signal)
4. Top 5 SEO tags

RESPOND WITH JSON (no markdown):
{
  "ideas": [
    {"name": "...", "price": "X.99", "demandSignal": "...", "tags": ["tag1","tag2","tag3","tag4","tag5"]},
    ...
  ],
  "marketInsight": "one sentence about what's trending right now"
}`;

    try {
      const response = await this.askClaude(prompt);

      let parsed;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : response);
      } catch {
        return { success: false, action: 'research', output: 'Failed to parse research results' };
      }

      // Publish each idea to the bus — Builder can pick these up
      if (parsed.ideas) {
        for (const idea of parsed.ideas) {
          this.addFinding('trending-niche', {
            name: idea.name,
            price: idea.price,
            demand: idea.demandSignal,
            tags: idea.tags,
          });
        }

        // Share market insight
        if (parsed.marketInsight) {
          this.setShared('market-insight', parsed.marketInsight);
        }
      }

      return {
        success: true,
        action: 'research',
        output: `Found ${parsed.ideas?.length || 0} new ideas. Market: ${parsed.marketInsight || 'N/A'}`,
        ideas: parsed.ideas,
      };

    } catch (err) {
      return { success: false, action: 'research', output: err.message };
    }
  }
}
