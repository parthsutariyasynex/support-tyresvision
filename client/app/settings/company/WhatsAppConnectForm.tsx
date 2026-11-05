'use client';

import { useState } from 'react';
import { type WhatsAppConnectionTest, connectWhatsApp, testWhatsAppConnection } from '@/lib/settings';
import { showToast } from '@/lib/toasts';

// Company details → WhatsApp → Connect / Update WhatsApp Number (owners and admins; the server refuses everyone
// else). Test connection asks Meta about the details (nothing saved); Connect WhatsApp is offered only once a test
// of exactly these details passed, and the server runs the same checks again before switching. Until then the
// current number stays connected. The access token is write-only: never shown, never pre-filled.

const input =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/15';
const label = 'text-[11px] font-semibold uppercase tracking-wide text-muted';

const CHECK_LABELS: Record<string, string> = {
  number: 'Phone number',
  account: 'WhatsApp Business account',
  token: 'Access token',
  app: 'Meta app',
  permissions: 'Permissions',
  expiry: 'Expiry',
  webhook: 'Webhook subscription',
};

type Fields = { wabaId: string; phoneNumberId: string; accessToken: string };
const empty: Fields = { wabaId: '', phoneNumberId: '', accessToken: '' };
const trimmed = (f: Fields): Fields => ({ wabaId: f.wabaId.trim(), phoneNumberId: f.phoneNumberId.trim(), accessToken: f.accessToken.trim() });
const sameFields = (a: Fields, b: Fields) => a.wabaId === b.wabaId && a.phoneNumberId === b.phoneNumberId && a.accessToken === b.accessToken;

export function WhatsAppConnectForm() {
  const [fields, setFields] = useState<Fields>(empty);
  // The last test and the details it was run with: connecting needs a passed test of the details now in the form
  const [test, setTest] = useState<{ result: WhatsAppConnectionTest; fields: Fields } | null>(null);
  const [busy, setBusy] = useState<'' | 'test' | 'save'>('');
  const [error, setError] = useState('');

  const current = trimmed(fields);
  const complete = !!current.wabaId && !!current.phoneNumberId && current.accessToken.length >= 10;
  // Shown only while the form still holds the details that were tested
  const result = test && sameFields(test.fields, current) ? test.result : null;
  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [key]: e.target.value }));

  async function runTest() {
    setBusy('test');
    setError('');
    try {
      setTest({ result: await testWhatsAppConnection(current), fields: current });
    } catch (e) {
      setTest(null);
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function save() {
    setBusy('save');
    setError('');
    try {
      const account = await connectWhatsApp(current);
      setFields(empty);
      setTest(null);
      showToast(`whatsapp:${Date.now()}`, '', 'WhatsApp number connected.', account.displayPhone ?? '');
      setTimeout(() => window.location.reload(), 1200); // everything else reads the connected number from the session
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }

  return (
    <section className="mt-5 rounded-xl border border-line bg-surface p-6">
      <h2 className="text-[15px] font-semibold text-ink">Connect / Update WhatsApp Number</h2>
      <p className="mt-1 text-[12px] text-body-soft">
        Get these values from <span className="text-ink">Meta Developer Dashboard → WhatsApp → API Setup</span>. The current number stays connected until the new one
        passes the test.
      </p>

      <div className="mt-5 grid gap-5">
        <label className="grid gap-1.5">
          <span className={label}>WhatsApp Business account ID (WABA ID)</span>
          <input className={input} value={fields.wabaId} onChange={set('wabaId')} placeholder="e.g. 123456789012345" autoComplete="off" spellCheck={false} />
        </label>
        <label className="grid gap-1.5">
          <span className={label}>Phone number ID</span>
          <input className={input} value={fields.phoneNumberId} onChange={set('phoneNumberId')} placeholder="e.g. 987654321098765" autoComplete="off" spellCheck={false} />
        </label>
        <label className="grid gap-1.5">
          <span className={label}>Access token</span>
          <input
            type="password"
            className={input}
            value={fields.accessToken}
            onChange={set('accessToken')}
            placeholder="Paste your permanent system user token"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      {result && (
        <div className="mt-5">
          <p className={`text-[13px] font-semibold ${result.ok ? 'text-primary' : 'text-danger'}`}>
            {result.ok ? `All checks passed: ready to connect ${result.displayPhone ?? ''}` : 'Fix the problems below, then test again'}
          </p>
          <ul className="mt-2 divide-y divide-line-soft rounded-lg border border-line">
            {result.checks.map((c) => (
              <li key={c.key} className="grid grid-cols-[20px_180px_1fr] gap-3 px-4 py-2.5">
                <span className={c.ok ? 'text-primary' : 'text-danger'} aria-label={c.ok ? 'Passed' : 'Failed'}>
                  {c.ok ? '✓' : '✕'}
                </span>
                <span className="text-[12px] font-semibold text-muted">{CHECK_LABELS[c.key] ?? c.key}</span>
                <span className="break-words text-[13px] text-ink">{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!complete || !!busy}
          onClick={runTest}
          className="rounded-lg border border-primary px-5 py-2.5 text-[13px] font-semibold text-primary hover:bg-primary/5 disabled:border-line disabled:text-faint disabled:hover:bg-transparent"
        >
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
        <button
          type="button"
          disabled={!result?.ok || !!busy}
          onClick={save}
          className="rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
        >
          {busy === 'save' ? 'Connecting…' : 'Connect WhatsApp'}
        </button>
        <span className="text-[12px] text-muted">
          {!complete ? 'Fill in all three fields' : !result ? 'Test the connection first' : result.ok ? '' : 'Every check must pass'}
        </span>
      </div>
    </section>
  );
}
