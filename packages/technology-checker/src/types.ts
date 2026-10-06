export interface TechnologyBasic {
  id: number;
  name: string;
  category?: string;
}

export interface LookupTechnologyByNameResponse {
  success: boolean;
  data: {
    exists: boolean;
    technology?: TechnologyBasic;
  };
}

export interface TechnologyDomainInfo {
  domain: string;
  first_detected: string;
  last_detected: string;
}

export interface FindDomainsByTechnologyResponse {
  success: boolean;
  data: {
    technology: TechnologyBasic;
    domains: TechnologyDomainInfo[];
    count: number;
  };
}

export interface Company {
  name: string;
  industry: string;
  industry_code: number;
  employees: string;
  country: string;
  city?: string;
  state?: string;
  founded?: number;
  company_type: string;
}

export interface GetCompaniesByTechnologyResponse {
  success: boolean;
  data: {
    technology: TechnologyBasic;
    companies: (Company & { domain: string })[];
    total: number;
    limit: number;
    offset: number;
  };
}

export interface TechnologySignal {
  domain: string;
  technology: TechnologyBasic;
  company?: Company;
  detected_at: string;
}

export interface GetAdoptionSignalsResponse {
  success: boolean;
  data: {
    signals: TechnologySignal[];
    total: number;
    limit: number;
    offset: number;
  };
}

export interface GetChurnSignalsResponse {
  success: boolean;
  data: {
    signals: TechnologySignal[];
    total: number;
    limit: number;
    offset: number;
  };
}
