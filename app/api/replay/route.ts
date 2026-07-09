import { NextRequest, NextResponse } from 'next/server';
import { runDemo } from '@/src/demo';

// Judge-facing JSON endpoint: curl '<host>/api/replay?tamper=1'
export function GET(req: NextRequest) {
  const tamper = req.nextUrl.searchParams.get('tamper') === '1';
  const outcome = runDemo(tamper);
  return NextResponse.json({
    network: 'simulated',
    tamperDemo: tamper,
    market: outcome.market,
    receipt: outcome.receipt,
    payouts: outcome.payouts,
    dust: outcome.dust,
    timeline: outcome.timeline,
  });
}
