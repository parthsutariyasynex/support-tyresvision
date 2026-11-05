'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isAdminRole } from '@/lib/roles';
import { AppShell, type Me } from '../AppShell';
import { ConversationReport } from './ConversationReport';

// Sidebar → CONVERSATIONS → Conversation Reports. Owners and admins only (the server refuses the report to everyone
// else); supervisors and agents are sent back to the Inbox.
export default function ConversationReportsPage() {
  return <AppShell>{(me) => <ConversationReports me={me} />}</AppShell>;
}

function ConversationReports({ me }: { me: Me }) {
  const router = useRouter();
  const admin = isAdminRole(me.role);
  useEffect(() => {
    if (!admin) router.replace('/inbox');
  }, [admin, router]);

  if (!admin) return null;

  return (
    <div className="h-full overflow-y-auto bg-page/40 p-4 sm:p-6 lg:p-8" style={{ scrollbarGutter: 'stable' }}>
      <div className="mx-auto w-full max-w-6xl">
        <ConversationReport />
      </div>
    </div>
  );
}
