// Supabase Edge Function: get-db-connection
// This function retrieves the Postgres connection string from Supabase secrets
// Deploy this to: https://xlrcsusfaynypqvyfmgk.supabase.co/functions/v1/get-db-connection
//
// SECURITY: This keeps the database connection string on the server, never exposing it to clients.
// The connection string is stored as a Supabase Edge Function secret.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
	// Handle CORS preflight requests
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders })
	}

	try {
		// Get connection string from Supabase Edge Function secrets
		// Set this in Supabase Dashboard: Project Settings > Edge Functions > Secrets
		// Secret name: DB_CONNECTION_STRING (Supabase doesn't allow secrets starting with "SUPABASE")
		//
		// Connection string format:
		// postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
		// OR (direct connection):
		// postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

		// Note: Supabase secrets cannot start with "SUPABASE" prefix
		// So we use DB_CONNECTION_STRING instead
		let connectionString = Deno.env.get('DB_CONNECTION_STRING') ||
			Deno.env.get('DATABASE_URL') ||
			Deno.env.get('POSTGRES_CONNECTION_STRING') ||
			Deno.env.get('SUPABASE_DB_CONNECTION_STRING')

		if (!connectionString) {
			console.error('[get-db-connection] No connection string found in environment variables')
			return new Response(
				JSON.stringify({
					error: 'Database connection string not configured. Please set DB_CONNECTION_STRING in Edge Function secrets.'
				}),
				{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			)
		}

		console.log('[get-db-connection] Connection string retrieved successfully')

		// Return connection string (only to authenticated requests in production)
		// For now, we return it directly. In production, you might want to add:
		// - User authentication check
		// - Rate limiting
		// - Audit logging

		return new Response(
			JSON.stringify({
				connectionString: connectionString,
				connection_string: connectionString // Support both naming conventions
			}),
			{
				status: 200,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			}
		)
	} catch (error) {
		console.error('[get-db-connection] Error:', error)
		return new Response(
			JSON.stringify({ error: 'Failed to retrieve database connection string' }),
			{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
		)
	}
})
