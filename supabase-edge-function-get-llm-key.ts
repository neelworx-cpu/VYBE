// Supabase Edge Function: get-llm-key
// This function retrieves API keys from Supabase secrets based on provider
// Deploy this to: https://xlrcsusfaynypqvyfmgk.supabase.co/functions/v1/get-llm-key

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
		// Create Supabase client
		const supabaseClient = createClient(
			Deno.env.get('SUPABASE_URL') ?? '',
			Deno.env.get('SUPABASE_ANON_KEY') ?? '',
			{
				global: {
					headers: { Authorization: req.headers.get('Authorization')! },
				},
			}
		)

		// Parse request body
		const { provider } = await req.json()

		if (!provider) {
			return new Response(
				JSON.stringify({ error: 'Provider is required' }),
				{ status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			)
		}

		console.log(`[get-llm-key] Fetching key for provider: ${provider}`)

		// Map provider names to secret names in Supabase
		const secretNameMap: Record<string, string> = {
			'gemini': 'gemini',
			'openai': 'openai',
			'anthropic': 'anthropic',
			'azure': 'azure',
			'voyage': 'voyage',
			'pinecone': 'pinecone',
		}

		const secretName = secretNameMap[provider.toLowerCase()]

		if (!secretName) {
			return new Response(
				JSON.stringify({ error: `Unknown provider: ${provider}` }),
				{ status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			)
		}

		// Try to get API key from environment variables first (Supabase Edge Function secrets)
		// Try multiple naming conventions, prioritizing the standard format: PROVIDER_API_KEY
		let apiKey = Deno.env.get(`${secretName.toUpperCase()}_API_KEY`) ||
			Deno.env.get(secretName.toUpperCase()) ||
			Deno.env.get(`SECRET_${secretName.toUpperCase()}`) ||
			Deno.env.get(secretName) ||
			Deno.env.get(`${secretName}_api_key`)

		// If not in env vars, try querying database (if you have a secrets table)
		if (!apiKey) {
			try {
				// Option 1: Query a secrets table (if you have one)
				// Uncomment and adjust table/column names based on your schema
				/*
				const { data, error } = await supabaseClient
				  .from('secrets')
				  .select('value')
				  .eq('key', secretName)
				  .single()

				if (!error && data) {
				  apiKey = data.value
				}
				*/

				// Option 2: Use Supabase Vault (if configured)
				// This requires additional setup in Supabase

			} catch (dbError) {
				console.warn(`[get-llm-key] Database query failed:`, dbError)
			}
		}

		if (!apiKey) {
			console.warn(`[get-llm-key] No API key found for provider: ${provider}`)
			return new Response(
				JSON.stringify({ error: `API key not found for provider: ${provider}. Please set it in Supabase Edge Function secrets or database.` }),
				{ status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			)
		}

		// Build response object
		const response: any = {
			apiKey: apiKey,
		}

		// For Azure, also return endpoint and API version if available
		if (provider.toLowerCase() === 'azure') {
			let endpoint = Deno.env.get('AZURE_ENDPOINT') ||
				Deno.env.get('SECRET_AZURE_ENDPOINT') ||
				Deno.env.get('azure_endpoint')

			let apiVersion = Deno.env.get('AZURE_API_VERSION') ||
				Deno.env.get('SECRET_AZURE_API_VERSION') ||
				Deno.env.get('azure_api_version') ||
				'2024-05-01-preview'

			// Try database query for Azure-specific fields if not in env
			if (!endpoint || !apiVersion) {
				try {
					// Uncomment if you have a secrets table
					/*
					const { data: azureData } = await supabaseClient
					  .from('secrets')
					  .select('value')
					  .in('key', ['azure_endpoint', 'azure_api_version'])

					azureData?.forEach(row => {
					  if (row.key === 'azure_endpoint') endpoint = row.value
					  if (row.key === 'azure_api_version') apiVersion = row.value
					})
					*/
				} catch (dbError) {
					console.warn(`[get-llm-key] Azure config query failed:`, dbError)
				}
			}

			if (endpoint) {
				response.endpoint = endpoint
				// Also support alternative field names for compatibility
				response.azure_endpoint = endpoint
			}

			if (apiVersion) {
				response.apiVersion = apiVersion
				// Also support alternative field names for compatibility
				response.azure_api_version = apiVersion
				response.api_version = apiVersion
			}
		}

		console.log(`[get-llm-key] Successfully retrieved key for provider: ${provider}`)

		return new Response(
			JSON.stringify(response),
			{ status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
		)

	} catch (error) {
		console.error('[get-llm-key] Error:', error)
		return new Response(
			JSON.stringify({ error: error.message }),
			{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
		)
	}
})

