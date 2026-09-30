import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PaystackClient } from '@/lib/paystack';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { plan_id } = await request.json();
    if (plan_id !== 'pro_monthly' && plan_id !== 'pro_annual') {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Fetch the authoritative price and code from the database
    const { data: plan, error: planError } = await supabase
      .from('billing_plans')
      .select('amount, code')
      .eq('code', plan_id)
      .eq('is_active', true)
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 400 });
    }

    // Initialize Paystack checkout
    const paystack = new PaystackClient();
    const initializeParams = {
      email: user.email!,
      amount: plan.amount * 100, // Paystack expects amount in Kobo
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/settings/billing?checkout=success`,
      metadata: {
        user_id: user.id,
        plan_id: plan.code,
      },
    };

    const response = await paystack.initializeTransaction(initializeParams);
    
    if (response.status && response.data?.authorization_url) {
      return NextResponse.json({ authorization_url: response.data.authorization_url });
    } else {
      throw new Error(response.message || 'Failed to initialize transaction');
    }

  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
