import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_id, url } = await req.json();

    if (!company_id || !url) {
      return new Response(
        JSON.stringify({ success: false, error: 'company_id and url are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auth
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify ownership
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', company_id)
      .eq('user_id', user.id)
      .single();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ success: false, error: 'Company not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to Processing
    await supabase.from('companies').update({ processing_status: 'Processing' }).eq('id', company_id);

    // Scrape the website with Firecrawl
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      await supabase.from('companies').update({ processing_status: 'Error' }).eq('id', company_id);
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scraping:', url);

    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok || !scrapeData.success) {
      console.error('Scrape failed:', scrapeData);
      await supabase.from('companies').update({ processing_status: 'Error' }).eq('id', company_id);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to scrape website' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    const truncatedContent = markdown.slice(0, 8000);

    // Analyze with AI
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) {
      await supabase.from('companies').update({ processing_status: 'Error' }).eq('id', company_id);
      return new Response(
        JSON.stringify({ success: false, error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing with AI...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: `You are a B2B lead qualification analyst. Analyze website content and return a JSON object with these fields:
- summary: 2-3 sentence description of the company
- industries: array of up to 5 industry tags (e.g. "Manufacturing", "CNC Machining")
- products_services: array of up to 8 main products or services
- locations: array of locations/regions they operate in
- confidence_score: number 0-1 indicating how confident you are this is a legitimate, active business
- linkedin_url: LinkedIn company URL if found, otherwise null

Return ONLY valid JSON, no markdown fences.`,
          },
          {
            role: 'user',
            content: `Analyze this company website content for "${company.name}" (${url}):\n\n${truncatedContent}`,
          },
        ],
        temperature: 0.3,
      }),
    });

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error('AI error:', aiData);
      await supabase.from('companies').update({ processing_status: 'Error' }).eq('id', company_id);
      return new Response(
        JSON.stringify({ success: false, error: 'AI analysis failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let analysis;
    try {
      const content = aiData.choices[0].message.content;
      // Strip potential markdown fences
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse AI response:', aiData.choices?.[0]?.message?.content);
      await supabase.from('companies').update({ processing_status: 'Error' }).eq('id', company_id);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to parse AI analysis' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update company with enriched data
    const updateData = {
      summary: analysis.summary || null,
      industries: analysis.industries || null,
      products_services: analysis.products_services || null,
      locations: analysis.locations || null,
      confidence_score: analysis.confidence_score || null,
      linkedin_url: analysis.linkedin_url || null,
      processing_status: 'Completed',
    };

    const { data: updatedCompany, error: updateError } = await supabase
      .from('companies')
      .update(updateData)
      .eq('id', company_id)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save analysis' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analysis complete for:', company.name);

    return new Response(
      JSON.stringify({ success: true, company: updatedCompany }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
