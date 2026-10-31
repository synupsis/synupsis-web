// Creates the test accounts of the local Supabase stack, or puts them back in
// their starting state: password, username, role and recap keys. Run it again
// whenever a test has used up their keys. Refuses any non-local database.
// Usage: yarn test-accounts
//
// Every account signs in at http://localhost:3001/login with its email and the
// password below.
//
//   alice@synupsis.test    alice       3 keys, as a new viewer starts
//   bruno@synupsis.test    bruno       no key left, 7 of 10 points toward the next
//   chloe@synupsis.test    chloe       5 keys (full), 9 of 10 points: progress stops at a full key
//   lea@synupsis.test      lea         3 keys, a viewer to give the others points
//   anonyme@synupsis.test  (none)      3 keys, no username: unlocked recaps show no name
//   admin@synupsis.test    admin_test  admin, unlimited keys
import { createClient } from '@supabase/supabase-js'

const PASSWORD = 'synupsis-test'

const ACCOUNTS = [
  { email: 'alice@synupsis.test', username: 'alice', wallet: null },
  { email: 'bruno@synupsis.test', username: 'bruno', wallet: { keys: 0, points: 7, key_progress: 7 } },
  { email: 'chloe@synupsis.test', username: 'chloe', wallet: { keys: 5, points: 19, key_progress: 9 } },
  { email: 'lea@synupsis.test', username: 'lea', wallet: null },
  { email: 'anonyme@synupsis.test', username: null, wallet: null },
  { email: 'admin@synupsis.test', username: 'admin_test', wallet: null, admin: true },
]

const { NUXT_PUBLIC_SUPABASE_URL: supabaseUrl, NUXT_SUPABASE_SECRET_KEY: secretKey } = process.env
if (!supabaseUrl || !secretKey) {
  console.error('NUXT_PUBLIC_SUPABASE_URL and NUXT_SUPABASE_SECRET_KEY are required.')
  process.exit(1)
}
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(supabaseUrl).hostname)) {
  console.error(`Test accounts are for the local Supabase stack only, not ${new URL(supabaseUrl).host}.`)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

const existing = new Map()
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw error
  data.users.forEach(user => existing.set(user.email, user.id))
  if (data.users.length < 1000) break
}

for (const account of ACCOUNTS) {
  const attributes = {
    email: account.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: account.username ? { username: account.username } : {},
  }
  let userId = existing.get(account.email)
  if (userId) {
    const { error } = await supabase.auth.admin.updateUserById(userId, attributes)
    if (error) throw error
  } else {
    const { data, error } = await supabase.auth.admin.createUser(attributes)
    if (error) throw error
    userId = data.user.id
  }

  // A sign-up trigger creates the profile row: only the role changes here.
  const { error: roleError } = await supabase
    .from('profile')
    .upsert({ user_id: userId, role: account.admin ? 'admin' : 'user' }, { onConflict: 'user_id' })
  if (roleError) throw roleError

  // No wallet row means the starting keys.
  const { error: resetError } = await supabase.from('recap_wallet').delete().eq('user_id', userId)
  if (resetError) throw resetError
  if (account.wallet) {
    const { error: walletError } = await supabase.from('recap_wallet').insert({ user_id: userId, ...account.wallet })
    if (walletError) throw walletError
  }

  console.log(`${existing.has(account.email) ? 'reset  ' : 'created'} ${account.email}`)
}
