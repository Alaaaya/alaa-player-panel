import {createCategoryHandler} from './handler.js';
const handler=createCategoryHandler({url:Deno.env.get('SUPABASE_URL'),anonKey:Deno.env.get('SUPABASE_ANON_KEY'),origin:'https://alaaaya.github.io',gatewayToken:Deno.env.get('CATEGORY_GATEWAY_TOKEN')});
Deno.serve(handler);
