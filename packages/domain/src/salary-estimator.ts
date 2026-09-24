/**
 * JobPulse Instant Salary Estimator
 *
 * Provides realistic estimated compensation ranges when listings omit explicit salary.
 * Uses domain baselines, seniority multipliers, and localized cost-of-living adjustments.
 */

export interface SalaryEstimateResult {
  min: number;
  max: number;
  currency: string;
  period: 'yearly' | 'hourly';
  confidence: 'High' | 'Medium' | 'Estimated';
  formatted: string;
}

export class SalaryEstimator {
  /**
   * Formats a numeric value into a concise salary string (e.g. 145000 -> 145k)
   */
  private static formatAmount(val: number): string {
    if (val >= 1000) {
      const k = val / 1000;
      return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
    }
    return val.toString();
  }

  /**
   * Estimates compensation range based on job title and location.
   */
  public static estimateJobSalary(
    title: string | null | undefined,
    location?: string | null
  ): SalaryEstimateResult | null {
    if (!title || typeof title !== 'string' || !title.trim()) return null;

    const t = title.toLowerCase();
    const loc = (location || '').toLowerCase();

    // Base ranges for core tech & engineering domains (annual in USD for US mid-level)
    let baseMin = 110_000;
    let baseMax = 155_000;

    // 1. Domain / Role Adjustment
    if (
      t.includes('ai ') ||
      t.includes('artificial intelligence') ||
      t.includes('machine learning') ||
      t.includes('llm') ||
      t.includes('deep learning') ||
      t.includes('nlp') ||
      t.includes('research scientist')
    ) {
      baseMin = 145_000;
      baseMax = 210_000;
    } else if (
      t.includes('security') ||
      t.includes('cyber') ||
      t.includes('infosec') ||
      t.includes('appsec')
    ) {
      baseMin = 135_000;
      baseMax = 190_000;
    } else if (
      t.includes('staff') ||
      t.includes('principal') ||
      t.includes('architect')
    ) {
      baseMin = 185_000;
      baseMax = 265_000;
    } else if (
      t.includes('devops') ||
      t.includes('sre') ||
      t.includes('reliability') ||
      t.includes('infrastructure') ||
      t.includes('platform')
    ) {
      baseMin = 130_000;
      baseMax = 180_000;
    } else if (t.includes('data engineer') || t.includes('analytics engineer')) {
      baseMin = 125_000;
      baseMax = 175_000;
    } else if (t.includes('data scientist')) {
      baseMin = 130_000;
      baseMax = 180_000;
    } else if (t.includes('data analyst') || t.includes('business analyst') || t.includes('bi analyst')) {
      baseMin = 85_000;
      baseMax = 125_000;
    } else if (t.includes('product manager') || t.includes('group product') || t.includes('tpm')) {
      baseMin = 135_000;
      baseMax = 195_000;
    } else if (t.includes('product designer') || t.includes('ui/ux') || t.includes('ux designer')) {
      baseMin = 105_000;
      baseMax = 155_000;
    } else if (t.includes('account executive') || t.includes('sales engineer') || t.includes('solutions engineer')) {
      baseMin = 100_000;
      baseMax = 160_000;
    } else if (t.includes('qa') || t.includes('sdet') || t.includes('test') || t.includes('quality assurance')) {
      baseMin = 95_000;
      baseMax = 140_000;
    } else if (
      t.includes('full stack') ||
      t.includes('fullstack') ||
      t.includes('backend') ||
      t.includes('frontend') ||
      t.includes('software engineer') ||
      t.includes('software developer')
    ) {
      baseMin = 120_000;
      baseMax = 170_000;
    }

    // 2. Seniority Multiplier
    let multiplier = 1.0;
    let confidence: 'High' | 'Medium' | 'Estimated' = 'Medium';

    if (t.includes('intern') || t.includes('internship') || t.includes('co-op')) {
      const min = 40;
      const max = 65;
      return {
        min,
        max,
        currency: '$',
        period: 'hourly',
        confidence: 'High',
        formatted: `~$${min} - $${max}/hr (est.)`,
      };
    } else if (t.includes('junior') || t.includes('entry') || t.includes('associate') || t.includes('grad')) {
      multiplier = 0.72;
      confidence = 'High';
    } else if (t.includes('senior') || t.includes('sr.') || t.includes('sr ')) {
      multiplier = 1.28;
      confidence = 'High';
    } else if (t.includes('lead') || t.includes('tech lead')) {
      multiplier = 1.40;
      confidence = 'Medium';
    } else if (t.includes('staff') || t.includes('principal')) {
      multiplier = 1.65;
      confidence = 'High';
    } else if (t.includes('director') || t.includes('head of') || t.includes('vp') || t.includes('vice president')) {
      multiplier = 1.95;
      confidence = 'Medium';
    }

    // 3. Location / Currency Adjustment
    let currency = '$';
    let locMultiplier = 1.0;

    if (
      loc.includes('united kingdom') ||
      loc.includes('london') ||
      loc.includes('uk') ||
      loc.includes('england') ||
      loc.includes('scotland') ||
      loc.includes('wales')
    ) {
      currency = '£';
      locMultiplier = 0.65; // GBP localized tech range
    } else if (
      loc.includes('germany') ||
      loc.includes('berlin') ||
      loc.includes('munich') ||
      loc.includes('france') ||
      loc.includes('paris') ||
      loc.includes('amsterdam') ||
      loc.includes('netherlands') ||
      loc.includes('europe') ||
      loc.includes('eu') ||
      loc.includes('ireland') ||
      loc.includes('dublin')
    ) {
      currency = '€';
      locMultiplier = 0.72; // EUR localized tech range
    } else if (
      loc.includes('canada') ||
      loc.includes('toronto') ||
      loc.includes('vancouver') ||
      loc.includes('montreal') ||
      loc.includes('ontario') ||
      loc.includes('british columbia')
    ) {
      currency = 'CAD $';
      locMultiplier = 1.05; // CAD adjustment
    } else if (
      loc.includes('san francisco') ||
      loc.includes('sf') ||
      loc.includes('bay area') ||
      loc.includes('new york') ||
      loc.includes('nyc') ||
      loc.includes('manhattan') ||
      loc.includes('sunnyvale') ||
      loc.includes('mountain view') ||
      loc.includes('palo alto') ||
      loc.includes('san jose')
    ) {
      locMultiplier = 1.18; // Tier 1 US Tech Hub premium
    } else if (
      loc.includes('seattle') ||
      loc.includes('los angeles') ||
      loc.includes('boston') ||
      loc.includes('austin')
    ) {
      locMultiplier = 1.08;
    }

    const finalMin = Math.round((baseMin * multiplier * locMultiplier) / 5000) * 5000;
    const finalMax = Math.round((baseMax * multiplier * locMultiplier) / 5000) * 5000;

    const minFormatted = SalaryEstimator.formatAmount(finalMin);
    const maxFormatted = SalaryEstimator.formatAmount(finalMax);

    return {
      min: finalMin,
      max: finalMax,
      currency,
      period: 'yearly',
      confidence,
      formatted: `~${currency}${minFormatted} - ${currency}${maxFormatted}/yr (est.)`,
    };
  }
}
