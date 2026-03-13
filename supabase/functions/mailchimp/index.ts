// Mailchimp integration v3
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Authenticate the caller
  const authHeader = req.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const token = authHeader?.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const MAILCHIMP_API_KEY = Deno.env.get('MAILCHIMP_API_KEY');
  if (!MAILCHIMP_API_KEY) {
    return new Response(JSON.stringify({ error: 'MAILCHIMP_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Extract data center from API key (e.g. "us21" from "xxx-us21")
  const dc = MAILCHIMP_API_KEY.split('-').pop();
  const baseUrl = `https://${dc}.api.mailchimp.com/3.0`;
  const mcAuthHeader = `Basic ${btoa(`anystring:${MAILCHIMP_API_KEY}`)}`;

  try {
    const { action, ...params } = await req.json();

    if (action === 'verify') {
      const res = await fetch(`${baseUrl}/ping`, {
        headers: { Authorization: mcAuthHeader },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Invalid API key');
      return new Response(JSON.stringify({ valid: true, accountName: data.account_name || '' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update-key') {
      const newKey = params.apiKey;
      if (!newKey || typeof newKey !== 'string' || !newKey.includes('-')) {
        return new Response(JSON.stringify({ error: 'Invalid API key format. Must be in format: key-dc (e.g. abc123-us21)' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const newDc = newKey.split('-').pop();
      const newBaseUrl = `https://${newDc}.api.mailchimp.com/3.0`;
      const newAuth = `Basic ${btoa(`anystring:${newKey}`)}`;
      const res = await fetch(`${newBaseUrl}/ping`, {
        headers: { Authorization: newAuth },
      });
      const data = await res.json();
      if (!res.ok) throw new Error('API key is invalid');
      return new Response(JSON.stringify({ valid: true, accountName: data.account_name || '' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list-audiences') {
      const res = await fetch(`${baseUrl}/lists?count=100`, {
        headers: { Authorization: mcAuthHeader },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to fetch audiences');
      
      const audiences = (data.lists || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        memberCount: l.stats?.member_count || 0,
      }));
      return new Response(JSON.stringify({ audiences }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create-audience') {
      const { name, company, fromEmail, fromName } = params;
      if (!name || !company || !fromEmail || !fromName) {
        return new Response(JSON.stringify({ error: 'name, company, fromEmail, and fromName are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const res = await fetch(`${baseUrl}/lists`, {
        method: 'POST',
        headers: { Authorization: mcAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contact: { company, address1: '', city: '', state: '', zip: '', country: 'US' },
          campaign_defaults: {
            from_name: fromName,
            from_email: fromEmail,
            subject: '',
            language: 'en',
          },
          permission_reminder: 'You signed up for updates.',
          email_type_option: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create audience');
      return new Response(JSON.stringify({ id: data.id, name: data.name }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'push-contacts') {
      const { listId, contacts } = params;
      if (!listId || !contacts?.length) {
        return new Response(JSON.stringify({ error: 'listId and contacts required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const dedupedByEmail = new Map<string, any>();
      for (const c of contacts) {
        const rawEmail = c.emailAddress;
        if (!rawEmail || typeof rawEmail !== 'string') continue;

        const normalizedEmail = rawEmail.trim().toLowerCase();
        if (!normalizedEmail) continue;

        const incomingTags = c.tags ? c.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        const current = dedupedByEmail.get(normalizedEmail);

        if (!current) {
          dedupedByEmail.set(normalizedEmail, {
            email_address: normalizedEmail,
            status_if_new: 'subscribed',
            merge_fields: {
              FNAME: c.personName?.split(' ')[0] || '',
              LNAME: c.personName?.split(' ').slice(1).join(' ') || '',
              COMPANY: c.companyName || '',
              WEBSITE: c.website || '',
            },
            tags: incomingTags,
          });
          continue;
        }

        current.merge_fields.FNAME ||= c.personName?.split(' ')[0] || '';
        current.merge_fields.LNAME ||= c.personName?.split(' ').slice(1).join(' ') || '';
        current.merge_fields.COMPANY ||= c.companyName || '';
        current.merge_fields.WEBSITE ||= c.website || '';
        current.tags = Array.from(new Set([...(current.tags || []), ...incomingTags]));
      }

      const members = Array.from(dedupedByEmail.values());

      if (members.length === 0) {
        return new Response(JSON.stringify({ error: 'No contacts with email addresses to push' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const res = await fetch(`${baseUrl}/lists/${listId}`, {
        method: 'POST',
        headers: { Authorization: mcAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ members, update_existing: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to push contacts');

      // Include error_code so the client can detect compliance issues
      const errors = (data.errors || []).map((e: any) => ({
        email_address: e.email_address,
        error: e.error,
        error_code: e.error_code || '',
      }));

      return new Response(JSON.stringify({
        new_members: data.new_members?.length || 0,
        updated_members: data.updated_members?.length || 0,
        error_count: data.error_count || 0,
        errors,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Mailchimp error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
