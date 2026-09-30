import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PaystackClient } from '@/lib/paystack';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-paystack-signature');
    const paystack = new PaystackClient();

    if (!paystack.verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    const data = payload.data;
    
    // Use deterministic event ID if not explicitly provided by Paystack payload
    const eventId = data.id ? String(data.id) : `${event}-${Date.now()}`;
    
    const supabase = createAdminClient();

    // Idempotency Check
    const { data: existingEvent, error: checkError } = await supabase
      .from('billing_webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();

    if (existingEvent) {
      // Event already processed
      return NextResponse.json({ status: 'ignored', reason: 'idempotent' });
    }

    // Record Event (Pending)
    const { error: insertError } = await supabase
      .from('billing_webhook_events')
      .insert({
        provider: 'paystack',
        event_id: eventId,
        event_type: event,
        payload: payload,
        status: 'pending'
      });

    if (insertError) {
      console.error('Webhook insert error:', insertError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    try {
      if (event === 'charge.success') {
        await handleChargeSuccess(supabase, data, eventId);
      } else if (event === 'subscription.create') {
        await handleSubscriptionCreate(supabase, data);
      } else if (event === 'subscription.not_renew' || event === 'subscription.disable') {
        await handleSubscriptionCancel(supabase, data);
      } else if (event === 'invoice.payment_failed') {
        await handlePaymentFailed(supabase, data);
      } else if (event === 'invoice.update') {
        await handleInvoiceUpdate(supabase, data);
      }

      // Mark Event as Processed
      await supabase
        .from('billing_webhook_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('event_id', eventId);

      return NextResponse.json({ status: 'success' });
    } catch (err: any) {
      console.error(`Webhook processing error for ${event}:`, err);
      // Mark Event as Failed
      await supabase
        .from('billing_webhook_events')
        .update({ status: 'failed', error_message: err.message, processed_at: new Date().toISOString() })
        .eq('event_id', eventId);
      return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Webhook parse error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleChargeSuccess(supabase: any, data: any, eventId: string) {
  // If it's a subscription payment, we record the payment and update the subscription state if needed
  const metadata = data.metadata;
  const userId = metadata?.user_id;

  if (userId) {
    let subscriptionId = null;
    
    // Create Payment
    await supabase.from('payments').insert({
      user_id: userId,
      provider: 'paystack',
      provider_transaction_id: String(data.id),
      reference: data.reference,
      amount: data.amount / 100, // Kobo to Naira
      currency: data.currency,
      status: 'success',
      payment_type: 'subscription_charge',
      paid_at: new Date(data.paid_at).toISOString(),
      raw_event_id: eventId
    });

    // If we have subscription code, sync it up
    // Usually Paystack charge.success comes with plan code if it created a sub.
    if (data.plan) {
      const planCode = data.plan.plan_code;
      // Get Jobpulse plan ID
      const { data: planData } = await supabase.from('billing_plans').select('id').eq('provider_plan_code', planCode).maybeSingle();
      
      if (planData) {
         // Create active subscription since charge succeeded
         await supabase.from('subscriptions').upsert({
           user_id: userId,
           plan_id: planData.id,
           provider: 'paystack',
           provider_customer_id: data.customer.customer_code,
           provider_email: data.customer.email,
           status: 'active',
           currency: data.currency,
           amount: data.amount / 100,
           interval: data.plan.interval || 'monthly',
         }, { onConflict: 'provider_subscription_id' });
      }
    }
  }
}

async function handleSubscriptionCreate(supabase: any, data: any) {
  const customerCode = data.customer.customer_code;
  const planCode = data.plan.plan_code;
  const subCode = data.subscription_code;
  const email = data.customer.email;

  // Since we might not have `user_id` inside subscription.create natively (unless we passed it during init and Paystack returns it here),
  // we try to locate the user by customer code (if previously saved) or email.
  const { data: userSub } = await supabase.from('subscriptions')
    .select('user_id')
    .eq('provider_customer_id', customerCode)
    .maybeSingle();

  let userId = userSub?.user_id;
  if (!userId) {
     const { data: profile } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
     userId = profile?.id;
  }

  if (userId) {
     const { data: planData } = await supabase.from('billing_plans').select('id').eq('provider_plan_code', planCode).maybeSingle();
     if (planData) {
       await supabase.from('subscriptions').upsert({
           user_id: userId,
           plan_id: planData.id,
           provider: 'paystack',
           provider_customer_id: customerCode,
           provider_subscription_id: subCode,
           provider_email: email,
           status: data.status === 'active' ? 'active' : 'attention',
           currency: data.plan.currency,
           amount: data.plan.amount / 100,
           interval: data.plan.interval,
           current_period_start: new Date(data.createdAt).toISOString(),
           current_period_end: new Date(data.next_payment_date).toISOString()
       }, { onConflict: 'provider_subscription_id' });
     }
  }
}

async function handleSubscriptionCancel(supabase: any, data: any) {
  // subscription.disable or subscription.not_renew
  const subCode = data.subscription_code;
  await supabase.from('subscriptions')
    .update({ 
      status: 'non_renewing',
      cancelled_at: new Date().toISOString()
    })
    .eq('provider_subscription_id', subCode);
}

async function handlePaymentFailed(supabase: any, data: any) {
  const subCode = data.subscription.subscription_code;
  if (subCode) {
    await supabase.from('subscriptions')
      .update({ status: 'attention' })
      .eq('provider_subscription_id', subCode);
  }
}

async function handleInvoiceUpdate(supabase: any, data: any) {
  const subCode = data.subscription.subscription_code;
  if (subCode) {
    // invoice.update typically fires when a subscription renews
    await supabase.from('subscriptions')
      .update({ 
         status: 'active',
         current_period_start: new Date(data.period_start).toISOString(),
         current_period_end: new Date(data.period_end).toISOString()
      })
      .eq('provider_subscription_id', subCode);
  }
}
