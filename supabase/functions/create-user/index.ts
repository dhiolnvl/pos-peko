import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from request (to verify they're owner)
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is owner or staff_pusat
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userProfile?.role !== 'owner' && userProfile?.role !== 'staff_pusat') {
      throw new Error('Only owner or staff pusat can create users');
    }

    // Get request body
    const { email, password, name, role, branch_id } = await req.json();

    // Validate input
    if (!email || !password || !name || !role) {
      throw new Error('Missing required fields: email, password, name, role');
    }

    // Validate role
    const validRoles = ['owner', 'staff_pusat', 'back_office', 'cashier'];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    // staff_pusat hanya boleh membuat back_office/cashier (tidak bisa membuat owner/staff_pusat)
    if (userProfile.role === 'staff_pusat' && !['back_office', 'cashier'].includes(role)) {
      throw new Error('Staff pusat hanya bisa membuat akun back_office atau cashier');
    }

    // For staff roles, branch_id is required
    if ((role === 'back_office' || role === 'cashier') && !branch_id) {
      throw new Error('branch_id is required for back_office and cashier roles');
    }

    // Create user in auth.users
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        name,
        role,
        branch_id: branch_id || null,
      },
    });

    if (error) throw error;

    // The trigger will automatically create the user in public.users table
    // Wait a moment for the trigger to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify user was created in public.users
    const { data: publicUser, error: publicUserError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (publicUserError) {
      console.error('Public user creation failed:', publicUserError);
      // Try to clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
      throw new Error('Failed to create user profile');
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: data.user.id,
        email: data.user.email,
        name: publicUser.name,
        role: publicUser.role,
        branch_id: publicUser.branch_id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Create user error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to create user'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
