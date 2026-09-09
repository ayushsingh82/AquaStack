import type { Hex } from 'viem';
import { PositionDetail } from '@/components/app/position/PositionDetail';

export default async function PositionPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  return <PositionDetail hash={hash as Hex} />;
}
