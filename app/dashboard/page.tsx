'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type Asset = {
  id: string;
  title: string;
  status: string | null;
  brand: string | null;
  model_name: string | null;
  serial_number: string | null;
  purchase_price: number | null;
  current_estimated_value: number | null;
  purchase_url: string | null;
  receipt_url: string | null;
  // Supabase returns category:categories ( name ) as an array of rows
  category?: { name: string | null }[] | null;
};

type IdentityLevel = 'unknown' | 'basic' | 'good' | 'strong';

function getCategoryName(asset: Asset) {
  if (!asset.category || asset.category.length === 0) return '—';
  return asset.category[0]?.name ?? '—';
}

function computeIdentity(asset: Asset): {
  level: IdentityLevel;
  colorClass: string;
} {
  let score = 0;

  const hasCategory = getCategoryName(asset) !== '—';
  const hasBrand = !!asset.brand;
  const hasModel = !!asset.model_name;
  const hasSerial = !!asset.serial_number;

  if (hasCategory) score++;
  if (hasBrand) score++;
  if (hasModel) score++;
  if (hasSerial) score++;

  if (score >= 4) {
    return {
      level: 'strong',
      colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

  if (score >= 2) {
    return {
      level: 'good',
      colorClass: 'bg-blue-100 text-blue-800 border-blue-200',
    };
  }

  if (score >= 1) {
    return {
      level: 'basic',
      colorClass: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  }

  return {
    level: 'unknown',
    colorClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('assets')
        .select(
          `
          id,
          title,
          status,
          brand,
          model_name,
          serial_number,
          purchase_price,
          current_estimated_value,
          purchase_url,
          receipt_url,
          category:categories ( name )
        `
        )
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setAssets(data as Asset[]);
      }

      setLoading(false);
    };

    load();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const totalPurchase = assets.reduce(
    (sum, asset) => sum + (asset.purchase_price ?? 0),
    0
  );
  const totalCurrent = assets.reduce(
    (sum, asset) => sum + (asset.current_estimated_value ?? 0),
    0
  );

  const formatMoney = (value: number | null) => {
    if (value == null) return '—';
    return `£${value.toFixed(0)}`;
  };

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="space-y-4 p-6">
      {/* Header with buttons */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your asset portfolio</h1>
        <div className="flex items-center gap-2">
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={handleLogout}
          >
            Log out
          </button>
          <button
            className="rounded bg-black px-4 py-2 text-sm text-white"
            onClick={() => router.push('/assets/new')}
          >
            + Add asset
          </button>
        </div>
      </div>

      {/* Identity explanation */}
      <p className="text-xs text-slate-500">
        <span className="font-medium">Identity</span> shows how well Round
        understands each asset. Basic = a starting point, Good = enough details
        for comparisons, Strong = Round has brand, model, category and a unique
        identifier, making automated valuations more reliable.
      </p>

      {/* Portfolio totals */}
      <div className="rounded border bg-slate-50 p-4 text-sm">
        <p className="mb-2 font-medium">Portfolio totals</p>
        <div className="flex flex-col gap-1 md:flex-row md:gap-4">
          <span>
            Total purchase value:{' '}
            <span className="font-semibold">
              {formatMoney(totalPurchase || 0)}
            </span>
          </span>
          <span>
            Total current estimated value:{' '}
            <span className="font-semibold">
              {formatMoney(totalCurrent || 0)}
            </span>
          </span>
        </div>
      </div>

      {/* Table */}
      {assets.length === 0 ? (
        <p>You haven&apos;t added any assets yet.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left">Title</th>
              <th className="py-2 text-left">Identity</th>
              <th className="py-2 text-left">Category</th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2 text-right">Purchase (£)</th>
              <th className="py-2 text-right">Current (£)</th>
              <th className="py-2 text-center">Docs</th>
            </tr>
          </thead>
          <tbody>
            {assets.map(asset => {
              const identity = computeIdentity(asset);

              const identityLabel =
                identity.level === 'strong'
                  ? 'Strong'
                  : identity.level === 'good'
                  ? 'Good'
                  : identity.level === 'basic'
                  ? 'Basic'
                  : 'Unknown';

              return (
                <tr
                  key={asset.id}
                  className="cursor-pointer border-b hover:bg-slate-50"
                  onClick={() => router.push(`/assets/${asset.id}`)}
                >
                  <td className="py-2">
                    <div className="flex flex-col">
                      <span>{asset.title}</span>
                      {(asset.brand || asset.model_name) && (
                        <span className="text-xs text-slate-500">
                          {[asset.brand, asset.model_name]
                            .filter(Boolean)
                            .join(' ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${identity.colorClass}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {identityLabel}
                    </span>
                  </td>
                  <td className="py-2">{getCategoryName(asset)}</td>
                  <td className="py-2 capitalize">
                    {asset.status ?? 'unknown'}
                  </td>
                  <td className="py-2 text-right">
                    {formatMoney(asset.purchase_price)}
                  </td>
                  <td className="py-2 text-right">
                    {formatMoney(asset.current_estimated_value)}
                  </td>
                  <td className="py-2 text-center">
                    {asset.purchase_url && (
                      <span title="Has purchase link" className="mr-1">
                        🔗
                      </span>
                    )}
                    {asset.receipt_url && (
                      <span title="Has receipt PDF">📄</span>
                    )}
                    {!asset.purchase_url && !asset.receipt_url && <span>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
