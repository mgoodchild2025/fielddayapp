import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { canAccess } from '@/lib/features'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { RuleTemplateList } from './rule-template-list'

export default async function EventRulesPage() {
  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  if (!await canAccess(org.id, 'event_rules_templates')) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">Event Rules</h1>
        <p className="text-sm text-gray-500 mb-6">Create reusable rule templates for your leagues.</p>
        <UpgradePrompt feature="Event rules templates" requiredTier="pro" />
      </div>
    )
  }

  const supabase = createServiceRoleClient()

  const { data: templates } = await supabase
    .from('league_rule_templates')
    .select('*')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Event Rules</h1>
        <p className="text-sm text-gray-500 mt-1">
          Create reusable rule templates (e.g. Beach Volleyball, Court Volleyball). Each league can select a template and customise the content independently.
        </p>
      </div>
      <RuleTemplateList templates={templates ?? []} />
    </div>
  )
}
