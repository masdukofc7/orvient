'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card, CardBody } from '@/components/ui/card';

export function MetricCard({
  label,
  value,
  index = 0,
  className,
  href,
}: {
  label: string;
  value: string;
  index?: number;
  className?: string;
  href?: string;
}) {
  const body = (
    <Card className={href ? 'transition-colors hover:border-foreground/20' : undefined}>
      <CardBody>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-2 truncate text-xl font-semibold tracking-tight sm:text-2xl">
          {value}
        </div>
      </CardBody>
    </Card>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={className}
    >
      {href ? (
        <Link
          href={href}
          className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </motion.div>
  );
}

export function MetricGrid({
  children,
  className,
  columns = 4,
}: {
  children: React.ReactNode;
  className?: string;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        'grid gap-3 sm:gap-4',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        columns === 4 && 'sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
