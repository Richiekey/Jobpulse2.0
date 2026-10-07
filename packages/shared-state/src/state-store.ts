import { SupabaseClient } from '@supabase/supabase-js';

export interface DiscoveryRecord {
  id: string;
  domain: string;
  company_name: string;
  ats_provider: string;
  discovery_status: string;
  verification_status: string;
  adapter_status: string | null;
  board_identifier: string | null;
  detection_url: string | null;
  detection_domain?: string | null;
  country?: string | null;
  industry?: string | null;
  employees?: string | null;
  discovery_source?: string;
  discovery_confidence?: number | null;
  adapter?: string | null;
  crawl_job_count: number | null;
  crawl_jobs_inserted?: number | null;
  crawl_eligible_job_count: number;
  crawl_rejected_job_count: number;
  last_crawled_at?: string | null;
  company_source_id?: string | null;
  priority_score: number | null;
  promotion_status: string | null;
  promoted_at?: string | null;
  first_discovered_at: string | null;
  last_verified_at?: string | null;
  last_scraped_at?: string | null;
  last_success_at: string | null;
  last_failure_at?: string | null;
  discovery_providers?: string[] | null;
  discovery_evidence?: any[] | null;
  careers_url?: string | null;
  job_evidence?: any[] | null;
  job_evidence_count?: number | null;
  last_seen_at?: string | null;
  verification_attempts?: number;
  verification_error?: string | null;
  adapter_resolution_attempts?: number;
  trial_crawl_attempts?: number;
  trial_failure_reason?: string | null;
  promotion_attempted_at?: string | null;
  promotion_reason?: string | null;
  claimed_at?: string | null;
  claimed_by?: string | null;
  claim_epoch?: number;
  [key: string]: any;
}

export interface StateStore {
  /** Query records by discovery_status */
  queryByStatus(status: string, filters?: Record<string, any>, limit?: number): Promise<DiscoveryRecord[]>;

  /** Update a record's fields by ID */
  updateRecord(id: string, fields: Partial<DiscoveryRecord>): Promise<void>;

  /** Insert a new record and return its ID */
  insertRecord(record: Partial<DiscoveryRecord>): Promise<string>;

  /** Bulk update by IDs */
  bulkUpdateStatus(ids: string[], fields: Partial<DiscoveryRecord>): Promise<void>;

  /** Find a record by exact match */
  findRecord(filters: Record<string, any>): Promise<DiscoveryRecord | null>;

  /** Query all records */
  queryAll(limit?: number): Promise<DiscoveryRecord[]>;

  /** Claim candidates atomically using FOR UPDATE SKIP LOCKED (MC-1) */
  claimCandidates(
    status: string,
    workerId: string,
    limit?: number,
    leaseIntervalMinutes?: number
  ): Promise<DiscoveryRecord[]>;

  /** Recover stale claims whose lease has expired (MC-1) */
  recoverStaleClaims(leaseIntervalMinutes?: number): Promise<number>;

  /** Renew/extend claim lease heartbeat — bumps epoch and resets claimed_at.
   *  Returns the new epoch (fencing token) or null if the claim was stolen. */
  renewClaim(id: string, workerId: string): Promise<number | null>;

  /** Release claim on a record */
  releaseClaim(id: string, workerId?: string): Promise<boolean>;
}

export class SupabaseStateStore implements StateStore {
  constructor(private readonly db: SupabaseClient) {}

  async queryByStatus(status: string, filters?: Record<string, any>, limit: number = 100): Promise<DiscoveryRecord[]> {
    let query = this.db.from('discovery_registry').select('*').eq('discovery_status', status);
    
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value === null) {
          query = query.is(key, null);
        } else {
          query = query.eq(key, value);
        }
      }
    }
    
    const { data, error } = await query.limit(limit);
    if (error) throw new Error(`Query failed: ${error.message}`);
    return data as DiscoveryRecord[];
  }

  async updateRecord(id: string, fields: Partial<DiscoveryRecord>): Promise<void> {
    const { error } = await this.db.from('discovery_registry').update(fields).eq('id', id);
    if (error) throw new Error(`Update failed: ${error.message}`);
  }

  async insertRecord(record: Partial<DiscoveryRecord>): Promise<string> {
    const { data, error } = await this.db
      .from('discovery_registry')
      .insert(record)
      .select('id')
      .single();
      
    if (error) throw new Error(`Insert failed: ${error.message}`);
    return data.id;
  }

  async bulkUpdateStatus(ids: string[], fields: Partial<DiscoveryRecord>): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db.from('discovery_registry').update(fields).in('id', ids);
    if (error) throw new Error(`Bulk update failed: ${error.message}`);
  }

  async findRecord(filters: Record<string, any>): Promise<DiscoveryRecord | null> {
    let query = this.db.from('discovery_registry').select('*');
    for (const [key, value] of Object.entries(filters)) {
      if (value === null) query = query.is(key, null);
      else query = query.eq(key, value);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Find failed: ${error.message}`);
    return data as DiscoveryRecord | null;
  }

  async queryAll(limit: number = 1000): Promise<DiscoveryRecord[]> {
    const { data, error } = await this.db.from('discovery_registry').select('*').limit(limit);
    if (error) throw new Error(`QueryAll failed: ${error.message}`);
    return data as DiscoveryRecord[];
  }

  async claimCandidates(
    status: string,
    workerId: string,
    limit: number = 50,
    leaseIntervalMinutes: number = 10
  ): Promise<DiscoveryRecord[]> {
    const { data, error } = await this.db.rpc('claim_discovery_candidates', {
      p_status: status,
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_interval: `${leaseIntervalMinutes} minutes`,
    });
    if (error) throw new Error(`claimCandidates failed: ${error.message}`);
    return (data || []) as DiscoveryRecord[];
  }

  async recoverStaleClaims(leaseIntervalMinutes: number = 10): Promise<number> {
    const { data, error } = await this.db.rpc('recover_stale_discovery_claims', {
      p_lease_interval: `${leaseIntervalMinutes} minutes`,
    });
    if (error) throw new Error(`recoverStaleClaims failed: ${error.message}`);
    return (data as number) ?? 0;
  }

  async renewClaim(id: string, workerId: string): Promise<number | null> {
    const { data, error } = await this.db.rpc('renew_discovery_claim', {
      p_id: id,
      p_worker_id: workerId,
    });
    if (error) throw new Error(`renewClaim failed: ${error.message}`);
    // RPC returns the new epoch integer, or null if no row matched (claim stolen)
    return typeof data === 'number' ? data : null;
  }

  async releaseClaim(id: string, workerId?: string): Promise<boolean> {
    const { data, error } = await this.db.rpc('release_discovery_claim', {
      p_id: id,
      p_worker_id: workerId || null,
    });
    if (error) throw new Error(`releaseClaim failed: ${error.message}`);
    return Boolean(data);
  }
}

export class InMemoryStateStore implements StateStore {
  private records = new Map<string, DiscoveryRecord>();
  private nextId = 1;

  constructor(private readonly fallbackStore?: StateStore) {}

  async queryByStatus(status: string, filters?: Record<string, any>, limit: number = 100): Promise<DiscoveryRecord[]> {
    // If we have a fallback store, populate our cache first
    if (this.fallbackStore) {
      const dbRecords = await this.fallbackStore.queryByStatus(status, filters, limit);
      for (const rec of dbRecords) {
        if (!this.records.has(rec.id)) {
          this.records.set(rec.id, { ...rec });
        }
      }
    }

    const results: DiscoveryRecord[] = [];
    
    for (const record of this.records.values()) {
      if (record.discovery_status !== status) continue;
      
      let matchesFilters = true;
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value === null) {
            if (record[key] !== null && record[key] !== undefined) {
              matchesFilters = false;
              break;
            }
          } else if (record[key] !== value) {
            matchesFilters = false;
            break;
          }
        }
      }
      
      if (matchesFilters) {
        results.push({ ...record });
        if (results.length >= limit) break;
      }
    }
    
    return results;
  }

  async updateRecord(id: string, fields: Partial<DiscoveryRecord>): Promise<void> {
    // If not in memory but fallback exists, fetch it first
    if (!this.records.has(id) && this.fallbackStore) {
      const rec = await this.fallbackStore.findRecord({ id });
      if (rec) this.records.set(id, rec);
    }
    
    const record = this.records.get(id);
    if (record) {
      this.records.set(id, { ...record, ...fields });
    }
  }

  async insertRecord(record: Partial<DiscoveryRecord>): Promise<string> {
    const id = `dry-run-${this.nextId++}`;
    this.records.set(id, {
      ...record,
      id,
      crawl_eligible_job_count: record.crawl_eligible_job_count ?? 0,
      crawl_rejected_job_count: record.crawl_rejected_job_count ?? 0,
      verification_attempts: record.verification_attempts ?? 0,
      adapter_resolution_attempts: record.adapter_resolution_attempts ?? 0,
      trial_crawl_attempts: record.trial_crawl_attempts ?? 0,
    } as DiscoveryRecord);
    return id;
  }

  async bulkUpdateStatus(ids: string[], fields: Partial<DiscoveryRecord>): Promise<void> {
    for (const id of ids) {
      await this.updateRecord(id, fields);
    }
  }

  async findRecord(filters: Record<string, any>): Promise<DiscoveryRecord | null> {
    for (const record of this.records.values()) {
      let matches = true;
      for (const [key, value] of Object.entries(filters)) {
        if (value === null) {
          if (record[key] !== null && record[key] !== undefined) {
            matches = false;
            break;
          }
        } else if (record[key] !== value) {
          matches = false;
          break;
        }
      }
      if (matches) return { ...record };
    }
    
    if (this.fallbackStore) {
      const rec = await this.fallbackStore.findRecord(filters);
      if (rec) {
        this.records.set(rec.id, { ...rec });
        return { ...rec };
      }
    }
    
    return null;
  }
  
  async queryAll(limit: number = 1000): Promise<DiscoveryRecord[]> {
    if (this.fallbackStore) {
      const dbRecords = await this.fallbackStore.queryAll(limit);
      for (const rec of dbRecords) {
        if (!this.records.has(rec.id)) {
          this.records.set(rec.id, { ...rec });
        }
      }
    }
    return Array.from(this.records.values()).slice(0, limit);
  }

  async claimCandidates(
    status: string,
    workerId: string,
    limit: number = 50,
    leaseIntervalMinutes: number = 10
  ): Promise<DiscoveryRecord[]> {
    // If we have a fallback store, populate cache first
    if (this.fallbackStore) {
      const dbRecords = await this.fallbackStore.queryByStatus(status, {}, limit * 2);
      for (const rec of dbRecords) {
        if (!this.records.has(rec.id)) {
          this.records.set(rec.id, { ...rec });
        }
      }
    }

    const nowMs = Date.now();
    const leaseExpiryMs = leaseIntervalMinutes * 60 * 1000;
    const claimed: DiscoveryRecord[] = [];

    const candidates = Array.from(this.records.values())
      .filter((rec) => {
        if (rec.discovery_status !== status) return false;
        // Unclaimed: available
        if (!rec.claimed_at) return true;
        // Claimed: only re-claimable if lease has expired
        const claimTime = new Date(rec.claimed_at).getTime();
        return isNaN(claimTime) || nowMs - claimTime > leaseExpiryMs;
      })
      .sort((a, b) => {
        const scoreDiff = (b.priority_score ?? 0) - (a.priority_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        const aDate = a.first_discovered_at ? new Date(a.first_discovered_at).getTime() : 0;
        const bDate = b.first_discovered_at ? new Date(b.first_discovered_at).getTime() : 0;
        return aDate - bDate;
      })
      .slice(0, limit);

    const nowIso = new Date(nowMs).toISOString();
    for (const cand of candidates) {
      cand.claimed_at = nowIso;
      cand.claimed_by = workerId;
      cand.claim_epoch = 1;
      this.records.set(cand.id, { ...cand });
      claimed.push({ ...cand });
    }

    return claimed;
  }

  async recoverStaleClaims(leaseIntervalMinutes: number = 10): Promise<number> {
    const nowMs = Date.now();
    const leaseExpiryMs = leaseIntervalMinutes * 60 * 1000;
    let recovered = 0;

    for (const rec of this.records.values()) {
      if (rec.claimed_at) {
        const claimTime = new Date(rec.claimed_at).getTime();
        // Only recover if the claimed_at timestamp is actually past the lease window.
        // A renewed claim will have an updated claimed_at, so it won't be reclaimed.
        if (isNaN(claimTime) || nowMs - claimTime > leaseExpiryMs) {
          rec.claimed_at = null;
          rec.claimed_by = null;
          rec.claim_epoch = 0;
          this.records.set(rec.id, { ...rec });
          recovered++;
        }
      }
    }

    return recovered;
  }

  async renewClaim(id: string, workerId: string): Promise<number | null> {
    const rec = this.records.get(id);
    if (!rec) return null;
    // Only the owning worker can renew its own claim
    if (rec.claimed_by !== workerId) return null;
    if (!rec.claimed_at) return null;
    rec.claimed_at = new Date().toISOString();
    rec.claim_epoch = (rec.claim_epoch ?? 0) + 1;
    this.records.set(id, { ...rec });
    return rec.claim_epoch;
  }

  async releaseClaim(id: string, workerId?: string): Promise<boolean> {
    const rec = this.records.get(id);
    if (!rec) return false;
    if (!workerId || rec.claimed_by === workerId) {
      rec.claimed_at = null;
      rec.claimed_by = null;
      rec.claim_epoch = 0;
      this.records.set(id, { ...rec });
      return true;
    }
    return false;
  }
  
  // Test helper
  getAllRecords(): DiscoveryRecord[] {
    return Array.from(this.records.values());
  }
}
