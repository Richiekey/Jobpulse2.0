import { Database } from './database.types.js';
import { SupabaseClient } from '@supabase/supabase-js';

export type JobpulsePlan = 'free' | 'pro_monthly' | 'pro_annual';

export interface Entitlements {
  plan: JobpulsePlan;
  can_browse_jobs: boolean;
  can_use_advanced_filters: boolean;
  max_saved_jobs: number;
  max_active_alerts: number;
  can_track_applications: boolean;
  max_tracked_applications: number;
  can_use_resume_tools: boolean;
  can_view_application_analytics: boolean;
}

export const FREE_ENTITLEMENTS: Entitlements = {
  plan: 'free',
  can_browse_jobs: true,
  can_use_advanced_filters: false,
  max_saved_jobs: 10,
  max_active_alerts: 2,
  can_track_applications: true,
  max_tracked_applications: 10,
  can_use_resume_tools: false,
  can_view_application_analytics: false,
};

export const PRO_ENTITLEMENTS: Omit<Entitlements, 'plan'> = {
  can_browse_jobs: true,
  can_use_advanced_filters: true,
  max_saved_jobs: Infinity,
  max_active_alerts: Infinity,
  can_track_applications: true,
  max_tracked_applications: Infinity,
  can_use_resume_tools: true,
  can_view_application_analytics: true,
};

/**
 * Returns the effective entitlements for a user based on their active subscription.
 * Defaults safely to FREE if no subscription is found, or if the billing state cannot be trusted.
 */
export async function getUserEntitlements(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Entitlements> {
  if (!userId) return FREE_ENTITLEMENTS;

  const { data: subscription, error } = await supabase
    .from('subscriptions')
    .select(`
      status,
      billing_plans (
        code
      )
    `)
    .eq('user_id', userId)
    .in('status', ['active', 'non_renewing', 'attention'])
    .maybeSingle();

  if (error || !subscription) {
    return FREE_ENTITLEMENTS;
  }

  const planCode = Array.isArray(subscription.billing_plans) 
    ? subscription.billing_plans[0]?.code 
    : subscription.billing_plans?.code;

  if (planCode === 'pro_monthly' || planCode === 'pro_annual') {
    return {
      ...PRO_ENTITLEMENTS,
      plan: planCode as JobpulsePlan,
    };
  }

  return FREE_ENTITLEMENTS;
}
