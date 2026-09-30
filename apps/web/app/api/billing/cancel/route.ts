import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Usually we would call Paystack API to cancel/disable the subscription here.
    // For now, we'll optimistically update the DB status to non_renewing.
    // In production, you would fetch the subscription_code, call Paystack, and let the webhook update the DB.

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('provider_subscription_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (sub?.provider_subscription_id) {
       // Mocking Paystack cancellation request
       // fetch(`https://api.paystack.co/subscription/disable`, { ... })
       
       await supabase
         .from('subscriptions')
         .update({ status: 'non_renewing' })
         .eq('user_id', user.id)
         .eq('status', 'active');
    }

    return NextResponse.redirect(new URL('/settings/billing', request.url));

  } catch (error) {
    console.error('Cancel error:', error);
    return NextResponse.redirect(new URL('/settings/billing?error=cancel_failed', request.url));
  }
}
