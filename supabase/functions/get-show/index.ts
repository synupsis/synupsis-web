import {corsHeaders} from '../_shared/cors.ts'
import axiod from "https://deno.land/x/axiod/mod.ts";
// import { createClient } from 'https://esm.sh/@supabase/supabase-js'

Deno.serve(async (req) => {

  // const data = null;



  // try {
  //
  //   const supabase = createClient(
  //       Deno.env.get('SUPABASE_URL') ?? '',
  //       Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  //       { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  //   )
  //
  //   const { data, error } = await supabase.from('show').select('*').eq('id', showId).single()
  //
  //   if (error) {
  //     throw error
  //   }
  //
  //   return new Response(JSON.stringify({ data }), {
  //     headers: { 'Content-Type': 'application/json' },
  //     status: 200,
  //   })
  // } catch (err) {
  //   return new Response(String(err?.message ?? err), { status: 500 })
  // }

  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', {headers: corsHeaders})
  }

  try {
    const {slug} = await req.json()

    const showId = slug.split('-').pop()

    const {data: showData} = await axiod.get(`https://api.tvmaze.com/shows/${showId}?embed=seasons`)

    const data = {
      show: showData
    }

    return new Response(JSON.stringify(data), {
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({error: error.message}), {
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
      status: 400,
    })
  }
})
