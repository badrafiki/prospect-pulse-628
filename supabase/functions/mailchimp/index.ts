import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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
  const authHeader = `Basic ${btoa(`anystring:${MAILCHIMP_API_KEY}`)}`;

  try {
    const { action, ...params } = await req.json();

    if (action === 'list-audiences') {
      const res = await fetch(`${baseUrl}/lists?count=100`, {
        headers: { Authorization: authHeader },
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

    if (action === 'push-contacts') {
      const { listId, contacts } = params;
      if (!listId || !contacts?.length) {
        return new Response(JSON.stringify({ error: 'listId and contacts required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Use batch subscribe/update endpoint
      const members = contacts
        .filter((c: any) => c.emailAddress) // skip rows without email
        .map((c: any) => ({
          email_address: c.emailAddress,
          status_if_new: 'subscribed',
          merge_fields: {
            FNAME: c.personName?.split(' ')[0] || '',
            LNAME: c.personName?.split(' ').slice(1).join(' ') || '',
            COMPANY: c.companyName || '',
            WEBSITE: c.website || '',
          },
          tags: c.tags ? c.tags.split(', ').filter(Boolean) : [],
        }));

      if (members.length === 0) {
        return new Response(JSON.stringify({ error: 'No contacts with email addresses to push' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const res = await fetch(`${baseUrl}/lists/${listId}`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members,
          update_existing: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to push contacts');

      return new Response(JSON.stringify({
        new_members: data.new_members?.length || 0,
        updated_members: data.updated_members?.length || 0,
        error_count: data.error_count || 0,
        errors: (data.errors || []).slice(0, 5),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
