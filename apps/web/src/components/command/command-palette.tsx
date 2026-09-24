'use client';

import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { navItemsForRole } from '@/lib/nav';
import { useAuthStore } from '@/stores';
import { startRouteNavigation } from '@/components/layout/route-progress';

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.membershipRole);
  const items = navItemsForRole(role);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command className="bg-card text-foreground">
          <Command.Input
            placeholder="Search pages…"
            className="h-12 w-full border-b border-border bg-background px-4 text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          <Command.List className="max-h-[min(50dvh,18rem)] overflow-auto p-2 scrollbar-none sm:max-h-72">
            <Command.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">
              No results
            </Command.Empty>
            {items.map((link) => (
              <Command.Item
                key={link.href}
                value={link.label}
                onSelect={() => {
                  onOpenChange(false);
                  startRouteNavigation();
                  router.push(link.href);
                }}
                className="cursor-pointer rounded-md px-3 py-2.5 text-sm text-foreground aria-selected:bg-muted aria-selected:text-foreground"
              >
                {link.label}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
