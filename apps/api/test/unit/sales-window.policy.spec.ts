import { DrawStatus } from '@prisma/client';

import {
  effectiveSalesCutoffAt,
  SALES_CUTOFF_MINUTES,
  scheduledSalesCutoffAt,
  ticketSalesBlockReason,
} from '../../src/lottery-draws/sales-window.policy';

describe('sales-window policy', () => {
  const scheduledDrawAt = new Date('2026-08-20T20:00:00.000Z');

  it('sets the hard cutoff exactly ten minutes before the draw', () => {
    expect(SALES_CUTOFF_MINUTES).toBe(10);
    expect(scheduledSalesCutoffAt(scheduledDrawAt).toISOString()).toBe(
      '2026-08-20T19:50:00.000Z',
    );
  });

  it('uses an earlier explicit salesCloseAt when configured', () => {
    expect(
      effectiveSalesCutoffAt({
        salesCloseAt: new Date('2026-08-20T19:45:00.000Z'),
        scheduledDrawAt,
      }).toISOString(),
    ).toBe('2026-08-20T19:45:00.000Z');
  });

  it('never allows an explicit close time to extend sales into the final ten minutes', () => {
    expect(
      effectiveSalesCutoffAt({
        salesCloseAt: new Date('2026-08-20T19:59:00.000Z'),
        scheduledDrawAt,
      }).toISOString(),
    ).toBe('2026-08-20T19:50:00.000Z');
  });

  it('allows sales immediately before cutoff and blocks them at cutoff', () => {
    const draw = {
      status: DrawStatus.SALES_OPEN,
      salesOpenAt: null,
      salesCloseAt: null,
      scheduledDrawAt,
    };

    expect(
      ticketSalesBlockReason(
        draw,
        new Date('2026-08-20T19:49:59.999Z'),
      ),
    ).toBeNull();

    expect(
      ticketSalesBlockReason(
        draw,
        new Date('2026-08-20T19:50:00.000Z'),
      ),
    ).toBe(
      'Ticket sales close 10 minutes before the scheduled draw',
    );
  });

  it('blocks sales when the draw status is not SALES_OPEN', () => {
    expect(
      ticketSalesBlockReason(
        {
          status: DrawStatus.SCHEDULED,
          salesOpenAt: null,
          salesCloseAt: null,
          scheduledDrawAt,
        },
        new Date('2026-08-20T19:00:00.000Z'),
      ),
    ).toBe('Ticket sales are not open for this draw');
  });

  it('blocks sales before salesOpenAt', () => {
    expect(
      ticketSalesBlockReason(
        {
          status: DrawStatus.SALES_OPEN,
          salesOpenAt: new Date('2026-08-20T19:00:00.000Z'),
          salesCloseAt: null,
          scheduledDrawAt,
        },
        new Date('2026-08-20T18:59:59.999Z'),
      ),
    ).toBe('Ticket sales have not started yet');
  });

  it('allows sales exactly at salesOpenAt', () => {
    const at = new Date('2026-08-20T19:00:00.000Z');

    expect(
      ticketSalesBlockReason(
        {
          status: DrawStatus.SALES_OPEN,
          salesOpenAt: at,
          salesCloseAt: null,
          scheduledDrawAt,
        },
        at,
      ),
    ).toBeNull();
  });

  it('blocks exactly at an earlier explicit salesCloseAt', () => {
    const salesCloseAt = new Date('2026-08-20T19:45:00.000Z');

    expect(
      ticketSalesBlockReason(
        {
          status: DrawStatus.SALES_OPEN,
          salesOpenAt: null,
          salesCloseAt,
          scheduledDrawAt,
        },
        salesCloseAt,
      ),
    ).toBe(
      'Ticket sales close 10 minutes before the scheduled draw',
    );
  });
});
