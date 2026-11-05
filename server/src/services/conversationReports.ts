import type { AuthPayload } from '../auth.js';
import { prisma } from '../prisma.js';
import { AppError } from './errors.js';
import { listLeadStages } from './leadStages.js';
import { requireAdmin } from './permissions.js';

// Conversation Reports (sidebar → CONVERSATIONS): the new customers in a date range and how many of them were
// won or lost.
//
// New customer: a contact (not deleted, with at least one chat) created in the range, i.e. whose first chat started
// then. Outcome is the customer's lead stage now (Settings → Customer lifecycle):
//   won   the Won stage (value "won"; if an admin removed it, the last progressing stage)
//   lost  any stage marked lost
//   new   any other stage (still in progress, or no stage)
// Stage colours and labels come from the workspace's own stages, so the report matches the stage pills in chats.

export const CONVERSATION_REPORT_MAX_ROWS = 10000;
export type Outcome = 'new' | 'won' | 'lost';

function validDate(d: Date | null | undefined, name: string) {
  if (d == null) throw new AppError(`Choose a "${name}" date`, 400, 'BAD_USER_INPUT');
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new AppError(`Invalid ${name} date`, 400, 'BAD_USER_INPUT');
  return d;
}

// Owners and admins only; never crosses workspaces. Oldest first.
export async function conversationReport(auth: AuthPayload, filter: { from?: Date | null; to?: Date | null }) {
  await requireAdmin(auth);
  const from = validDate(filter.from, 'from');
  const to = validDate(filter.to, 'to');
  if (from > to) throw new AppError('"from" must be before "to"', 400, 'BAD_USER_INPUT');

  const stages = await listLeadStages(auth.workspaceId);
  const progressing = stages.filter((s) => !s.closed);
  const wonStage = stages.find((s) => s.value === 'won' && !s.closed) ?? progressing[progressing.length - 1] ?? null;
  const lostStages = stages.filter((s) => s.closed);
  const newStage = stages.find((s) => s.isDefault) ?? progressing[0] ?? null;
  const byValue = new Map(stages.map((s) => [s.value, s]));

  const rows = await prisma.contact.findMany({
    where: { workspaceId: auth.workspaceId, deletedAt: null, conversations: { some: {} }, createdAt: { gte: from, lte: to } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: CONVERSATION_REPORT_MAX_ROWS,
    select: { id: true, name: true, firstName: true, lastName: true, waId: true, email: true, leadStage: true, createdAt: true },
  });

  const outcomeOf = (stage: string | null): Outcome =>
    stage && wonStage && stage === wonStage.value ? 'won' : stage && lostStages.some((s) => s.value === stage) ? 'lost' : 'new';

  const customers = rows.map((c) => {
    const stage = c.leadStage ? byValue.get(c.leadStage) : undefined;
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    return {
      id: c.id,
      name: fullName || c.name || null,
      waId: c.waId,
      email: c.email,
      createdAt: c.createdAt,
      outcome: outcomeOf(c.leadStage),
      // The stage's value (Contact.leadStage); null = no stage, or one that no longer exists
      stage: stage ? stage.value : null,
      stageLabel: stage?.label ?? null,
      stageColor: stage?.color ?? null,
    };
  });

  const count = (o: Outcome) => customers.filter((c) => c.outcome === o).length;
  return {
    totalNew: customers.length,
    totalWon: count('won'),
    totalLost: count('lost'),
    totalOpen: count('new'),
    truncated: rows.length >= CONVERSATION_REPORT_MAX_ROWS,
    colors: {
      new: newStage?.color ?? '#eab308',
      won: wonStage?.color ?? '#16a34a',
      lost: lostStages[0]?.color ?? '#dc2626',
    },
    labels: { won: wonStage?.label ?? 'Won', lost: lostStages[0]?.label ?? 'Lost' },
    // Every lifecycle stage, in the order Settings → Customer lifecycle shows them (progressing, then lost), with
    // how many of these customers are on it now: one table column each
    stages: stages.map((s) => ({ value: s.value, label: s.label, color: s.color, lost: s.closed, isDefault: s.isDefault, count: customers.filter((c) => c.stage === s.value).length })),
    customers,
  };
}
