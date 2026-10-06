import { supabase } from '../apps/worker/src/db.js';

async function run() {
  console.log('--- Phase 9: Migration Audit & Remote Schema Verification ---');
  
  try {
    // 1. Test: TRIAL_CRAWLING is accepted
    console.log('Testing if TRIAL_CRAWLING is accepted...');
    const dummyRecord = {
      domain: 'test-audit.com',
      company_name: 'Test Audit',
      ats_provider: 'workable',
      discovery_source: 'API',
      discovery_status: 'DISCOVERED',
      verification_status: 'unverified'
    };
    const { data: q1, error: errInsert } = await supabase.from('discovery_registry').insert(dummyRecord).select('id').single();
    if (errInsert) throw new Error(`Insert failed: ${errInsert.message}`);
    
    if (q1) {
      const id = q1.id;
      const { error: e1 } = await supabase.from('discovery_registry').update({ discovery_status: 'TRIAL_CRAWLING' }).eq('id', id);
      if (e1) throw new Error(`Failed to set TRIAL_CRAWLING: ${e1.message}`);
      console.log('✅ TRIAL_CRAWLING is accepted');

      const { error: e2 } = await supabase.from('discovery_registry').update({ discovery_status: 'SUCCESS' }).eq('id', id);
      if (e2) throw new Error(`Failed to set SUCCESS: ${e2.message}`);
      console.log('✅ SUCCESS is accepted from TRIAL_CRAWLING');
      
      const { error: e3 } = await supabase.from('discovery_registry').update({ discovery_status: 'EMPTY' }).eq('id', id);
      if (e3) throw new Error(`Failed to set EMPTY: ${e3.message}`);
      console.log('✅ EMPTY is accepted from TRIAL_CRAWLING');

      const { error: e4 } = await supabase.from('discovery_registry').update({ discovery_status: 'INVALID_STATE' }).eq('id', id);
      if (!e4) throw new Error('Expected constraint violation for INVALID_STATE, but it succeeded!');
      console.log(`✅ INVALID_STATE is rejected: ${e4.message}`);
      
      await supabase.from('discovery_registry').delete().eq('id', id);
    }

    // 2. Test get_ats_observability_funnel body
    console.log('\nTesting get_ats_observability_funnel...');
    const { data: funnel, error: funnelErr } = await supabase.rpc('get_ats_observability_funnel');
    if (funnelErr) throw new Error(`Funnel error: ${funnelErr.message}`);
    console.log(`✅ get_ats_observability_funnel executed successfully. Rows returned: ${funnel ? funnel.length : 0}`);

  } catch (err) {
    console.error('❌ Audit Failed:', err);
    process.exit(1);
  }
}

run().catch(console.error);
