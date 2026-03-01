import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const callerId = claimsData.claims.sub;

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").single();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: corsHeaders });
    }

    // Get all users from auth
    const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    if (usersError) throw usersError;

    // Get counts per user
    const { data: companies } = await adminClient.from("companies").select("user_id");
    const { data: emails } = await adminClient.from("emails").select("user_id");
    const { data: people } = await adminClient.from("people").select("user_id");
    const { data: roles } = await adminClient.from("user_roles").select("user_id, role");
    const { data: profiles } = await adminClient.from("profiles").select("user_id, display_name");

    const countBy = (arr: any[] | null, userId: string) => (arr ?? []).filter((r: any) => r.user_id === userId).length;

    const enrichedUsers = users.map((u: any) => {
      const userRoles = (roles ?? []).filter((r: any) => r.user_id === u.id);
      const profile = (profiles ?? []).find((p: any) => p.user_id === u.id);
      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        banned: u.banned_until ? true : false,
        display_name: profile?.display_name || null,
        role: userRoles.some((r: any) => r.role === "admin") ? "admin" : "user",
        companies_count: countBy(companies, u.id),
        emails_count: countBy(emails, u.id),
        people_count: countBy(people, u.id),
      };
    });

    // Summary stats
    const stats = {
      total_users: users.length,
      total_companies: (companies ?? []).length,
      total_emails: (emails ?? []).length,
      total_people: (people ?? []).length,
    };

    return new Response(JSON.stringify({ users: enrichedUsers, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-get-users error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), { status: 500, headers: corsHeaders });
  }
});
