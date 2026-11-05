// Dev only: fake an incoming WhatsApp customer message and watch what the AI Robot does with it.
//
//   cd server
//   node scripts/fakeWhatsapp.mjs "Do you have 265/65R17 tyres?"
//   node scripts/fakeWhatsapp.mjs "What size fits a 2020 Toyota Land Cruiser?" --phone 971501234567 --name "Ali"
//
// Options: --phone <digits>  customer number (default 971500000001; use a new one for a fresh chat)
//          --name <text>     customer name (default "Robot Test")
//          --email <email>   whose workspace to use (default test@tyrescart.local)
//          --wait <seconds>  how long to watch for the robot (default 150)
//          --api <url>       API address (default http://localhost:<PORT from .env>)
//
// Needs the API server running and NODE_ENV not production. It signs in with the server's JWT_SECRET, so no
// password is needed. The robot answers a new chat after "Auto answer after" (Settings → AI Robot, firstReplyMins),
// then each next message within a few seconds.
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const phone = String(opt('phone', '971500000001')).replace(/\D/g, '');
const name = opt('name', 'Robot Test');
const email = opt('email', 'test@tyrescart.local');
const waitS = Number(opt('wait', 150));
const api = opt('api', `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
const body = args.join(' ').trim();
if (!body) {
  console.log('Usage: node scripts/fakeWhatsapp.mjs "<customer message>" [--phone 9715...] [--name "..."]');
  process.exit(1);
}

// --- Sign in as the user, in the workspace where the robot is on (if any)
const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email }, select: { id: true, members: { where: { active: true }, select: { workspaceId: true } } } });
if (!user || !user.members.length) {
  console.error(`No active user ${email}`);
  process.exit(1);
}
const wsIds = user.members.map((m) => m.workspaceId);
const robot = await prisma.aiRobotSettings.findFirst({ where: { workspaceId: { in: wsIds }, enabled: true } });
const workspaceId = robot?.workspaceId ?? wsIds[0];
await prisma.$disconnect();
const token = jwt.sign({ userId: user.id, workspaceId, iatMs: Date.now() }, process.env.JWT_SECRET, { expiresIn: '1h' });

if (!robot) console.log('⚠ The AI Robot is OFF in this workspace (Settings → AI Robot). The message will arrive, but nobody will answer.');
else console.log(`Robot: on, mode ${robot.mode}${robot.mode === 'draft' ? ' (writes a draft, sends nothing)' : ''}, first reply after ${robot.firstReplyMins} min`);

async function gql(query, variables) {
  const res = await fetch(`${api}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ query, variables }) });
  const json = await res.json().catch(() => null);
  if (!json || json.errors?.length) throw new Error(json?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`);
  return json.data;
}

// --- Send the fake customer message
try {
  await gql('mutation($i: SimulateIncomingInput) { simulateIncomingMessage(input: $i) }', { i: { waId: phone, name, body } });
} catch (err) {
  console.error(`Could not send: ${err.message}\n(Is the API running at ${api}?)`);
  process.exit(1);
}
console.log(`\n👤 ${name} (+${phone}): ${body}\n`);

const { conversations } = await gql('query($s: String) { conversations(search: $s, first: 5) { nodes { id contact { waId } } } }', { s: phone });
const chat = conversations.nodes.find((c) => c.contact.waId === phone);
if (!chat) {
  console.error('Message sent, but the chat was not found');
  process.exit(1);
}

// --- Watch the robot until it decides (or we give up)
const seenRuns = new Set((await gql('query($c: ID!) { aiRobotRuns(conversationId: $c, limit: 50) { id } }', { c: chat.id })).aiRobotRuns.map((r) => r.id));
const until = Date.now() + waitS * 1000;
let lastLabel = '';
while (Date.now() < until) {
  const { aiRobotStatus: st, aiRobotRuns: runs } = await gql(
    'query($c: ID!) { aiRobotStatus(conversationId: $c) { state label dueAt } aiRobotRuns(conversationId: $c, limit: 10) { id action reason confidence draft tools messageId durationMs } }',
    { c: chat.id },
  );
  const fresh = runs.filter((r) => !seenRuns.has(r.id)).reverse();
  if (fresh.length) {
    const msgs = (await gql('query($c: ID!) { messages(conversationId: $c, first: 20) { nodes { id body status direction } } }', { c: chat.id })).messages.nodes;
    for (const r of fresh) {
      const sent = msgs.find((m) => m.id === r.messageId);
      console.log(`🤖 Robot: ${r.action}${r.confidence != null ? ` (confidence ${r.confidence})` : ''}, ${(r.durationMs / 1000).toFixed(1)}s`);
      if (r.tools.length) console.log(`   Looked up: ${r.tools.join(' | ')}`);
      if (r.reason) console.log(`   Reason: ${r.reason}`);
      const text = sent?.body || r.draft;
      if (text) console.log(`\n${text.replace(/^/gm, '   ')}\n`);
      if (sent) console.log(`   WhatsApp send status: ${sent.status}${sent.status === 'failed' ? ' (expected locally: there is no real WhatsApp number)' : ''}`);
    }
    process.exit(0);
  }
  const label = `${st.state}: ${st.label}${st.dueAt ? ` (due ${new Date(st.dueAt).toLocaleTimeString()})` : ''}`;
  if (label !== lastLabel) console.log(`… ${label}`);
  lastLabel = label;
  if (st.state === 'off' || st.state === 'stopped' || st.state === 'handover') {
    if (st.state !== 'handover' || !fresh.length) {
      console.log('The robot will not answer this chat. Use a new --phone for a fresh chat.');
      process.exit(0);
    }
  }
  await new Promise((r) => setTimeout(r, 3000));
}
console.log(`No robot decision within ${waitS}s. Check the server log, or raise --wait.`);
