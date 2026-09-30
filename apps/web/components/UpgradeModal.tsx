'use client';

import React, { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import { Check, Loader2 } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export function UpgradeModal({ 
  isOpen, 
  onClose,
  title = "Upgrade to Jobpulse Pro",
  description = "Unlock unlimited saved jobs, advanced filters, and premium application tracking."
}: UpgradeModalProps) {
  const [loadingPlan, setLoadingPlan] = useState<'pro_monthly' | 'pro_annual' | null>(null);
  const [error, setError] = useState('');

  const handleUpgrade = async (planId: 'pro_monthly' | 'pro_annual') => {
    try {
      setLoadingPlan(planId);
      setError('');
      
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize checkout');
      }
      
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      }
    } catch (err: any) {
      setError(err.message);
      setLoadingPlan(null);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={title} 
      description={description}
      size="lg"
    >
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* Monthly Plan */}
        <div className="border rounded-lg p-6 flex flex-col relative overflow-hidden">
          <h3 className="text-lg font-semibold">Pro Monthly</h3>
          <div className="mt-4 mb-6">
            <span className="text-3xl font-bold">₦7,500</span>
            <span className="text-muted-foreground text-sm">/month</span>
          </div>
          
          <ul className="space-y-3 mb-8 flex-1">
            {['Unlimited job discovery', 'Advanced filters & alerts', 'Unlimited saved jobs', 'Premium resume tools'].map((feat, i) => (
              <li key={i} className="flex items-start text-sm">
                <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                <span>{feat}</span>
              </li>
            ))}
          </ul>

          <Button 
            className="w-full" 
            onClick={() => handleUpgrade('pro_monthly')}
            disabled={loadingPlan !== null}
          >
            {loadingPlan === 'pro_monthly' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Subscribe Monthly
          </Button>
        </div>

        {/* Annual Plan */}
        <div className="border border-blue-500 rounded-lg p-6 flex flex-col relative overflow-hidden shadow-sm bg-blue-50/30">
          <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
            SAVE 16%
          </div>
          <h3 className="text-lg font-semibold text-blue-900">Pro Annual</h3>
          <div className="mt-4 mb-6">
            <span className="text-3xl font-bold text-blue-900">₦75,000</span>
            <span className="text-blue-700/70 text-sm">/year</span>
          </div>
          
          <ul className="space-y-3 mb-8 flex-1">
            {['All Monthly features', 'Priority support', 'Early access to new features', '2 months free'].map((feat, i) => (
              <li key={i} className="flex items-start text-sm text-blue-900/80">
                <Check className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
                <span>{feat}</span>
              </li>
            ))}
          </ul>

          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700" 
            onClick={() => handleUpgrade('pro_annual')}
            disabled={loadingPlan !== null}
          >
            {loadingPlan === 'pro_annual' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Subscribe Annually
          </Button>
        </div>
      </div>
      
      <div className="mt-4 text-center text-xs text-muted-foreground">
        Payments are securely processed via Paystack. You can cancel at any time.
      </div>
    </Modal>
  );
}
