import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function BillingSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select(`
      id, status, current_period_end, current_period_start, amount, currency, interval, cancelled_at,
      billing_plans(name, description)
    `)
    .eq('user_id', user.id)
    .in('status', ['active', 'non_renewing', 'attention'])
    .maybeSingle();

  // Fetch payment history
  const { data: payments } = await supabase
    .from('payments')
    .select('id, amount, currency, status, paid_at, reference')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const isPro = !!subscription;
  const planName = isPro ? (subscription.billing_plans as any)?.name : 'Free';
  const planAmount = isPro ? subscription.amount : 0;
  const planCurrency = isPro ? subscription.currency : 'NGN';
  const interval = isPro ? subscription.interval : 'monthly';
  const status = isPro ? subscription.status : 'active';
  
  return (
    <div className="max-w-4xl mx-auto p-6 mt-10">
      <h1 className="text-3xl font-bold mb-8">Billing & Subscription</h1>

      <div className="bg-white rounded-lg border shadow-sm p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Current Plan</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Plan</p>
            <p className="font-medium text-lg">{planName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <p className="font-medium capitalize">{status.replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Price</p>
            <p className="font-medium">{planCurrency} {planAmount.toLocaleString()} / {interval}</p>
          </div>
          {isPro && subscription.current_period_end && (
            <div>
              <p className="text-sm text-gray-500">Next Billing Date</p>
              <p className="font-medium">{new Date(subscription.current_period_end).toLocaleDateString()}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex space-x-4">
          {isPro ? (
            <>
              {status === 'active' && (
                <form action="/api/billing/cancel" method="POST">
                  <button type="submit" className="px-4 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 text-sm font-medium transition-colors">
                    Cancel Subscription
                  </button>
                </form>
              )}
              {status === 'attention' && (
                <button className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 text-sm font-medium transition-colors">
                  Update Payment Method
                </button>
              )}
            </>
          ) : (
            <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium transition-colors">
              Upgrade to Pro
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">Payment History</h2>
        {payments && payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Date</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 rounded-tr-lg">Reference</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b">
                    <td className="px-4 py-3">
                      {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : 'Pending'}
                    </td>
                    <td className="px-4 py-3">{payment.currency} {payment.amount.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        payment.status === 'success' ? 'bg-green-100 text-green-800' :
                        payment.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{payment.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No payment history available.</p>
        )}
      </div>
    </div>
  );
}
