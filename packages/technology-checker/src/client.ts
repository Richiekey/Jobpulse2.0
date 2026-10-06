import { httpClient, HttpError } from '@jobpulse/shared';
import {
  LookupTechnologyByNameResponse,
  FindDomainsByTechnologyResponse,
  GetCompaniesByTechnologyResponse,
  GetAdoptionSignalsResponse,
  GetChurnSignalsResponse,
} from './types.js';

export class TechnologyCheckerClient {
  private readonly baseUrl = 'https://api.technologychecker.io/v1';
  private readonly apiKey: string;
  private readonly techIdCache = new Map<string, number | null>(); // null = doesn't exist

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('TechnologyChecker API key is required');
    }
    this.apiKey = apiKey;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };
  }

  /**
   * Resolves a technology name to its TechnologyChecker ID.
   * Caches the result in-memory to prevent redundant lookups.
   */
  public async getTechnologyId(name: string): Promise<number | null> {
    const normalized = name.toLowerCase();
    
    if (this.techIdCache.has(normalized)) {
      return this.techIdCache.get(normalized)!;
    }

    try {
      const encodedName = encodeURIComponent(name);
      const res = await httpClient.get<LookupTechnologyByNameResponse>(
        `${this.baseUrl}/technology/name/${encodedName}`,
        { headers: this.headers }
      );

      if (res.data.data.exists && res.data.data.technology) {
        const id = res.data.data.technology.id;
        this.techIdCache.set(normalized, id);
        return id;
      }

      this.techIdCache.set(normalized, null);
      return null;
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        this.techIdCache.set(normalized, null);
        return null;
      }
      throw err;
    }
  }

  /**
   * Get domains using a specific technology by its ID.
   */
  public async getDomainsByTechnology(name: string, limit = 100): Promise<FindDomainsByTechnologyResponse['data']> {
    const encodedName = encodeURIComponent(name);
    const res = await httpClient.get<FindDomainsByTechnologyResponse>(
      `${this.baseUrl}/technology/name/${encodedName}/domains?limit=${limit}`,
      { headers: this.headers }
    );
    return res.data.data;
  }

  /**
   * Get companies using a specific technology, with pagination and optional filters.
   */
  public async getCompaniesByTechnology(
    id: number,
    options: {
      limit?: number;
      offset?: number;
      country?: string;
      industry?: string;
    } = {}
  ): Promise<GetCompaniesByTechnologyResponse['data']> {
    const url = new URL(`${this.baseUrl}/technology/${id}/companies`);
    if (options.limit !== undefined) url.searchParams.set('limit', options.limit.toString());
    if (options.offset !== undefined) url.searchParams.set('offset', options.offset.toString());
    if (options.country) url.searchParams.set('country', options.country);
    if (options.industry) url.searchParams.set('industry', options.industry);

    const res = await httpClient.get<GetCompaniesByTechnologyResponse>(url.toString(), {
      headers: this.headers,
    });
    return res.data.data;
  }

  /**
   * Get adoption signals (companies that recently adopted an ATS).
   */
  public async getAdoptionSignals(
    options: { limit?: number; offset?: number; technology_id?: number; days?: number } = {}
  ): Promise<GetAdoptionSignalsResponse['data']> {
    const url = new URL(`${this.baseUrl}/signals/adoption`);
    if (options.limit !== undefined) url.searchParams.set('limit', options.limit.toString());
    if (options.offset !== undefined) url.searchParams.set('offset', options.offset.toString());
    if (options.technology_id !== undefined) url.searchParams.set('technology_id', options.technology_id.toString());
    if (options.days !== undefined) url.searchParams.set('days', options.days.toString());

    const res = await httpClient.get<GetAdoptionSignalsResponse>(url.toString(), {
      headers: this.headers,
    });
    return res.data.data;
  }

  /**
   * Get churn signals (companies that recently dropped an ATS).
   */
  public async getChurnSignals(
    options: { limit?: number; offset?: number; technology_id?: number; days?: number } = {}
  ): Promise<GetChurnSignalsResponse['data']> {
    const url = new URL(`${this.baseUrl}/signals/churn`);
    if (options.limit !== undefined) url.searchParams.set('limit', options.limit.toString());
    if (options.offset !== undefined) url.searchParams.set('offset', options.offset.toString());
    if (options.technology_id !== undefined) url.searchParams.set('technology_id', options.technology_id.toString());
    if (options.days !== undefined) url.searchParams.set('days', options.days.toString());

    const res = await httpClient.get<GetChurnSignalsResponse>(url.toString(), {
      headers: this.headers,
    });
    return res.data.data;
  }
}
