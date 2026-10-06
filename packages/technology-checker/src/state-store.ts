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
  crawl_job_count: number | null;
  crawl_eligible_job_count: number;
  crawl_rejected_job_count: number;
  promotion_status: string | null;
  first_discovered_at: string | null;
  last_success_at: string | null;
  priority_score: number | null;
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
          if (record[key] !== value) {
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
        if (record[key] !== value) {
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
  
  // Test helper
  getAllRecords(): DiscoveryRecord[] {
    return Array.from(this.records.values());
  }
}
