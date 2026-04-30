import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function seed() {
  console.log('🌱 Seeding KABOOM Volleyball...')

  // 1. Create organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .upsert({
      name: 'KABOOM Volleyball',
      slug: 'kaboom',
      sport: 'beach_volleyball',
      city: 'Toronto, ON',
      status: 'active',
    }, { onConflict: 'slug' })
    .select('id')
    .single()

  if (orgError) { console.error('❌ Organization error:', orgError.message); process.exit(1) }
  console.log('✅ Organization created:', org.id)

  // 2. Create branding
  const { error: brandingError } = await supabase
    .from('org_branding')
    .upsert({
      organization_id: org.id,
      primary_color: '#FF5C00',
      secondary_color: '#0F1F3D',
      bg_color: '#FAFAF8',
      text_color: '#1A1A1A',
      heading_font: 'Barlow Condensed',
      body_font: 'DM Sans',
      tagline: 'Beach Volleyball in the GTA',
      contact_email: 'play@kaboomvolleyball.ca',
      custom_domain: 'kaboomvolleyball.ca',
      social_instagram: 'https://instagram.com/kaboomvolleyball',
    }, { onConflict: 'organization_id' })

  if (brandingError) { console.error('❌ Branding error:', brandingError.message); process.exit(1) }
  console.log('✅ Branding created')

  // 3. Create subscription (internal tier — no billing)
  const { error: subError } = await supabase
    .from('subscriptions')
    .upsert({
      organization_id: org.id,
      plan_tier: 'internal',
      status: 'active',
    }, { onConflict: 'organization_id' })

  if (subError) { console.error('❌ Subscription error:', subError.message); process.exit(1) }
  console.log('✅ Subscription created (internal)')

  // 4. Create waiver
  const waiverContent = `KABOOM VOLLEYBALL — LIABILITY WAIVER & RELEASE OF LIABILITY

In consideration of being permitted to participate in volleyball activities organized by KABOOM Volleyball ("KABOOM"), I, the undersigned participant, hereby agree to the following:

1. ASSUMPTION OF RISK
I acknowledge that beach volleyball and related activities involve inherent risks including but not limited to: physical injury, muscle strains, ligament tears, fractures, concussions, and in extreme cases, permanent disability or death. I am voluntarily participating in these activities with full knowledge of the risks involved.

2. RELEASE OF LIABILITY
I hereby release and discharge KABOOM Volleyball, its organizers, employees, volunteers, agents, and facility owners from any and all liability, claims, demands, or causes of action that I may have for injuries, damages, or losses arising from my participation in KABOOM activities, including those caused by the negligence of released parties.

3. INDEMNIFICATION
I agree to indemnify and hold harmless KABOOM Volleyball and all released parties from any claims, actions, damages, and expenses arising out of my participation in KABOOM activities.

4. MEDICAL TREATMENT
In the event of injury or illness, I authorize KABOOM to arrange for medical treatment at my expense if I am unable to provide consent.

5. PHOTO & MEDIA RELEASE
I grant KABOOM Volleyball permission to use photographs, video footage, and other media captured during my participation for promotional and social media purposes without compensation.

6. RULES & CONDUCT
I agree to abide by all KABOOM rules, FIVB beach volleyball rules, and to conduct myself in a respectful, sportsmanlike manner. I understand that violation of conduct rules may result in removal from the league without refund.

7. HEALTH DECLARATION
I confirm that I am physically fit and have no medical conditions that would prevent safe participation in beach volleyball activities. I agree to immediately notify an organizer of any injury sustained during play.

By signing below, I acknowledge that I have read and understood this waiver, and I am signing it voluntarily.`

  const { error: waiverError } = await supabase
    .from('waivers')
    .upsert({
      organization_id: org.id,
      version: 1,
      title: 'KABOOM Volleyball Liability Waiver',
      content: waiverContent,
      is_active: true,
    }, { onConflict: 'organization_id,version' as never })

  if (waiverError) {
    // Try insert if upsert fails due to constraint
    const { error: waiverInsertError } = await supabase.from('waivers').insert({
      organization_id: org.id,
      version: 1,
      title: 'KABOOM Volleyball Liability Waiver',
      content: waiverContent,
      is_active: true,
    })
    if (waiverInsertError && !waiverInsertError.message.includes('duplicate')) {
      console.error('❌ Waiver error:', waiverInsertError.message)
    }
  }
  console.log('✅ Waiver created')

  // 5. Create a sample league
  const { error: leagueError } = await supabase
    .from('leagues')
    .upsert({
      organization_id: org.id,
      name: 'Summer 2025 — Monday 4s',
      slug: 'summer-2025-monday-4s',
      description: 'Monday night 4-person beach volleyball league at Woodbine Beach. All levels welcome — competitive division available.',
      sport: 'beach_volleyball',
      status: 'draft',
      payment_mode: 'per_player',
      price_cents: 19900,
      currency: 'cad',
      min_team_size: 4,
      max_team_size: 6,
      max_teams: 24,
      season_start_date: '2025-06-02',
      season_end_date: '2025-08-25',
      registration_opens_at: '2025-04-15T09:00:00-04:00',
      registration_closes_at: '2025-05-26T23:59:59-04:00',
    }, { onConflict: 'organization_id,slug' })

  if (leagueError) { console.error('❌ League error:', leagueError.message); process.exit(1) }
  console.log('✅ Sample league created')

  console.log('\n🏐 KABOOM seed complete!')
  console.log(`   Org ID: ${org.id}`)
  console.log('   Subdomain: kaboom.fielddayapp.ca')
  console.log('   Custom domain: kaboomvolleyball.ca')
}

seed().catch((err) => { console.error(err); process.exit(1) })
