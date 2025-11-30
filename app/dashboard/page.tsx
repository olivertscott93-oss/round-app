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
  asset_type_id: string | null;
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
  if (asset.asset_type_id) {
    return {
      level: 'strong',
      colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }

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
          asset_type_id,
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

  const portfolioDelta = totalCurrent - totalPurchase;
  const percentChange =
    totalPurchase > 0 ? (portfolioDelta / totalPurchase) * 100 : null;

  const assetCount = assets.length;

  // Identity stats
  let strongCount = 0;
  let basicOrGoodCount = 0;
  let catalogMatches = 0;

  assets.forEach(asset => {
    const identity = computeIdentity(asset);
    if (identity.level === 'strong') strongCount++;
    if (identity.level === 'basic' || identity.level === 'good') {
      basicOrGoodCount++;
    }
    if (asset.asset_type_id) catalogMatches++;
  });

  // Category composition
  type CategorySummary = {
    category: string;
    count: number;
    totalPurchase: number;
    totalCurrent: number;
  };

  const categoryMap: Record<string, CategorySummary> = {};

  assets.forEach(asset => {
    const cat = getCategoryName(asset);
    if (!categoryMap[cat]) {
      categoryMap[cat] = {
        category: cat,
        count: 0,
        totalPurchase: 0,
        totalCurrent: 0,
      };
    }
    categoryMap[cat].count += 1;
    categoryMap[cat].totalPurchase += asset.purchase_price ?? 0;
    categoryMap[cat].totalCurrent += asset.current_estimated_value ?? 0;
  });

  const categorySummaries = Object.values(categoryMap).sort(
    (a, b) => b.totalCurrent - a.totalCurrent
  );

  const formatMoney = (value: number | null | undefined) => {
    if (value == null) return '—';
    return `£${value.toFixed(0)}`;
  };

  const formatDelta = (value: number) => {
    if (value === 0) return '£0';
    const prefix = value > 0 ? '+' : '−';
    const abs = Math.abs(value);
    return `${prefix}£${abs.toFixed(0)}`;
  };

  const formatPercent = (value: number | null) => {
    if (value == null) return '—';
    const prefix = value > 0 ? '+' : value < 0 ? '−' : '';
    const abs = Math.abs(value);
    return `${prefix}${abs.toFixed(1)}%`;
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

      {/* Portfolio insights */}
      {assetCount > 0 && (
        <div className="rounded border bg-white p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium">Portfolio insights</p>
            <p className="text-xs text-slate-500">
              Based on your recorded purchase and current estimated values.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">
                Overall gain / loss vs purchase
              </p>
              <p className="text-sm font-semibold">
                {formatDelta(portfolioDelta)}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {formatPercent(percentChange)} vs total purchase value
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Identity coverage</p>
              <p className="text-sm font-semibold">
                {strongCount}/{assetCount} assets
              </p>
              <p className="mt-1 text-xs text-slate-600">
                have <span className="font-medium">Strong</span> identity
                (including catalog matches)
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Catalog matches</p>
              <p className="text-sm font-semibold">
                {catalogMatches}/{assetCount} assets
              </p>
              <p className="mt-1 text-xs text-slate-600">
                are linked to a catalog identity, ready for automated valuation
                later.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio composition */}
      {assetCount > 0 && categorySummaries.length > 0 && (
        <div className="rounded border bg-slate-50 p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium">Portfolio composition</p>
            <p className="text-xs text-slate-500">
              How your portfolio breaks down by category.
            </p>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-1 text-left">Category</th>
                <th className="py-1 text-right">Assets</th>
                <th className="py-1 text-right">Purchase (£)</th>
                <th className="py-1 text-right">Current (£)</th>
              </tr>
            </thead>
            <tbody>
              {categorySummaries.map(row => (
                <tr key={row.category} className="border-b">
                  <td className="py-1">{row.category}</td>
                  <td className="py-1 text-right">{row.count}</td>
                  <td className="py-1 text-right">
                    {formatMoney(row.totalPurchase)}
                  </td>
                  <td className="py-1 text-right">
                    {formatMoney(row.totalCurrent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Table */}
      {assets.length === 0 ? (
        <p>You haven&apos;t added any assets yet.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left">Title</th>
              <th className="py-2 text-left">
                <div className="relative inline-flex items-center gap-1 group">
                  <span>Identity</span>
                  <span className="flex h-4 w-4 items-center justify-center rounded-full border text-[10px] text-slate-500 cursor-help">
                    ?
                  </span>
                  <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-72 rounded border bg-white p-2 text-xs text-slate-700 shadow-lg group-hover:block">
                    <p className="mb-1 font-medium">What is Identity?</p>
                    <p>
                      Identity shows how well Round understands each asset.
                      Basic = a starting point, Good = enough details for
                      comparisons, Strong = either a rich description or a link
                      to a catalog identity, making automated valuations more
                      reliable.
                    </p>
                  </div>
                </div>
              </th>
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
                      {asset.asset_type_id && (
                        <span className="text-[10px] uppercase tracking-wide text-emerald-700">
                          Catalog match
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
