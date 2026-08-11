import { DrawStatus } from '@prisma/client';

export const SALES_CUTOFF_MINUTES = 10;
export const SALES_CUTOFF_MS =
  SALES_CUTOFF_MINUTES * 60 * 1000;

type SalesWindowDraw = {
  status: DrawStatus;
  salesOpenAt: Date | null;
  salesCloseAt: Date | null;
  scheduledDrawAt: Date;
};

export function scheduledSalesCutoffAt(
  scheduledDrawAt: Date,
): Date {
  return new Date(
    scheduledDrawAt.getTime() -
      SALES_CUTOFF_MS,
  );
}

export function effectiveSalesCutoffAt(
  draw: Pick<
    SalesWindowDraw,
    'salesCloseAt' | 'scheduledDrawAt'
  >,
): Date {
  const hardCutoff =
    scheduledSalesCutoffAt(
      draw.scheduledDrawAt,
    );

  if (
    draw.salesCloseAt &&
    draw.salesCloseAt < hardCutoff
  ) {
    return draw.salesCloseAt;
  }

  return hardCutoff;
}

export function ticketSalesBlockReason(
  draw: SalesWindowDraw,
  at: Date,
): string | null {
  if (draw.status !== DrawStatus.SALES_OPEN) {
    return 'Ticket sales are not open for this draw';
  }

  if (
    draw.salesOpenAt &&
    at < draw.salesOpenAt
  ) {
    return 'Ticket sales have not started yet';
  }

  if (
    at >= effectiveSalesCutoffAt(draw)
  ) {
    return `Ticket sales close ${SALES_CUTOFF_MINUTES} minutes before the scheduled draw`;
  }

  return null;
}
